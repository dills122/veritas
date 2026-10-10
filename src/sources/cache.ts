import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { canonicalJson, sha256, treeDigest } from '../model/hash.js';
import { pathsProblem } from '../model/paths.js';
import { LIMITS, type Snapshot } from '../model/types.js';
import {
  filesystemFailure,
  isMissing,
  readOrdinaryFile,
  readSourceTree,
  safeDirectoryAncestors,
  sourceError,
  validateSnapshot,
} from './snapshot.js';

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const inventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  treeDigest: digestSchema,
  files: z
    .array(
      z.strictObject({
        path: z.string(),
        sha256: digestSchema,
        executable: z.boolean(),
      }),
    )
    .max(LIMITS.entries),
});

function cacheDirectory(project: string, digest: string): string {
  if (!digestSchema.safeParse(digest).success)
    throw sourceError(
      'CACHE_INVALID',
      'digest',
      'Cache digest must be a lowercase SHA-256 value',
    );
  return join(resolve(project), '.veritas', 'runtime', 'cache', digest);
}

async function verifyDirectory(
  directory: string,
  digest: string,
): Promise<Snapshot> {
  await safeDirectoryAncestors(directory);
  const names = (await readdir(directory)).sort();
  if (
    names.length !== 2 ||
    names[0] !== 'files' ||
    names[1] !== 'inventory.json'
  )
    throw sourceError(
      'CACHE_INVALID',
      directory,
      'Cache inventory or file storage is missing or contains unexpected entries',
    );
  const inventoryFile = await readOrdinaryFile(
    join(directory, 'inventory.json'),
    LIMITS.snapshotBytes,
  );
  if (inventoryFile.executable)
    throw sourceError(
      'CACHE_INVALID',
      'inventory.json',
      'Cache inventory cannot be executable',
    );
  let inventory: z.infer<typeof inventorySchema>;
  try {
    inventory = inventorySchema.parse(
      JSON.parse(
        new TextDecoder('utf8', { fatal: true }).decode(inventoryFile.bytes),
      ),
    );
  } catch {
    throw sourceError(
      'CACHE_INVALID',
      'inventory.json',
      'Cache inventory is malformed or unsupported',
    );
  }
  if (
    canonicalJson(inventory) !==
      new TextDecoder().decode(inventoryFile.bytes) ||
    inventory.treeDigest !== digest
  )
    throw sourceError(
      'CACHE_INVALID',
      'inventory.json',
      'Cache inventory encoding or digest does not match',
    );
  const problem = pathsProblem(inventory.files.map((file) => file.path));
  if (problem) throw sourceError('CACHE_INVALID', 'inventory.json', problem);
  const actual = await readSourceTree(join(directory, 'files'));
  const requiredDirectories = new Set<string>();
  for (const entry of inventory.files) {
    const parts = entry.path.split('/');
    for (let i = 1; i < parts.length; i++)
      requiredDirectories.add(parts.slice(0, i).join('/'));
  }
  if (
    actual.directories.some((path) => !requiredDirectories.has(path)) ||
    actual.files.length !== inventory.files.length
  )
    throw sourceError(
      'CACHE_INVALID',
      directory,
      'Cached tree contains missing or unlisted entries',
    );
  for (let i = 0; i < actual.files.length; i++) {
    const file = actual.files[i],
      entry = inventory.files[i];
    if (
      !file ||
      !entry ||
      file.path !== entry.path ||
      sha256(file.bytes) !== entry.sha256 ||
      file.executable !== entry.executable
    )
      throw sourceError(
        'CACHE_INVALID',
        file?.path ?? directory,
        'Cached file does not match the inventory',
      );
    if (process.platform !== 'win32') {
      const state = await lstat(
        join(directory, 'files', ...file.path.split('/')),
      );
      if ((state.mode & 0o777) !== (file.executable ? 0o755 : 0o644))
        throw sourceError(
          'CACHE_INVALID',
          file.path,
          'Cached file mode is not normalized',
        );
    }
  }
  const snapshot = {
    treeDigest: treeDigest(actual.files),
    files: actual.files,
  };
  if (snapshot.treeDigest !== digest)
    throw sourceError(
      'CACHE_INVALID',
      directory,
      'Cached tree digest does not match the requested pin',
    );
  return validateSnapshot(snapshot);
}

/** No cache population, recovery, chmod or other writes are allowed during loading. */
export async function loadSnapshot(
  project: string,
  digest: string,
): Promise<Snapshot> {
  const directory = cacheDirectory(project, digest);
  try {
    try {
      await safeDirectoryAncestors(directory);
    } catch (cause: unknown) {
      if (isMissing(cause))
        throw sourceError(
          'CACHE_MISSING',
          directory,
          'Locked snapshot is unavailable; explicitly restore or update the source',
          'This is normal in a fresh clone or CI: the cache is machine-local. Run `veritas update --restore` to rebuild it from the pinned source, then retry.',
        );
      throw cause;
    }
    return await verifyDirectory(directory, digest);
  } catch (cause: unknown) {
    throw filesystemFailure(cause, directory, 'CACHE_INVALID');
  }
}

async function createCacheParents(project: string): Promise<string> {
  const root = resolve(project);
  await safeDirectoryAncestors(root);
  let current = root;
  for (const part of ['.veritas', 'runtime', 'cache']) {
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

/** Explicit source resolution only; existing pins are verified and never overwritten. */
export async function storeSnapshot(
  project: string,
  input: Snapshot,
): Promise<void> {
  let stage: string | undefined;
  try {
    const snapshot = validateSnapshot(input);
    const directory = cacheDirectory(project, snapshot.treeDigest);
    try {
      await lstat(directory);
      await loadSnapshot(project, snapshot.treeDigest);
      return;
    } catch (cause: unknown) {
      if (!isMissing(cause)) throw cause;
    }
    const parent = await createCacheParents(project);
    stage = await mkdtemp(join(parent, '.stage-'));
    await mkdir(join(stage, 'files'), { mode: 0o700 });
    for (const file of snapshot.files) {
      const destination = join(stage, 'files', ...file.path.split('/'));
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      const mode = file.executable ? 0o755 : 0o644;
      await writeFile(destination, file.bytes, { flag: 'wx', mode });
      await chmod(destination, mode);
    }
    const inventory = {
      schemaVersion: 1,
      treeDigest: snapshot.treeDigest,
      files: snapshot.files.map((file) => ({
        path: file.path,
        sha256: sha256(file.bytes),
        executable: file.executable,
      })),
    };
    await writeFile(join(stage, 'inventory.json'), canonicalJson(inventory), {
      flag: 'wx',
      mode: 0o644,
    });
    await chmod(join(stage, 'inventory.json'), 0o644);
    await verifyDirectory(stage, snapshot.treeDigest);
    await safeDirectoryAncestors(parent);
    try {
      await rename(stage, directory);
      stage = undefined;
    } catch (cause: unknown) {
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        (cause.code === 'EEXIST' || cause.code === 'ENOTEMPTY')
      )
        await loadSnapshot(project, snapshot.treeDigest);
      else throw cause;
    }
  } catch (cause: unknown) {
    throw filesystemFailure(cause, project, 'CACHE_WRITE_FAILED');
  } finally {
    if (stage !== undefined) await rm(stage, { recursive: true, force: true });
  }
}
