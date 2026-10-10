import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gitLocatorProblem } from '../config/schemas.js';
import { VeritasError } from '../diagnostics/index.js';
import { treeDigest } from '../model/hash.js';
import { pathProblem, pathsProblem } from '../model/paths.js';
import { LIMITS, type FileEntry, type Snapshot } from '../model/types.js';
import { createGitRunner, type GitRunner } from './git-runner.js';
import {
  safeDirectoryAncestors,
  sourceError,
  validateSnapshot,
} from './snapshot.js';

const objectPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
type TreeBlob = {
  path: string;
  object: string;
  size: number;
  executable: boolean;
};

function refProblem(ref: string): boolean {
  return (
    !ref ||
    ref.length > 1024 ||
    ref.startsWith('-') ||
    Array.from(ref).some((char) => {
      const code = char.charCodeAt(0);
      return code <= 32 || code === 127;
    }) ||
    [':', '*', '?', '~', '^', '[', ']', '\\'].some((char) =>
      ref.includes(char),
    ) ||
    ref.includes('..') ||
    ref.includes('@{') ||
    ref === '@' ||
    ref
      .split('/')
      .some(
        (part) =>
          !part ||
          part.startsWith('.') ||
          part.endsWith('.') ||
          part.endsWith('.lock'),
      )
  );
}

function text(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder('utf8', { fatal: true }).decode(bytes);
  } catch {
    throw sourceError(
      'GIT_OUTPUT_INVALID',
      path,
      'Git returned invalid UTF-8 metadata',
    );
  }
}

function selectRef(
  output: Uint8Array,
  ref: string,
): { object: string; format: 'sha1' | 'sha256' } {
  const records = text(output, 'refs').trim().split('\n').filter(Boolean);
  const refs = new Map<string, string>(),
    widths = new Set<number>();
  if (records.length > LIMITS.entries)
    throw sourceError(
      'GIT_OUTPUT_LIMIT',
      'refs',
      'Git returned too many references',
    );
  for (const record of records) {
    const match = /^([a-f0-9]{40}|[a-f0-9]{64})\t([^\t\r\n]+)$/u.exec(record);
    const object = match?.[1],
      name = match?.[2];
    if (!object || !name || refs.has(name))
      throw sourceError(
        'GIT_OUTPUT_INVALID',
        'refs',
        'Git returned malformed references',
      );
    refs.set(name, object);
    widths.add(object.length);
  }
  let object: string | undefined;
  if (objectPattern.test(ref)) {
    object = ref;
    widths.add(ref.length);
  } else {
    const names =
      ref === 'HEAD' || ref.startsWith('refs/')
        ? [ref]
        : [`refs/heads/${ref}`, `refs/tags/${ref}`];
    const selected = names
      .map((name) => refs.get(name))
      .filter((value): value is string => value !== undefined);
    if (selected.length > 1)
      throw sourceError(
        'GIT_REF_AMBIGUOUS',
        'refs',
        'Reference is both a branch and tag; use a fully qualified ref',
      );
    object = selected[0];
  }
  if (!object)
    throw sourceError(
      'GIT_REF_MISSING',
      'refs',
      'Requested Git reference is unavailable',
    );
  if (widths.size !== 1)
    throw sourceError(
      'GIT_OUTPUT_INVALID',
      'refs',
      'Git object formats disagree',
    );
  return { object, format: object.length === 64 ? 'sha256' : 'sha1' };
}

