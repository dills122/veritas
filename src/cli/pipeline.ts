import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  parseProjectConfig,
  parseWithSchema,
  parseYamlStrict,
} from '../config/parse.js';
import { lockSchema } from '../config/schemas.js';
import type { ProjectConfig, SourceDescriptor } from '../config/schemas.js';
import { compile } from '../compiler/index.js';
import { error, sortDiagnostics } from '../diagnostics/index.js';
import { canonicalJson, compareOrdinal, sha256 } from '../model/hash.js';
import { matchPattern } from '../model/paths.js';
import { LIMITS, OUTPUT_VERSION } from '../model/types.js';
import type {
  CompileResult,
  Diagnostic,
  NormalizedLibrary,
  ObservedFileState,
  Result,
  Snapshot,
  SourceLock,
} from '../model/types.js';
import { parseLibrary } from '../parsing/library.js';
import { createLocalSnapshot } from '../sources/local.js';
import { loadSnapshot } from '../sources/cache.js';
import { resolveGitSnapshot } from '../sources/git.js';
import { readObservedFile } from '../sync/observe.js';
import { assertNoIncompleteTransaction } from '../sync/lock.js';

export class CommandError extends Error {
  constructor(
    public readonly exitCode: 2 | 3 | 4 | 5,
    public readonly diagnostics: readonly Diagnostic[],
  ) {
    super(diagnostics[0]?.message ?? 'Command failed');
  }
}
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new CommandError(2, result.diagnostics);
  return result.value;
}
export async function projectRoot(explicit?: string): Promise<string> {
  if (explicit) return resolve(explicit);
  try {
    const { stdout } = await promisify(execFile)(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd: process.cwd(), timeout: 5000, maxBuffer: 4096 },
    );
    return resolve(stdout.trim());
  } catch {
    return process.cwd();
  }
}
export function decodeControl(bytes: Uint8Array, path: string): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    throw new CommandError(2, [
      error('UTF8_BOM_UNSUPPORTED', 'Remove the UTF-8 BOM', {
        id: path,
        path,
        line: 1,
        column: 1,
      }),
    ]);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CommandError(2, [
      error('UTF8_INVALID', 'Control file must contain valid UTF-8', {
        id: path,
        path,
      }),
    ]);
  }
}
export async function readControl(
  project: string,
  path: string,
  missingCode: 2 | 4 = 2,
): Promise<{ bytes: Uint8Array; state: ObservedFileState }> {
  const value = await readObservedFile(project, path);
  if (value.state.kind === 'unsafe')
    throw new CommandError(3, [
      error('CONTROL_UNSAFE', value.state.reason, { id: path, path }),
    ]);
  if (value.state.kind === 'missing' || !value.bytes)
    throw new CommandError(missingCode, [
      error(
        'CONTROL_MISSING',
        `Missing ${path}; initialize or restore the project`,
        { id: path, path },
      ),
    ]);
  if (value.state.executable)
    throw new CommandError(3, [
      error('CONTROL_UNSAFE', 'Control files must not be executable', {
        id: path,
        path,
      }),
    ]);
  return { bytes: value.bytes, state: value.state };
}
export async function readConfig(project: string) {
  const observed = await readControl(project, 'veritas.yaml');
  return {
    ...observed,
    config: unwrap(
      parseProjectConfig(decodeControl(observed.bytes, 'veritas.yaml')),
    ),
  };
}
export async function readLock(project: string) {
  const observed = await readControl(project, 'veritas.lock.json', 4);
  const text = decodeControl(observed.bytes, 'veritas.lock.json');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CommandError(2, [
      error('LOCK_INVALID', 'Lock is not valid JSON', {
        id: 'veritas.lock.json',
        path: 'veritas.lock.json',
      }),
    ]);
  }
  unwrap(parseYamlStrict(text, 'veritas.lock.json'));
  return {
    ...observed,
    lock: unwrap(parseWithSchema(value, lockSchema, 'veritas.lock.json', text)),
  };
}
export function sourceSelection(config: ProjectConfig): {
  namespace: string;
  descriptor: SourceDescriptor;
  profile: string;
} {
  const entry = Object.entries(config.sources)[0];
  if (!entry)
    throw new CommandError(2, [
      error('SOURCE_INVALID', 'Exactly one source is required'),
    ]);
  return {
    namespace: entry[0],
    descriptor: entry[1],
    profile: config.profile.split('/')[1] ?? '',
  };
}
export function descriptorDigest(config: ProjectConfig): string {
  return sha256(canonicalJson(config.sources));
}
export function makeLock(
  config: ProjectConfig,
  snapshot: Snapshot,
  resolvedCommit?: string,
): SourceLock {
  const { namespace, descriptor } = sourceSelection(config);
  return {
    schemaVersion: 1,
    source:
      'git' in descriptor
        ? {
            namespace,
            kind: 'git',
            requestedRef: descriptor.ref,
            ...(resolvedCommit ? { resolvedCommit } : {}),
            treeDigest: snapshot.treeDigest,
          }
        : { namespace, kind: 'local', treeDigest: snapshot.treeDigest },
    sourceDescriptorDigest: descriptorDigest(config),
    compiler: { outputVersion: OUTPUT_VERSION },
    profiles: [...config.targets].sort((a, b) => compareOrdinal(a.id, b.id)),
  };
}
export function assertLockMatches(
  config: ProjectConfig,
  lock: SourceLock,
): void {
  const { namespace, descriptor } = sourceSelection(config);
  const profiles = [...config.targets].sort((a, b) =>
    compareOrdinal(a.id, b.id),
  );
  if (
    lock.source.namespace !== namespace ||
    lock.source.kind !== ('git' in descriptor ? 'git' : 'local') ||
    lock.sourceDescriptorDigest !== descriptorDigest(config) ||
    lock.compiler.outputVersion !== OUTPUT_VERSION ||
    canonicalJson(
      [...lock.profiles].sort((a, b) => compareOrdinal(a.id, b.id)),
    ) !== canonicalJson(profiles)
  )
    throw new CommandError(2, [
      error(
        'LOCK_MISMATCH',
        'Configuration source or compiler profiles differ from the lock; run explicit update',
      ),
    ]);
}
export async function resolveSource(
  project: string,
  config: ProjectConfig,
  exactCommit?: string,
): Promise<{ snapshot: Snapshot; resolvedCommit?: string }> {
  const { descriptor } = sourceSelection(config);
  if ('path' in descriptor) {
    const sourceRoot = resolve(project, descriptor.path);
    const projectWithinSource = relative(sourceRoot, project);
    if (
      projectWithinSource === '' ||
      (projectWithinSource !== '..' &&
        !projectWithinSource.startsWith(`..${sep}`) &&
        !isAbsolute(projectWithinSource))
    )
      throw new CommandError(2, [
        error(
          'SOURCE_ROOT_CONTAINS_PROJECT',
          'Use a dedicated library directory that does not contain the consuming project or its runtime state',
          { id: 'veritas.yaml', path: 'veritas.yaml' },
        ),
      ]);
    return {
      snapshot: await createLocalSnapshot(sourceRoot),
    };
  }
  return resolveGitSnapshot(project, {
    git: descriptor.git,
    ref: exactCommit ?? descriptor.ref,
  });
}
async function patternWarnings(
  project: string,
  libraries: readonly NormalizedLibrary[],
): Promise<Diagnostic[]> {
  const rules = libraries
    .flatMap((library) => library.rules)
    .filter((rule) => rule.activation.mode === 'files');
  if (!rules.length) return [];
  const files: string[] = [],
    diagnostics: Diagnostic[] = [];
  let count = 0,
    truncated = false;
  async function walk(path: string, depth: number): Promise<void> {
    if (depth > LIMITS.depth || count >= LIMITS.entries) {
      truncated = true;
      return;
    }
    const names = await readdir(resolve(project, path));
    for (const name of names.sort(compareOrdinal)) {
      if (name === '.git' || name === 'node_modules' || name === '.veritas')
        continue;
      if (++count > LIMITS.entries) {
        truncated = true;
        break;
      }
      const relative = path ? `${path}/${name}` : name,
        state = await lstat(resolve(project, relative));
      if (state.isFile()) files.push(relative);
      else if (state.isDirectory() && !state.isSymbolicLink()) {
        try {
          await lstat(resolve(project, relative, '.git'));
        } catch (cause) {
          if (
            cause instanceof Error &&
            'code' in cause &&
            cause.code === 'ENOENT'
          )
            await walk(relative, depth + 1);
          else throw cause;
        }
      }
    }
  }
  await walk('', 0);
  if (truncated)
    diagnostics.push({
      code: 'PATTERN_INVENTORY_LIMIT',
      severity: 'warning',
      message:
        'Pattern preview inventory was bounded; harness matching still applies',
    });
  for (const rule of rules)
    if (
      rule.activation.mode === 'files' &&
      !rule.activation.patterns.some((pattern) =>
        files.some((file) => matchPattern(pattern, file)),
      )
    )
      diagnostics.push({
        code: 'PATTERN_NO_MATCH',
        severity: 'warning',
        message:
          'No current inventoried project file matches; future matching files retain the rule',
        source: rule.source,
      });
  return diagnostics;
}
export async function compileSnapshot(
  project: string,
  config: ProjectConfig,
  snapshot: Snapshot,
): Promise<CompileResult> {
  const selected = sourceSelection(config),
    libraries = [
      unwrap(parseLibrary(snapshot, selected.namespace, selected.profile)),
    ];
  let localDigest: string | undefined;
  if (config.local) {
    const local = await createLocalSnapshot(
      resolve(project, config.local.path),
    );
    localDigest = local.treeDigest;
    libraries.push(unwrap(parseLibrary(local, 'local', config.local.profile)));
  }
  const inputDigest = sha256(
    canonicalJson({
      upstream: snapshot.treeDigest,
      profile: config.profile,
      local: config.local
        ? { treeDigest: localDigest, profile: config.local.profile }
        : null,
      outputVersion: OUTPUT_VERSION,
      targets: [...config.targets].sort((a, b) => compareOrdinal(a.id, b.id)),
      adaptations: [...config.compatibility.adaptations].sort(
        (a, b) =>
          compareOrdinal(a.rule, b.rule) || compareOrdinal(a.target, b.target),
      ),
    }),
  );
  const result = compile({
    rules: libraries.flatMap((library) => library.rules),
    skills: libraries.flatMap((library) => library.skills),
    targets: config.targets,
    adaptations: config.compatibility.adaptations,
    inputDigest,
  });
  const diagnostics = sortDiagnostics([
    ...libraries.flatMap((library) => library.diagnostics),
    ...result.diagnostics,
    ...(await patternWarnings(project, libraries)),
  ]);
  if (diagnostics.some((item) => item.severity === 'error'))
    throw new CommandError(2, diagnostics);
  return { ...result, diagnostics };
}
export async function loadCompilation(
  project: string,
  underOwnLock = false,
): Promise<CompileResult> {
  if (!underOwnLock) await assertNoIncompleteTransaction(project);
  const { config } = await readConfig(project),
    { lock } = await readLock(project);
  assertLockMatches(config, lock);
  return compileSnapshot(
    project,
    config,
    await loadSnapshot(project, lock.source.treeDigest),
  );
}
