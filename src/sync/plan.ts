import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { manifestSchema } from '../config/schemas.js';
import { error, sortDiagnostics, VeritasError } from '../diagnostics/index.js';
import { canonicalJson, compareOrdinal, sha256 } from '../model/hash.js';
import type {
  CompileResult,
  Diagnostic,
  Manifest,
  ObservedFileState,
  Operation,
  WritePlan,
} from '../model/types.js';
import { LIMITS } from '../model/types.js';
import { createManifest } from './manifest.js';
import { equalState, observe, readObservedFile } from './observe.js';

const MANIFEST_PATH = '.veritas/manifest.json';
function diagnostic(
  code: string,
  message: string,
  path: string,
  severity: Diagnostic['severity'] = 'error',
  remediation?: string,
): Diagnostic {
  return {
    ...error(code, message, { id: path, path }),
    severity,
    ...(remediation ? { remediation } : {}),
  };
}
function fileState(file: {
  sha256: string;
  executable: boolean;
}): ObservedFileState {
  return { kind: 'file', sha256: file.sha256, executable: file.executable };
}

export async function inventoryGuidance(
  project: string,
  owned: ReadonlySet<string>,
  result: CompileResult,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const selected = new Set(result.profiles.map((profile) => profile.id));
  const shared = result.artifacts.some(
    (artifact) => artifact.path === 'AGENTS.md',
  );
  let entries = 0;
  async function walk(relative: string, depth: number): Promise<void> {
    if (depth > LIMITS.depth || entries > LIMITS.entries) return;
    const children = await readdir(join(project, relative));
    for (const name of children.sort(compareOrdinal)) {
      if (
        name.toLowerCase() === '.git' ||
        name === 'node_modules' ||
        (relative === '.veritas' && (name === 'runtime' || name === 'local'))
      )
        continue;
      const path = relative ? `${relative}/${name}` : name;
      if (++entries > LIMITS.entries) break;
      const state = await lstat(join(project, path));
      const guidance =
        /^(?:AGENTS(?:\.override)?|CLAUDE)\.md$/u.test(name) ||
        /^\.(?:claude\/rules|kiro\/steering)\/.+\.md$/u.test(path) ||
        /^\.(?:agents|claude|kiro)\/skills\/[^/]+\/SKILL\.md$/u.test(path) ||
        (state.isSymbolicLink() &&
          /^\.(?:(?:agents|claude|kiro)(?:\/skills(?:\/[^/]+)?)?|claude\/rules|kiro\/steering)$/u.test(
            path,
          ));
      if (guidance && !owned.has(path)) {
        const shadow =
          (path === 'AGENTS.override.md' && selected.has('codex') && shared) ||
          (path === '.claude/CLAUDE.md' && selected.has('claude'));
        diagnostics.push(
          diagnostic(
            shadow ? 'GUIDANCE_SHADOW' : 'GUIDANCE_UNMANAGED',
            shadow
              ? 'Existing guidance shadows a selected target baseline'
              : 'Additional unmanaged guidance limits loading certification; this file remains untouched',
            path,
            shadow ? 'error' : 'warning',
          ),
        );
      }
      if (state.isDirectory() && !state.isSymbolicLink()) {
        if (depth === LIMITS.depth)
          diagnostics.push(
            diagnostic(
              'GUIDANCE_INVENTORY_LIMIT',
              'Guidance inventory reached its directory depth limit',
              path,
              'warning',
            ),
          );
        else {
          try {
            await lstat(join(project, path, '.git'));
            diagnostics.push(
              diagnostic(
                'GUIDANCE_NESTED_REPOSITORY',
                'Nested repository guidance is outside this project inventory',
                path,
                'warning',
              ),
            );
          } catch (cause) {
            if (
              cause instanceof Error &&
              'code' in cause &&
              cause.code === 'ENOENT'
            )
              await walk(path, depth + 1);
            else throw cause;
          }
        }
      }
    }
  }
  try {
    await walk('', 0);
  } catch (cause) {
    throw new VeritasError(
      error(
        'GUIDANCE_INVENTORY_FAILED',
        `Cannot inventory repository guidance: ${cause instanceof Error ? cause.message : 'filesystem error'}`,
      ),
      4,
    );
  }
  if (entries > LIMITS.entries)
    diagnostics.push(
      diagnostic(
        'GUIDANCE_INVENTORY_LIMIT',
        'Guidance inventory reached its entry limit',
        '.',
        'warning',
      ),
    );
  return diagnostics;
}

