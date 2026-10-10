import { constants, type Stats } from 'node:fs';
import { lstat, open, opendir } from 'node:fs/promises';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { z } from 'zod';
import { error, VeritasError } from '../diagnostics/index.js';
import { compareOrdinal, treeDigest } from '../model/hash.js';
import { pathProblem, pathsProblem } from '../model/paths.js';
import { LIMITS, type FileEntry, type Snapshot } from '../model/types.js';

export function sourceError(
  code: string,
  path: string,
  message: string,
  remediation?: string,
): VeritasError {
  return new VeritasError(
    {
      ...error(code, message, { id: 'source', path }),
      ...(remediation ? { remediation } : {}),
    },
    4,
  );
}

export function filesystemFailure(
  cause: unknown,
  path: string,
  code = 'SOURCE_READ_FAILED',
): VeritasError {
  if (cause instanceof VeritasError) return cause;
  const errno =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? cause.code
      : undefined;
  if (errno === 'ENOENT')
    return sourceError(
      code,
      path,
      'Source directory does not exist',
      'Local source paths resolve from the project directory; check --source (or sources in veritas.yaml).',
    );
  if (errno === 'ENOTDIR')
    return sourceError(
      code,
      path,
      'Source path is not a directory',
      'Point --source at the library directory that contains veritas.library.yaml.',
    );
  if (errno === 'EACCES' || errno === 'EPERM')
    return sourceError(
      code,
      path,
      'Source directory is not readable',
      'Check file permissions on the library directory.',
    );
  return sourceError(code, path, 'Source filesystem operation failed');
}

export function isMissing(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === 'ENOENT'
  );
}

/** Reject links at every existing ancestor; callers can canonicalize OS aliases first. */
export async function safeDirectoryAncestors(path: string): Promise<void> {
  const absolute = resolve(path),
    root = parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    const state = await lstat(current);
    if (!state.isDirectory() || state.isSymbolicLink())
      throw sourceError(
        'SOURCE_UNSAFE_ENTRY',
        current,
        'Source ancestor must be an ordinary directory',
      );
  }
}

function checkEntry(state: Stats, path: string): void {
  if (
    state.isSymbolicLink() ||
    (!state.isDirectory() && !state.isFile()) ||
    (state.isFile() && state.nlink > 1)
  ) {
    throw sourceError(
      'SOURCE_UNSAFE_ENTRY',
      path,
      'Source entries must be ordinary directories or files without links',
    );
  }
  if ((state.mode & 0o7000) !== 0)
    throw sourceError(
      'SOURCE_UNSAFE_MODE',
      path,
      'Privileged source modes are not supported',
    );
}

function unchanged(before: Stats, after: Stats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mode === after.mode &&
    before.nlink === after.nlink &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs
  );
}

/** Fixed-size allocation prevents a concurrently growing file from bypassing limits. */
export async function readOrdinaryFile(
  path: string,
  limit: number,
): Promise<{ bytes: Uint8Array; executable: boolean }> {
  await safeDirectoryAncestors(dirname(path));
  const before = await lstat(path);
  checkEntry(before, path);
  if (!before.isFile())
    throw sourceError(
      'SOURCE_UNSAFE_ENTRY',
      path,
      'Expected an ordinary source file',
    );
  if (before.size > limit)
    throw sourceError(
      'SOURCE_LIMIT',
      path,
      'Source file exceeds the byte limit',
    );
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = await handle.stat();
    checkEntry(opened, path);
    if (!opened.isFile() || !unchanged(before, opened))
      throw sourceError(
        'SOURCE_CHANGED',
        path,
        'Source changed during reading',
      );
    const buffer = new Uint8Array(before.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        null,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    await safeDirectoryAncestors(dirname(path));
    const named = await lstat(path);
    if (
      offset !== before.size ||
      !unchanged(before, after) ||
      !unchanged(after, named)
    )
      throw sourceError(
        'SOURCE_CHANGED',
        path,
        'Source changed during reading',
      );
    return {
      bytes: buffer.slice(0, offset),
      executable: (before.mode & 0o111) !== 0,
    };
  } finally {
    await handle.close();
  }
}