function parseTree(output: Uint8Array, width: number): TreeBlob[] {
  const metadata = text(output, 'tree');
  if (metadata && !metadata.endsWith('\0'))
    throw sourceError(
      'GIT_OUTPUT_INVALID',
      'tree',
      'Git tree metadata is truncated',
    );
  const records = metadata.split('\0').filter(Boolean);
  if (records.length > LIMITS.entries)
    throw sourceError(
      'SOURCE_LIMIT',
      'tree',
      'Git tree exceeds the entry limit',
    );
  const seen = new Set<string>(),
    files: TreeBlob[] = [];
  let total = 0;
  for (const record of records) {
    const match =
      /^(\d{6}) (blob|tree|commit) ([a-f0-9]{40}|[a-f0-9]{64}) +(-|\d+)\t(.+)$/u.exec(
        record,
      );
    const mode = match?.[1],
      kind = match?.[2],
      object = match?.[3],
      sizeText = match?.[4],
      path = match?.[5];
    if (
      !mode ||
      !kind ||
      !object ||
      !sizeText ||
      !path ||
      object.length !== width
    )
      throw sourceError(
        'GIT_OUTPUT_INVALID',
        'tree',
        'Git returned malformed tree metadata',
      );
    const problem = pathProblem(path),
      key = path.toLowerCase();
    if (problem || seen.has(key))
      throw sourceError(
        'SOURCE_UNSAFE_PATH',
        path,
        problem ?? 'Case-colliding Git tree paths',
      );
    seen.add(key);
    if (path.split('/').length - (kind === 'tree' ? 0 : 1) > LIMITS.depth)
      throw sourceError(
        'SOURCE_LIMIT',
        path,
        'Git tree exceeds the directory depth limit',
      );
    if (kind === 'tree' && mode === '040000' && sizeText === '-') continue;
    if (kind !== 'blob' || (mode !== '100644' && mode !== '100755'))
      throw sourceError(
        'SOURCE_UNSAFE_ENTRY',
        path,
        'Git trees must contain ordinary files; symlinks and submodules are unsupported',
      );
    const size = Number(sizeText);
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > LIMITS.assetBytes ||
      (total += size) > LIMITS.snapshotBytes
    )
      throw sourceError(
        'SOURCE_LIMIT',
        path,
        'Git tree exceeds asset or total byte limits',
      );
    files.push({ path, object, size, executable: mode === '100755' });
  }
  const problem = pathsProblem(files.map((file) => file.path));
  if (problem) throw sourceError('SOURCE_UNSAFE_PATH', 'tree', problem);
  return files;
}

function extractBlobs(
  output: Uint8Array,
  blobs: readonly TreeBlob[],
): FileEntry[] {
  let position = 0;
  const files: FileEntry[] = [];
  for (const blob of blobs) {
    const end = output.indexOf(10, position);
    if (end === -1)
      throw sourceError(
        'GIT_OUTPUT_INVALID',
        blob.path,
        'Git blob stream is truncated',
      );
    const header = text(output.subarray(position, end), blob.path);
    if (header !== `${blob.object} blob ${blob.size}`)
      throw sourceError(
        'GIT_OUTPUT_INVALID',
        blob.path,
        'Git blob metadata disagrees with the tree',
      );
    position = end + 1;
    if (
      position + blob.size >= output.byteLength ||
      output[position + blob.size] !== 10
    )
      throw sourceError(
        'GIT_OUTPUT_INVALID',
        blob.path,
        'Git blob stream is truncated',
      );
    const bytes = Uint8Array.from(
      output.subarray(position, position + blob.size),
    );
    position += blob.size + 1;
    if (
      /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n/u.test(
        new TextDecoder().decode(bytes.subarray(0, 256)),
      )
    )
      throw sourceError(
        'GIT_LFS_POINTER',
        blob.path,
        'Git LFS payload is unavailable; pointer files are unsupported',
      );
    files.push({ path: blob.path, bytes, executable: blob.executable });
  }
  if (position !== output.byteLength)
    throw sourceError(
      'GIT_OUTPUT_INVALID',
      'blobs',
      'Git returned unexpected trailing blob data',
    );
  return files;
}

async function createRuntime(project: string): Promise<string> {
  let current = resolve(project);
  await safeDirectoryAncestors(current);
  for (const part of ['.veritas', 'runtime', 'git']) {
    current = join(current, part);
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (cause: unknown) {
      if (!(
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        cause.code === 'EEXIST'
      ))
        throw cause;
    }
    await safeDirectoryAncestors(current);
  }
  return current;
}