/** Complete, read-only ownership comparison. This function never populates runtime/cache state. */
export async function plan(
  project: string,
  result: CompileResult,
): Promise<WritePlan> {
  const manifest = createManifest(result);
  const manifestBytes = Buffer.from(canonicalJson(manifest));
  const observedManifest = await readObservedFile(project, MANIFEST_PATH);
  const expectedManifest = observedManifest.state;
  const manifestChanged = !equalState(expectedManifest, {
    kind: 'file',
    sha256: sha256(manifestBytes),
    executable: false,
  });
  const diagnostics: Diagnostic[] = [...result.diagnostics];
  const operations: Operation[] = [];
  const finish = (): WritePlan => ({
    operations,
    diagnostics: sortDiagnostics(diagnostics),
    manifest,
    manifestBytes,
    expectedManifest,
    manifestChanged,
    hasDrift:
      manifestChanged ||
      operations.some((operation) => operation.kind !== 'unchanged'),
    hasConflicts:
      diagnostics.some((item) => item.severity === 'error') ||
      operations.some((operation) => operation.kind === 'conflict'),
  });
  // The fresh model is validated too: a caller cannot expand generated write authority.
  const desiredValidation = manifestSchema.safeParse(manifest);
  if (
    !desiredValidation.success ||
    result.artifacts.some(
      (artifact) => artifact.bytes.byteLength > LIMITS.assetBytes,
    ) ||
    result.artifacts.reduce(
      (sum, artifact) => sum + artifact.bytes.byteLength,
      0,
    ) > LIMITS.snapshotBytes
  ) {
    diagnostics.push(
      diagnostic(
        'OUTPUT_INVALID',
        'Compiled artifacts violate the output manifest contract',
        MANIFEST_PATH,
      ),
    );
    return finish();
  }
  let prior: Manifest | undefined;
  if (expectedManifest.kind === 'unsafe') {
    diagnostics.push(
      diagnostic('MANIFEST_UNSAFE', expectedManifest.reason, MANIFEST_PATH),
    );
    return finish();
  }
  if (expectedManifest.kind === 'file') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        observedManifest.bytes,
      );
      const value: unknown = JSON.parse(text);
      // JSON.parse accepts duplicate object keys; ownership authority must not.
      const document = parseDocument(text, { strict: true, uniqueKeys: true });
      if (document.errors.length || document.warnings.length)
        throw new Error(
          'Ownership manifest contains duplicate or invalid keys',
        );
      const parsed = manifestSchema.safeParse(value);
      if (!parsed.success)
        throw new Error(
          'Ownership manifest violates the strict versioned schema',
        );
      if (expectedManifest.executable)
        throw new Error('Ownership manifest must not be executable');
      prior = parsed.data;
    } catch {
      diagnostics.push(
        diagnostic(
          'MANIFEST_INVALID',
          'Ownership manifest is corrupt, unsupported or unsafe; preserve it for manual resolution',
          MANIFEST_PATH,
        ),
      );
      return finish();
    }
  }
  const desired = new Map(
    result.artifacts.map((artifact) => [artifact.path, artifact]),
  );
  const previous = new Map(
    prior?.artifacts.map((entry) => [entry.path, entry]) ?? [],
  );
  const paths = [...new Set([...desired.keys(), ...previous.keys()])].sort(
    compareOrdinal,
  );
  for (const path of paths) {
    const after = desired.get(path);
    const owned = previous.get(path);
    const current = await observe(project, path);
    let kind: Operation['kind'];
    if (current.kind === 'unsafe') kind = 'conflict';
    else if (!owned) kind = current.kind === 'missing' ? 'create' : 'conflict';
    else if (current.kind === 'missing') kind = after ? 'create' : 'unchanged';
    else if (!equalState(current, fileState(owned))) kind = 'conflict';
    else if (!after) kind = 'delete';
    else
      kind = equalState(current, {
        kind: 'file',
        sha256: sha256(after.bytes),
        executable: after.executable,
      })
        ? 'unchanged'
        : 'replace';
    operations.push({
      kind,
      path,
      expectedBefore: current,
      ...(after ? { after } : {}),
    });
    if (kind === 'conflict')
      diagnostics.push(
        diagnostic(
          'OUTPUT_CONFLICT',
          current.kind === 'unsafe'
            ? current.reason
            : owned
              ? 'Managed output was modified outside Veritas'
              : 'Existing output is unmanaged; move its content into canonical sources before generating',
          path,
          'error',
          current.kind === 'unsafe'
            ? 'Replace the link or special file with an ordinary file or remove it, then run plan.'
            : owned
              ? `Run \`veritas plan --diff\` or \`git diff -- ${path}\` to see the edit. Move wanted changes into your library or local additions; then delete or \`git checkout -- ${path}\` the file and run sync.`
              : `Copy wanted content into your library or local additions, then rename or remove ${path} and run sync. See docs/troubleshooting.md#output_conflict.`,
        ),
      );
  }
  diagnostics.push(
    ...(await inventoryGuidance(project, new Set(paths), result)),
  );
  return finish();
}
