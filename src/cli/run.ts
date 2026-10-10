import { execFile } from 'node:child_process';
import { rmdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Command, CommanderError } from 'commander';
import { relative, resolve, sep } from 'node:path';
import { stringify } from 'yaml';
import { VERSION } from '../index.js';
import { parseProjectConfig } from '../config/parse.js';
import { gitLocatorProblem } from '../config/schemas.js';
import { error, sortDiagnostics, VeritasError } from '../diagnostics/index.js';
import { canonicalJson, sha256 } from '../model/hash.js';
import type {
  CommandEnvelope,
  CompileResult,
  Diagnostic,
  WritePlan,
} from '../model/types.js';
import { storeSnapshot } from '../sources/cache.js';
import { apply } from '../sync/apply.js';
import { writeControls } from '../sync/control.js';
import { acquireLock, assertNoIncompleteTransaction } from '../sync/lock.js';
import type { LockLease } from '../sync/lock.js';
import { observe, readObservedFile } from '../sync/observe.js';
import { inventoryGuidance, plan } from '../sync/plan.js';
import { recover } from '../sync/recover.js';
import {
  assertLockMatches,
  CommandError,
  compileSnapshot,
  loadCompilation,
  makeLock,
  projectRoot,
  readConfig,
  readLock,
  resolveSource,
  unwrap,
} from './pipeline.js';
import { adopt, manifestOwnedPaths } from './adopt.js';
import { unifiedDiff } from './diff.js';
import {
  checkInitArguments,
  createScaffold,
  SCAFFOLD_PROFILE,
} from './scaffold.js';
import { humanPlan, planSummary } from './human.js';

