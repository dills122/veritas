import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { error, VeritasError } from '../diagnostics/index.js';
import { canonicalJson } from '../model/hash.js';
import { assertSafeAncestors, observe, readObservedFile } from './observe.js';

export const LOCK_PATH = '.veritas/runtime/sync.lock';
export const JOURNAL_PATH = '.veritas/runtime/journal.json';
export function syncError(
  code: string,
  message: string,
  exitCode: 3 | 4 | 5 = 3,
): VeritasError {
  return new VeritasError(error(code, message), exitCode);
}
export function isCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}
export async function ensureParent(
  project: string,
  path: string,
): Promise<void> {
  const problem = await assertSafeAncestors(project, path);
  if (problem) throw syncError('SYNC_UNSAFE', problem);
  await mkdir(join(project, path, '..'), { recursive: true });
  const checked = await assertSafeAncestors(project, path);
  if (checked) throw syncError('SYNC_UNSAFE', checked);
}
export type LockLease = { nonce: string; release: () => Promise<boolean> };
/** A nonce is a project-local bearer capability; never infer ownership from a PID alone. */
export async function assertLockLease(
  project: string,
  lease: LockLease,
): Promise<void> {
  const expected = Buffer.from(
    canonicalJson({ schemaVersion: 1, nonce: lease.nonce, pid: process.pid }),
  );
  const read = await readObservedFile(project, LOCK_PATH);
  if (
    read.state.kind !== 'file' ||
    read.state.executable ||
    !read.bytes ||
    !Buffer.from(read.bytes).equals(expected)
  )
    throw syncError(
      'SYNC_BUSY',
      'The supplied lease does not own this project lock',
      5,
    );
}
export async function acquireLock(project: string): Promise<LockLease> {
  await ensureParent(project, LOCK_PATH);
  const nonce = randomUUID();
  const bytes = Buffer.from(
    canonicalJson({ schemaVersion: 1, nonce, pid: process.pid }),
  );
  let handle;
  try {
    handle = await open(
      join(project, LOCK_PATH),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
  } catch (cause) {
    if (isCode(cause, 'EEXIST'))
      throw syncError(
        'SYNC_BUSY',
        'Another mutator or an abandoned lock requires owner inspection',
        5,
      );
    throw cause;
  }
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return {
    nonce,
    release: async () => {
      const current = await readObservedFile(project, LOCK_PATH);
      if (
        current.state.kind !== 'file' ||
        !current.bytes ||
        !Buffer.from(current.bytes).equals(bytes)
      )
        return false;
      await unlink(join(project, LOCK_PATH));
      return true;
    },
  };
}
export async function assertNoJournal(project: string): Promise<void> {
  if ((await observe(project, JOURNAL_PATH)).kind !== 'missing')
    throw syncError(
      'SYNC_INCOMPLETE',
      'An interrupted transaction requires recover before new writes',
      5,
    );
}
/** Read-only; absent runtime directories remain absent. */
export async function assertNoIncompleteTransaction(
  project: string,
  lease?: LockLease,
): Promise<void> {
  await assertNoJournal(project);
  if (lease) {
    await assertLockLease(project, lease);
    return;
  }
  if ((await observe(project, LOCK_PATH)).kind !== 'missing')
    throw syncError(
      'SYNC_BUSY',
      'A mutator or abandoned lock prevents an unqualified read-only result',
      5,
    );
}
export async function withProjectLock<T>(
  project: string,
  operation: () => Promise<T>,
  callerLease?: LockLease,
): Promise<T> {
  if (callerLease) {
    await assertLockLease(project, callerLease);
    return operation();
  }
  const lease = await acquireLock(project);
  try {
    return await operation();
  } finally {
    await lease.release();
  }
}