/** Fetches only during explicit resolution. The caller decides whether to store/repin/restore. */
export async function resolveGitSnapshot(
  project: string,
  descriptor: { git: string; ref: string },
  options: { runner?: GitRunner } = {},
): Promise<{ snapshot: Snapshot; resolvedCommit: string }> {
  const problem = gitLocatorProblem(descriptor.git);
  if (problem) throw sourceError('GIT_INVALID_LOCATOR', 'source', problem);
  if (refProblem(descriptor.ref))
    throw sourceError(
      'GIT_INVALID_REF',
      'source',
      'Git ref must be a safe branch, tag, fully qualified ref or complete object ID',
    );
  const runner = options.runner ?? createGitRunner();
  let stage: string | undefined;
  let result: { snapshot: Snapshot; resolvedCommit: string } | undefined;
  let failure: VeritasError | undefined;
  try {
    const runtime = await createRuntime(project);
    stage = await mkdtemp(join(runtime, 'resolve-'));
    const hooks = join(stage, 'disabled-hooks');
    await mkdir(hooks, { mode: 0o700 });
    const repository = join(stage, 'repository.git');
    const prefix = [
      '-c',
      `core.hooksPath=${hooks}`,
      '-c',
      'protocol.allow=never',
      '-c',
      'protocol.https.allow=always',
      '-c',
      'protocol.ssh.allow=always',
      '-c',
      'fetch.recurseSubmodules=false',
      '-c',
      'submodule.recurse=false',
      '-c',
      'gc.auto=0',
      '-c',
      'maintenance.auto=false',
      '-c',
      'fetch.fsckObjects=true',
    ];
    const cwd = stage;
    async function run(
      args: readonly string[],
      maxOutputBytes: number,
      input?: Uint8Array,
    ): Promise<Uint8Array> {
      const output = await runner([...prefix, ...args], {
        cwd,
        timeoutMs: 30_000,
        maxOutputBytes,
        ...(input ? { input } : {}),
      });
      if (!(output instanceof Uint8Array) || output.byteLength > maxOutputBytes)
        throw sourceError(
          'GIT_OUTPUT_LIMIT',
          'command',
          'Git output exceeds the configured byte limit',
        );
      return output;
    }
    const patterns =
      descriptor.ref === 'HEAD' || descriptor.ref.startsWith('refs/')
        ? [descriptor.ref]
        : objectPattern.test(descriptor.ref)
          ? []
          : [`refs/heads/${descriptor.ref}`, `refs/tags/${descriptor.ref}`];
    const selection = selectRef(
      await run(
        ['ls-remote', '--', descriptor.git, 'HEAD', ...patterns],
        LIMITS.configBytes,
      ),
      descriptor.ref,
    );
    await run(
      [
        'init',
        '--quiet',
        '--bare',
        '--template=',
        `--object-format=${selection.format}`,
        repository,
      ],
      4096,
    );
    const at = ['--git-dir', repository];
    await run(
      [
        ...at,
        'fetch',
        '--quiet',
        '--depth=1',
        '--no-tags',
        '--no-recurse-submodules',
        '--',
        descriptor.git,
        selection.object,
      ],
      LIMITS.configBytes,
    );
    const resolvedCommit = text(
      await run([...at, 'rev-parse', '--verify', 'FETCH_HEAD^{commit}'], 256),
      'commit',
    ).trim();
    if (
      !objectPattern.test(resolvedCommit) ||
      resolvedCommit.length !== selection.object.length
    )
      throw sourceError(
        'GIT_OUTPUT_INVALID',
        'commit',
        'Git returned an invalid commit identity',
      );
    const blobs = parseTree(
      await run(
        [
          ...at,
          'ls-tree',
          '--full-tree',
          '-r',
          '-t',
          '-l',
          '-z',
          resolvedCommit,
        ],
        LIMITS.entries * 4096,
      ),
      resolvedCommit.length,
    );
    const input = new TextEncoder().encode(
      blobs.map((blob) => blob.object + '\n').join(''),
    );
    const expectedBytes = blobs.reduce(
      (total, blob) =>
        total + blob.size + blob.object.length + String(blob.size).length + 8,
      0,
    );
    const output = blobs.length
      ? await run(
          [...at, 'cat-file', '--batch'],
          Math.max(1, expectedBytes),
          input,
        )
      : new Uint8Array();
    const files = extractBlobs(output, blobs);
    const snapshot = validateSnapshot({ treeDigest: treeDigest(files), files });
    result = { snapshot, resolvedCommit };
  } catch (cause: unknown) {
    failure =
      cause instanceof VeritasError
        ? cause
        : sourceError('GIT_FAILED', 'source', 'Git source resolution failed');
  } finally {
    if (stage !== undefined) {
      try {
        await rm(stage, { recursive: true, force: true });
      } catch {
        failure ??= sourceError(
          'GIT_CLEANUP_FAILED',
          'runtime',
          'Git temporary repository cleanup failed',
        );
      }
    }
  }
  if (failure) throw failure;
  if (!result)
    throw sourceError('GIT_FAILED', 'source', 'Git source resolution failed');
  return result;
}