type Options = {
  project?: string;
  json?: boolean;
  source?: string;
  profile?: string;
  targets?: string;
  ref?: string;
  local?: string;
  localProfile?: string;
  restore?: boolean;
  diff?: boolean;
  scaffold?: string | boolean;
  adoptPath?: string;
  id?: string;
  description?: string;
};
type Outcome = {
  exitCode: number;
  diagnostics: readonly Diagnostic[];
  data: unknown;
  human?: readonly string[];
};
const outcomes: Record<number, CommandEnvelope['outcome']> = {
  0: 'success',
  1: 'drift',
  2: 'invalid',
  3: 'conflict',
  4: 'operational',
  5: 'busy',
};
function artifactData(result: CompileResult) {
  return {
    inputDigest: result.inputDigest,
    profiles: result.profiles,
    adaptations: result.adaptations,
    compatibility: result.compatibility,
    loading: result.loading,
    artifacts: result.artifacts.map((file) => ({
      path: file.path,
      sha256: sha256(file.bytes),
      size: file.bytes.byteLength,
      executable: file.executable,
      sourceIds: file.sourceIds,
      consumers: file.consumers,
    })),
  };
}
function planData(
  value: WritePlan,
  diffs: ReadonlyMap<string, string> = new Map(),
) {
  return {
    hasDrift: value.hasDrift,
    hasConflicts: value.hasConflicts,
    manifestChanged: value.manifestChanged,
    manifest: value.manifest,
    operations: value.operations.map((operation) => ({
      kind: operation.kind,
      path: operation.path,
      expectedBefore: operation.expectedBefore,
      ...(diffs.has(operation.path) ? { diff: diffs.get(operation.path) } : {}),
      ...(operation.after
        ? {
            after: {
              sha256: sha256(operation.after.bytes),
              executable: operation.after.executable,
              sourceIds: operation.after.sourceIds,
              consumers: operation.after.consumers,
            },
          }
        : {}),
    })),
  };
}
/** Warn only when Git positively reports the machine-local runtime directory as not ignored. */
async function runtimeIgnoreWarnings(project: string): Promise<Diagnostic[]> {
  try {
    await promisify(execFile)(
      'git',
      ['check-ignore', '-q', '--', '.veritas/runtime'],
      { cwd: project, timeout: 5000 },
    );
    return [];
  } catch (cause) {
    if (
      typeof cause !== 'object' ||
      cause === null ||
      !('code' in cause) ||
      cause.code !== 1
    )
      return [];
    return [
      {
        ...error(
          'RUNTIME_NOT_IGNORED',
          '.veritas/runtime/ is not ignored by Git; it holds machine-local cache and recovery state',
        ),
        severity: 'warning',
        remediation:
          "Add '.veritas/runtime/' to .gitignore. Commit veritas.yaml, veritas.lock.json, .veritas/manifest.json and generated files.",
      },
    ];
  }
}
/** A failed init must not leave empty runtime directories; non-recursive so real state is never removed. */
async function removeEmptyRuntime(project: string): Promise<void> {
  for (const path of ['.veritas/runtime', '.veritas']) {
    try {
      await rmdir(resolve(project, path));
    } catch {
      return;
    }
  }
}
/** Diff from disk to generated content for replace and conflicting operations that have a readable file. */
async function planDiffs(
  project: string,
  value: WritePlan,
): Promise<Map<string, string>> {
  const diffs = new Map<string, string>();
  for (const operation of value.operations) {
    if (
      (operation.kind !== 'replace' && operation.kind !== 'conflict') ||
      !operation.after
    )
      continue;
    const read = await readObservedFile(project, operation.path);
    if (read.state.kind === 'file' && read.bytes)
      diffs.set(
        operation.path,
        unifiedDiff(operation.path, read.bytes, operation.after.bytes),
      );
  }
  return diffs;
}
async function initialize(
  project: string,
  options: Options,
  lease: LockLease,
): Promise<Outcome> {
  const expectedConfig = await observe(project, 'veritas.yaml'),
    expectedLock = await observe(project, 'veritas.lock.json');
  if (expectedConfig.kind !== 'missing' || expectedLock.kind !== 'missing')
    throw new CommandError(3, [
      error(
        'INIT_CONFLICT',
        'Init requires absent config and lock; existing controls remain untouched',
      ),
    ]);
  const source = options.source ?? '',
    isGit = !gitLocatorProblem(source) || source.includes('://');
  if (isGit && !options.ref)
    throw new CommandError(2, [
      error(
        'SOURCE_REF_REQUIRED',
        'Git initialization requires an explicit --ref',
      ),
    ]);
  if (!isGit && options.ref)
    throw new CommandError(2, [
      error('SOURCE_REF_INVALID', '--ref applies only to Git sources'),
    ]);
  const profile = options.profile ?? '',
    namespace = profile.split('/')[0] ?? '';
  const descriptor = isGit
    ? { git: source, ref: options.ref ?? '' }
    : {
        path:
          relative(project, resolve(project, source)).split(sep).join('/') ||
          '.',
      };
  const configText = stringify({
    schemaVersion: 1,
    sources: { [namespace]: descriptor },
    profile,
    targets: (options.targets ?? '').split(',').map((id) => ({
      id,
      profile:
        id === 'codex'
          ? 'codex-repo-v1'
          : id === 'claude'
            ? 'claude-repo-v1'
            : `${id}-repo-v1`,
    })),
    ...(options.local
      ? {
          local: {
            path: options.local,
            profile: options.localProfile ?? 'project',
          },
        }
      : {}),
    compatibility: { adaptations: [] },
  });
  const config = unwrap(parseProjectConfig(configText)),
    resolved = await resolveSource(project, config),
    compiled = await compileSnapshot(project, config, resolved.snapshot);
  const lock = makeLock(config, resolved.snapshot, resolved.resolvedCommit);
  const preview = await plan(project, compiled);
  const guidance = (
    await inventoryGuidance(
      project,
      await manifestOwnedPaths(project),
      compiled,
    )
  ).map((diagnostic) => ({
    ...diagnostic,
    outputCollision: preview.operations.some(
      (operation) =>
        operation.kind === 'conflict' &&
        operation.path === diagnostic.source?.path,
    ),
  }));
  await storeSnapshot(project, resolved.snapshot);
  const ignoreWarnings = await runtimeIgnoreWarnings(project);
  await writeControls(
    project,
    'init',
    [
      {
        path: 'veritas.yaml',
        bytes: Buffer.from(configText),
        expectedBefore: expectedConfig,
      },
      {
        path: 'veritas.lock.json',
        bytes: Buffer.from(canonicalJson(lock)),
        expectedBefore: expectedLock,
      },
    ],
    { lease },
  );
  return {
    exitCode: 0,
    diagnostics: [
      ...compiled.diagnostics,
      ...guidance.filter((diagnostic) => diagnostic.severity === 'warning'),
      ...ignoreWarnings,
      ...(preview.hasConflicts
        ? [
            {
              ...error(
                'INIT_GENERATION_CONFLICT',
                'Initialized controls; review the inventory and generation preview before sync',
              ),
              severity: 'warning' as const,
            },
          ]
        : []),
    ],
    data: {
      lock,
      ...artifactData(compiled),
      guidance: { entries: guidance, generationBlocked: preview.hasConflicts },
      generationPreview: planData(preview),
    },
    human: [
      'Initialized veritas.yaml and veritas.lock.json; guidance has not been generated.',
      `Source: ${lock.source.namespace} (${lock.source.kind}), snapshot ${lock.source.treeDigest.slice(0, 12)}.`,
      planSummary(preview),
      ...(preview.hasConflicts
        ? [
            'Generation blocked: existing files collide with generated output. Run plan to list them.',
            'Veritas never overwrites unmanaged files. Move wanted content into your library or local additions, then remove the original. See docs/troubleshooting.md#output_conflict.',
          ]
        : ['Next: run validate, then plan, sync and check.']),
    ],
  };
}
async function update(
  project: string,
  options: Options,
  lease: LockLease,
): Promise<Outcome> {
  const configRead = await readConfig(project),
    lockRead = await readLock(project);
  const { config } = configRead,
    { lock } = lockRead;
  if (options.restore) assertLockMatches(config, lock);
  const resolved = await resolveSource(
    project,
    config,
    options.restore && lock.source.kind === 'git'
      ? lock.source.resolvedCommit
      : undefined,
  );
  if (
    options.restore &&
    (resolved.snapshot.treeDigest !== lock.source.treeDigest ||
      (lock.source.kind === 'git' &&
        resolved.resolvedCommit !== lock.source.resolvedCommit))
  )
    throw new CommandError(4, [
      error(
        'RESTORE_MISMATCH',
        'Source does not match the exact locked snapshot; intentional update is required',
      ),
    ]);
  if (options.restore) {
    await storeSnapshot(project, resolved.snapshot);
    return {
      exitCode: 0,
      diagnostics: [],
      data: { restored: true, source: lock.source },
      human: [
        `Restored locked snapshot ${lock.source.treeDigest.slice(0, 12)} for ${lock.source.namespace}; veritas.lock.json is unchanged.`,
      ],
    };
  }
  const compiled = await compileSnapshot(project, config, resolved.snapshot),
    next = makeLock(config, resolved.snapshot, resolved.resolvedCommit);
  await storeSnapshot(project, resolved.snapshot);
  await writeControls(
    project,
    'update',
    [
      {
        path: 'veritas.lock.json',
        bytes: Buffer.from(canonicalJson(next)),
        expectedBefore: lockRead.state,
      },
    ],
    {
      lease,
      preconditions: [
        { path: 'veritas.yaml', expectedBefore: configRead.state },
      ],
    },
  );
  return {
    exitCode: 0,
    diagnostics: compiled.diagnostics,
    data: { before: lock.source, after: next.source, generationPending: true },
    human: [
      `Source ${next.source.namespace}: ${lock.source.treeDigest.slice(0, 12)} -> ${next.source.treeDigest.slice(0, 12)}.`,
      'Generated files are unchanged. Next: run plan, then sync.',
    ],
  };
}
async function execute(
  command: string,
  project: string,
  options: Options,
): Promise<Outcome> {
  if (command === 'init' || command === 'update' || command === 'adopt') {
    await assertNoIncompleteTransaction(project);
    const lease = await acquireLock(project);
    let failed = false;
    try {
      await assertNoIncompleteTransaction(project, lease);
      if (command === 'update') return await update(project, options, lease);
      if (command === 'adopt') {
        const result = await adopt(project, {
          path: options.adoptPath ?? '',
          ...(options.id ? { id: options.id } : {}),
          ...(options.description ? { description: options.description } : {}),
          ...(options.targets ? { targets: options.targets } : {}),
        });
        return {
          exitCode: 0,
          diagnostics: result.diagnostics,
          data: result.data,
          human: result.human,
        };
      }
      checkInitArguments(options);
      if (options.scaffold === undefined)
        return await initialize(project, options, lease);
      const scaffold = await createScaffold(project, options.scaffold);
      try {
        const outcome = await initialize(
          project,
          {
            ...options,
            source: scaffold.directory,
            profile: SCAFFOLD_PROFILE,
          },
          lease,
        );
        return {
          ...outcome,
          data: {
            ...(outcome.data as object),
            scaffold: { directory: scaffold.directory, files: scaffold.files },
          },
          human: [
            `Created a starter library in ${scaffold.directory}. Edit ${scaffold.directory}/steering/project-guidance.md to set your guidance.`,
            ...(outcome.human ?? []),
          ],
        };
      } catch (cause) {
        await scaffold.rollback();
        throw cause;
      }
    } catch (cause) {
      failed = true;
      throw cause;
    } finally {
      await lease.release();
      if (failed && command === 'init') await removeEmptyRuntime(project);
    }
  }
  if (command === 'recover') {
    const result = await recover(project);
    return {
      exitCode: 0,
      diagnostics: [],
      data: result,
      human: [
        result.action === 'none'
          ? 'No interrupted transaction requires recovery.'
          : result.action === 'rollback'
            ? `Rolled back the interrupted ${result.kind ?? 'write'} transaction.`
            : `Cleaned up the committed ${result.kind ?? 'write'} transaction.`,
      ],
    };
  }
  if (command === 'validate') {
    const result = await loadCompilation(project);
    return {
      exitCode: 0,
      diagnostics: result.diagnostics,
      data: artifactData(result),
      human: [
        `Validated ${result.artifacts.length} artifacts for ${result.profiles.map((profile) => profile.id).join(', ')}.`,
      ],
    };
  }
  if (command === 'sync') {
    let attemptedPlan: WritePlan | undefined;
    try {
      const value = await apply(project, async () => {
        attemptedPlan = await plan(
          project,
          await loadCompilation(project, true),
        );
        return attemptedPlan;
      });
      return {
        exitCode: 0,
        diagnostics: value.diagnostics,
        data: planData(value),
        human: humanPlan('sync', value),
      };
    } catch (cause) {
      if (
        cause instanceof VeritasError &&
        cause.diagnostic.code === 'PLAN_CONFLICT' &&
        attemptedPlan
      )
        return {
          exitCode: cause.exitCode,
          diagnostics: [
            ...attemptedPlan.diagnostics,
            {
              ...cause.diagnostic,
              remediation:
                'Run veritas plan for this project to inspect and resolve the conflicts.',
            },
          ],
          data: planData(attemptedPlan),
          human: humanPlan('sync', attemptedPlan),
        };
      throw cause;
    }
  }
  const value = await plan(project, await loadCompilation(project));
  const diffs = options.diff ? await planDiffs(project, value) : new Map();
  return {
    exitCode: value.hasConflicts
      ? 3
      : command === 'check' && value.hasDrift
        ? 1
        : 0,
    diagnostics: value.diagnostics,
    data: planData(value, diffs),
    human: humanPlan(command === 'check' ? 'check' : 'plan', value, diffs),
  };
}
export async function run(args: readonly string[]): Promise<number> {
  const json = args.includes('--json');
  let command = 'unknown',
    outcome: Outcome | undefined;
  const program = new Command()
    .name('veritas')
    .description('Compile and synchronize versioned agent steering and skills')
    .version(VERSION)
    .option('--project <path>', 'Explicit project root')
    .option('--json', 'Emit one stable JSON result')
    .configureHelp({ showGlobalOptions: true })
    .addHelpText(
      'after',
      `
Workflow: init -> validate -> plan -> sync -> check
Example:
  veritas init --project ./project --source ../library --profile company/baseline --targets codex,claude,kiro-ide
  veritas plan --project ./project
  veritas sync --project ./project
  veritas check --project ./project

No shared library yet? veritas init --scaffold --targets codex,claude. Existing AGENTS.md or rules? veritas adopt <path>.
Target IDs: codex, claude, kiro-ide, kiro-cli.
Init requires a source, qualified library profile and targets; there are no defaults.
Project selection defaults to the current Git root, then cwd. Use an existing directory.
Routine commands use the locked cache. Only init/update resolve upstream content.
Exit codes: 0 success, 1 check drift, 2 invalid, 3 conflict, 4 operational, 5 busy/incomplete.
Profiles are documentation-based; live harness loading remains unverified.
Stuck? Every error carries a code and a fix hint; see docs/troubleshooting.md (also in the installed package).`,
    )
    .exitOverride();
  program.configureOutput({
    writeErr: () => {
      /* Parse errors are rendered once below. */
    },
  });
  for (const [name, description] of [
    [
      'init',
      'Initialize config, source lock and cache without generating guidance',
    ],
    [
      'validate',
      'Validate locked content, capabilities and target composition',
    ],
    ['plan', 'Preview changed paths and ownership conflicts without writing'],
    [
      'sync',
      'Apply a complete conflict-free plan, or leave all outputs untouched',
    ],
    [
      'check',
      'Check output and manifest drift without writing (exit 1 for drift)',
    ],
    [
      'update',
      'Resolve the configured upstream source; leave guidance for a later sync',
    ],
    ['recover', 'Safely roll back or clean up an interrupted transaction'],
  ] as const) {
    const child = program.command(name).description(description);
    if (name === 'init')
      child
        .option(
          '--source <locator>',
          'Local library directory (relative or absolute) or HTTPS/SSH Git URL',
        )
        .option(
          '--profile <selection>',
          'Qualified namespace/profile selection',
        )
        .option(
          '--scaffold [dir]',
          'Create a starter library (default .veritas/library) and use it as the source',
        )
        .requiredOption(
          '--targets <ids>',
          'Comma-separated codex, claude, kiro-ide, kiro-cli (required; no default)',
        )
        .option(
          '--ref <ref>',
          'Git branch, tag or commit (required for Git sources)',
        )
        .option('--local <path>', 'Project local library')
        .option('--local-profile <id>', 'Local profile', 'project');
    if (name === 'plan' || name === 'check')
      child.option(
        '--diff',
        'Show a unified diff from each file on disk to the generated content',
      );
    if (name === 'update')
      child.option(
        '--restore',
        'Restore exact locked cache without changing lock',
      );
    child.action(async (_options: unknown, parsed: Command) => {
      command = name;
      const options = parsed.optsWithGlobals<Options>();
      outcome = await execute(
        name,
        await projectRoot(options.project),
        options,
      );
    });
  }
  program
    .command('adopt')
    .description(
      'Copy existing guidance (file or skill directory) into the project library; never touches the original',
    )
    .argument(
      '<path>',
      'Existing steering file or skill directory in the project',
    )
    .option('--id <id>', 'Name for the new steering rule or skill')
    .option('--description <text>', 'Rule description (default: from the file)')
    .option(
      '--targets <ids>',
      'Restrict the rule to these targets (default: those that support its activation mode)',
    )
    .action(async (path: string, _options: unknown, parsed: Command) => {
      command = 'adopt';
      const options = { ...parsed.optsWithGlobals<Options>(), adoptPath: path };
      outcome = await execute(
        'adopt',
        await projectRoot(options.project),
        options,
      );
    });
  try {
    if (!args.length) {
      program.outputHelp();
      return 0;
    }
    await program.parseAsync([...args], { from: 'user' });
  } catch (cause) {
    if (cause instanceof CommanderError) {
      if (cause.exitCode === 0) return 0;
      outcome = {
        exitCode: 2,
        diagnostics: [error('CLI_ARGUMENT_INVALID', cause.message)],
        data: null,
      };
    } else if (cause instanceof CommandError)
      outcome = {
        exitCode: cause.exitCode,
        diagnostics: cause.diagnostics,
        data: null,
      };
    else if (cause instanceof VeritasError)
      outcome = {
        exitCode: cause.exitCode,
        diagnostics: [cause.diagnostic],
        data: null,
      };
    else
      outcome = {
        exitCode: 4,
        diagnostics: [
          error(
            'OPERATION_FAILED',
            cause instanceof Error
              ? cause.message
              : 'Unexpected operational failure',
          ),
        ],
        data: null,
      };
  }
  if (!outcome) return 0;
  const diagnostics = sortDiagnostics(outcome.diagnostics);
  const envelope: CommandEnvelope = {
    schemaVersion: 1,
    command,
    outcome: outcomes[outcome.exitCode] ?? 'operational',
    diagnostics,
    data: outcome.data,
  };
  if (json) process.stdout.write(canonicalJson(envelope));
  else {
    for (const item of diagnostics)
      process.stderr.write(
        `${item.severity} ${item.code}${item.source ? ` ${item.source.path}${item.source.line ? `:${item.source.line}:${item.source.column ?? 1}` : ''}` : ''}: ${item.message}\n${item.remediation ? `  ${item.remediation}\n` : ''}`,
      );
    process.stdout.write(
      `${command === 'unknown' ? 'veritas' : command}: ${envelope.outcome}\n`,
    );
    if (outcome.human?.length)
      process.stdout.write(`${outcome.human.join('\n')}\n`);
  }
  return outcome.exitCode;
}
