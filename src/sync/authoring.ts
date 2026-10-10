import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rmdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { syncError } from './lock.js';
import { assertSafeAncestors, readObservedFile } from './observe.js';

/** Undo everything one authoring call changed. Never removes pre-existing files or non-empty directories. */
export type Rollback = () => Promise<void>;
export type NewFile = {
  path: string;
  bytes: Uint8Array;
  executable?: boolean;
};

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates new library files exclusively. This is the only writer for scaffold
 * and adopt output; it cannot replace an existing file or follow links.
 */
export async function createFiles(
  project: string,
  files: readonly NewFile[],
): Promise<Rollback> {
  const root = resolve(project);
  const createdFiles: string[] = [],
    createdDirs: string[] = [];
  const rollback: Rollback = async () => {
    for (const file of createdFiles.reverse())
      await unlink(file).catch(() => undefined);
    for (const dir of createdDirs.reverse())
      await rmdir(dir).catch(() => undefined);
  };
  try {
    for (const file of files) {
      const problem = await assertSafeAncestors(project, file.path);
      if (problem) throw syncError('SYNC_UNSAFE', problem);
      const target = join(root, ...file.path.split('/'));
      const missing: string[] = [];
      for (
        let dir = dirname(target);
        dir !== root && !(await exists(dir));
        dir = dirname(dir)
      )
        missing.unshift(dir);
      for (const dir of missing) {
        await mkdir(dir);
        createdDirs.push(dir);
      }
      let handle;
      try {
        handle = await open(
          target,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          file.executable ? 0o755 : 0o644,
        );
      } catch {
        throw syncError(
          'AUTHORING_EXISTS',
          `Refusing to overwrite existing path ${file.path}`,
        );
      }
      createdFiles.push(target);
      try {
        await handle.writeFile(file.bytes);
      } finally {
        await handle.close();
      }
    }
  } catch (cause) {
    await rollback();
    throw cause;
  }
  return rollback;
}

/** Replaces one existing file only if its bytes still equal what the caller read. */
export async function rewriteFile(
  project: string,
  path: string,
  expected: Uint8Array,
  bytes: Uint8Array,
): Promise<Rollback> {
  const current = await readObservedFile(project, path);
  if (
    current.state.kind !== 'file' ||
    !current.bytes ||
    Buffer.compare(Buffer.from(current.bytes), Buffer.from(expected)) !== 0
  )
    throw syncError('AUTHORING_CHANGED', `${path} changed while it was read`);
  const target = join(resolve(project), ...path.split('/'));
  const temp = `${target}.veritas-tmp`;
  const handle = await open(
    temp,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o644,
  );
  try {
    await handle.writeFile(bytes);
    await handle.close();
    await rename(temp, target);
  } catch (cause) {
    await handle.close().catch(() => undefined);
    await unlink(temp).catch(() => undefined);
    throw cause;
  }
  return async () => {
    const restore = `${target}.veritas-restore`;
    const back = await open(
      restore,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC,
      0o644,
    );
    try {
      await back.writeFile(expected);
    } finally {
      await back.close();
    }
    await rename(restore, target);
  };
}