export type SourceTree = { files: FileEntry[]; directories: string[] };
export async function readSourceTree(
  root: string,
  skipRootGit = false,
): Promise<SourceTree> {
  const absolute = resolve(root);
  await safeDirectoryAncestors(absolute);
  const files: FileEntry[] = [],
    directories: string[] = [];
  const seen = new Set<string>();
  let entries = 0,
    total = 0;
  async function visit(relative: string): Promise<void> {
    const directory = relative
      ? join(absolute, ...relative.split('/'))
      : absolute;
    const before = await lstat(directory);
    checkEntry(before, directory);
    const names: string[] = [];
    const iterator = await opendir(directory);
    for await (const entry of iterator) {
      if (++entries > LIMITS.entries)
        throw sourceError(
          'SOURCE_LIMIT',
          relative,
          'Source exceeds the entry limit',
        );
      names.push(entry.name);
    }
    for (const name of names.sort(compareOrdinal)) {
      const path = relative ? `${relative}/${name}` : name;
      const full = join(directory, name);
      const state = await lstat(full);
      checkEntry(state, path);
      if (skipRootGit && path === '.git') continue;
      const problem = pathProblem(path);
      if (problem) throw sourceError('SOURCE_UNSAFE_PATH', path, problem);
      const key = path.toLowerCase();
      if (seen.has(key))
        throw sourceError(
          'SOURCE_UNSAFE_PATH',
          path,
          'Case-colliding source paths',
        );
      seen.add(key);
      if (path.split('/').length - (state.isDirectory() ? 0 : 1) > LIMITS.depth)
        throw sourceError(
          'SOURCE_LIMIT',
          path,
          'Source exceeds the directory depth limit',
        );
      if (state.isDirectory()) {
        directories.push(path);
        await visit(path);
      } else {
        if (total + state.size > LIMITS.snapshotBytes)
          throw sourceError(
            'SOURCE_LIMIT',
            path,
            'Snapshot exceeds the total byte limit',
          );
        const file = await readOrdinaryFile(full, LIMITS.assetBytes);
        if (isExecutableConfiguration(path, file.executable))
          throw sourceError(
            'SOURCE_UNSAFE_MODE',
            path,
            'Source configuration cannot be executable',
          );
        total += file.bytes.byteLength;
        files.push({ path, ...file });
      }
    }
    const after = await lstat(directory);
    if (!unchanged(before, after))
      throw sourceError(
        'SOURCE_CHANGED',
        relative,
        'Source directory changed during traversal',
      );
  }
  await visit('');
  files.sort((a, b) => compareOrdinal(a.path, b.path));
  return { files, directories };
}

function isExecutableConfiguration(path: string, executable: boolean): boolean {
  return (
    executable &&
    /(?:^|\/)(?:library\.ya?ml|veritas\.library\.yaml|veritas\.ya?ml|veritas\.lock\.json)$/u.test(
      path,
    )
  );
}

/** Also validates caller-provided snapshots before any cache write. */
export function validateSnapshot(snapshot: Snapshot): Snapshot {
  const parsed = z
    .strictObject({
      treeDigest: z.string().regex(/^[a-f0-9]{64}$/u),
      files: z
        .array(
          z.strictObject({
            path: z.string(),
            bytes: z.instanceof(Uint8Array),
            executable: z.boolean(),
          }),
        )
        .max(LIMITS.entries),
    })
    .safeParse(snapshot);
  if (!parsed.success)
    throw sourceError(
      'CACHE_INVALID',
      'snapshot',
      'Invalid snapshot shape or digest',
    );
  const value = parsed.data;
  const problem = pathsProblem(value.files.map((file) => file.path));
  if (problem) throw sourceError('CACHE_INVALID', 'snapshot', problem);
  const directories = new Map<string, string>();
  let total = 0;
  for (const file of value.files) {
    if (
      !(file.bytes instanceof Uint8Array) ||
      typeof file.executable !== 'boolean' ||
      file.path.split('/').length - 1 > LIMITS.depth
    )
      throw sourceError('CACHE_INVALID', file.path, 'Invalid snapshot file');
    if (isExecutableConfiguration(file.path, file.executable))
      throw sourceError(
        'CACHE_INVALID',
        file.path,
        'Source configuration cannot be executable',
      );
    if (
      file.bytes.byteLength > LIMITS.assetBytes ||
      (total += file.bytes.byteLength) > LIMITS.snapshotBytes
    )
      throw sourceError(
        'SOURCE_LIMIT',
        file.path,
        'Snapshot exceeds byte limits',
      );
    const parts = file.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const path = parts.slice(0, i).join('/'),
        key = path.toLowerCase(),
        previous = directories.get(key);
      if (previous !== undefined && previous !== path)
        throw sourceError(
          'CACHE_INVALID',
          path,
          'Case-colliding source directories',
        );
      directories.set(key, path);
    }
  }
  if (value.files.some((file) => directories.has(file.path.toLowerCase())))
    throw sourceError(
      'CACHE_INVALID',
      'snapshot',
      'Source file overlaps a directory',
    );
  if (directories.size + value.files.length > LIMITS.entries)
    throw sourceError(
      'SOURCE_LIMIT',
      'snapshot',
      'Snapshot exceeds the entry limit',
    );
  if (treeDigest(value.files) !== value.treeDigest)
    throw sourceError(
      'CACHE_INVALID',
      'snapshot',
      'Snapshot tree digest does not match its contents',
    );
  return {
    treeDigest: value.treeDigest,
    files: [...value.files]
      .sort((a, b) => compareOrdinal(a.path, b.path))
      .map((file) => ({ ...file, bytes: Uint8Array.from(file.bytes) })),
  };
}
