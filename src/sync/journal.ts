import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { journalSchema } from '../config/schemas.js';
import { VeritasError } from '../diagnostics/index.js';
import { canonicalJson, sha256 } from '../model/hash.js';
import { pathsProblem } from '../model/paths.js';
import { LIMITS } from '../model/types.js';
import type { Journal, ObservedFileState } from '../model/types.js';
import { ensureParent, isCode, JOURNAL_PATH, syncError } from './lock.js';
import type { LockLease } from './lock.js';
import { equalState, observe, readObservedFile } from './observe.js';

export type FaultContext = { path?: string; index?: number };
export type TransactionOptions = {
  lease?: LockLease;
  fault?: (point: string, context: FaultContext) => void | Promise<void>;
  preconditions?: readonly {
    path: 'veritas.yaml' | 'veritas.lock.json';
    expectedBefore: ObservedFileState;
  }[];
};
export type TransactionFile = {
  path: string;
  before: ObservedFileState;
  bytes?: Uint8Array;
  executable?: boolean;
};
export const transactionPath = (id: string) =>
  `.veritas/runtime/transactions/${id}`;
export const backupPath = (id: string, index: number) =>
  `${transactionPath(id)}/${index}.backup`;
export const stagePath = (id: string, index: number) =>
  `${transactionPath(id)}/${index}.stage`;
export async function fault(
  options: TransactionOptions,
  point: string,
  context: FaultContext = {},
): Promise<void> {
  await options.fault?.(point, context);
}
export async function fsyncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY);
    await handle.sync();
  } catch (cause) {
    if (
      !isCode(cause, 'EINVAL') &&
      !isCode(cause, 'ENOTSUP') &&
      !isCode(cause, 'EISDIR')
    )
      throw cause;
  } finally {
    await handle?.close();
  }
}
export async function writeExclusive(
  project: string,
  path: string,
  bytes: Uint8Array,
  executable = false,
): Promise<void> {
  await ensureParent(project, path);
  const handle = await open(
    join(project, path),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    executable ? 0o755 : 0o644,
  );
  try {
    await handle.writeFile(bytes);
    await handle.chmod(executable ? 0o755 : 0o644);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function requireState(
  project: string,
  path: string,
  expected: ObservedFileState,
): Promise<void> {
  if (!equalState(await observe(project, path), expected))
    throw syncError(
      'SYNC_PRECONDITION',
      `Destination changed or is unsafe: ${path}`,
    );
}
async function persistJournal(
  project: string,
  journal: Journal,
  expected: ObservedFileState,
): Promise<ObservedFileState> {
  const path = `.veritas/runtime/journal-${journal.id}.tmp`;
  const bytes = Buffer.from(canonicalJson(journal));
  await writeExclusive(project, path, bytes);
  await requireState(project, JOURNAL_PATH, expected);
  await rename(join(project, path), join(project, JOURNAL_PATH));
  await fsyncDirectory(join(project, '.veritas/runtime'));
  return { kind: 'file', sha256: sha256(bytes), executable: false };
}
export async function loadJournal(
  project: string,
): Promise<Journal | undefined> {
  const read = await readObservedFile(project, JOURNAL_PATH);
  if (read.state.kind === 'missing') return undefined;
  if (read.state.kind !== 'file' || read.state.executable || !read.bytes)
    throw syncError(
      'JOURNAL_INVALID',
      'Journal must be an ordinary non-executable file',
    );
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(read.bytes);
    const value: unknown = JSON.parse(text);
    const yaml = parseDocument(text, { strict: true, uniqueKeys: true });
    if (yaml.errors.length || yaml.warnings.length)
      throw new Error('Duplicate journal keys');
    const journal = journalSchema.parse(value);
    if (
      pathsProblem(journal.entries.map((entry) => entry.path)) ||
      journal.entries.at(-1)?.path !== journal.commitPath ||
      journal.entries.at(-1)?.after.kind !== 'file'
    )
      throw new Error('Inconsistent journal commit inventory');
    return journal;
  } catch {
    throw syncError(
      'JOURNAL_INVALID',
      'Journal is corrupt or exceeds its fixed transaction authority',
    );
  }
}
export async function cleanupJournal(
  project: string,
  journal: Journal,
  options: TransactionOptions = {},
): Promise<void> {
  const existing = await loadJournal(project);
  if (
    !existing ||
    existing.id !== journal.id ||
    canonicalJson({ ...existing, phase: 'prepared' }) !==
      canonicalJson({ ...journal, phase: 'prepared' })
  )
    throw syncError(
      'JOURNAL_CHANGED',
      'Journal changed before transaction cleanup',
    );
  const expected = await observe(project, JOURNAL_PATH);
  const state = await observe(
    project,
    `${transactionPath(journal.id)}/placeholder`,
  );
  if (state.kind === 'unsafe')
    throw syncError('JOURNAL_UNSAFE', 'Transaction directory is unsafe');
  await rm(join(project, transactionPath(journal.id)), {
    recursive: true,
    force: true,
  });
  await fault(options, 'after-remove-staging');
  await requireState(project, JOURNAL_PATH, expected);
  await unlink(join(project, JOURNAL_PATH));
  await fsyncDirectory(join(project, '.veritas/runtime'));
}
export async function replaceFrom(
  project: string,
  source: string,
  path: string,
  expected: ObservedFileState,
  desired: ObservedFileState,
): Promise<void> {
  await ensureParent(project, path);
  await requireState(project, source, desired);
  await requireState(project, path, expected);
  await rename(join(project, source), join(project, path));
  await fsyncDirectory(join(project, path, '..'));
}
/** Caller holds the project lock. Every file is staged and backed up before journal publication. */
export async function runTransaction(
  project: string,
  kind: Journal['kind'],
  commitPath: Journal['commitPath'],
  files: readonly TransactionFile[],
  options: TransactionOptions = {},
): Promise<void> {
  const id = randomUUID();
  const journal: Journal = {
    schemaVersion: 1,
    kind,
    id,
    phase: 'prepared',
    commitPath,
    entries: files.map((file) => ({
      path: file.path,
      before: file.before,
      after: file.bytes
        ? {
            kind: 'file',
            sha256: sha256(file.bytes),
            executable: file.executable ?? false,
          }
        : { kind: 'missing' },
    })),
  };
  const parsed = journalSchema.safeParse(journal);
  if (
    !parsed.success ||
    pathsProblem(files.map((file) => file.path)) ||
    files.at(-1)?.path !== commitPath ||
    files.at(-1)?.bytes === undefined ||
    files.reduce((sum, file) => sum + (file.bytes?.byteLength ?? 0), 0) >
      LIMITS.snapshotBytes + LIMITS.assetBytes ||
    files.some(
      (file) =>
        file.bytes !== undefined && file.bytes.byteLength > LIMITS.assetBytes,
    )
  )
    throw syncError(
      'TRANSACTION_INVALID',
      'Transaction exceeds its fixed path, mode or resource authority',
    );
  for (const guard of options.preconditions ?? [])
    await requireState(project, guard.path, guard.expectedBefore);
  for (const entry of journal.entries)
    await requireState(project, entry.path, entry.before);
  await ensureParent(project, transactionPath(id));
  await mkdir(join(project, transactionPath(id))); // Exclusive identity, never reuse an old transaction.
  let published = false;
  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      if (!file) continue;
      if (file.bytes)
        await writeExclusive(
          project,
          stagePath(id, index),
          file.bytes,
          file.executable,
        );
      if (file.before.kind === 'file') {
        const read = await readObservedFile(project, file.path);
        if (!equalState(read.state, file.before) || !read.bytes)
          throw syncError(
            'SYNC_PRECONDITION',
            `Destination changed before backup: ${file.path}`,
          );
        await writeExclusive(
          project,
          backupPath(id, index),
          read.bytes,
          file.before.executable,
        );
      }
    }
    await fsyncDirectory(join(project, transactionPath(id)));
    let journalState = await persistJournal(project, journal, {
      kind: 'missing',
    });
    published = true;
    await fault(options, 'after-prepare');
    journalState = await persistJournal(
      project,
      { ...journal, phase: 'applying' },
      journalState,
    );
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const entry = journal.entries[index];
      if (!file || !entry) continue;
      const commit = file.path === commitPath;
      await fault(options, commit ? 'before-commit' : 'before-entry', {
        path: file.path,
        index,
      });
      if (commit) {
        // Earlier paths must still match their applied state before publishing ownership.
        for (let applied = 0; applied < index; applied++) {
          const prior = journal.entries[applied];
          if (prior) await requireState(project, prior.path, prior.after);
        }
      }
      for (const guard of options.preconditions ?? []) {
        const appliedGuard = journal.entries
          .slice(0, index)
          .find((entry) => entry.path === guard.path);
        await requireState(
          project,
          guard.path,
          appliedGuard?.after ?? guard.expectedBefore,
        );
      }
      await requireState(project, file.path, file.before);
      if (!equalState(entry.before, entry.after)) {
        if (file.bytes)
          await replaceFrom(
            project,
            stagePath(id, index),
            file.path,
            file.before,
            entry.after,
          );
        else {
          await unlink(join(project, file.path));
          await fsyncDirectory(join(project, file.path, '..'));
        }
      }
      await fault(options, commit ? 'after-commit' : 'after-entry', {
        path: file.path,
        index,
      });
    }
    await persistJournal(
      project,
      { ...journal, phase: 'committed' },
      journalState,
    );
    await fault(options, 'before-cleanup');
    await cleanupJournal(project, journal, options);
    await fault(options, 'after-cleanup');
  } catch (cause) {
    if (!published) {
      await rm(join(project, transactionPath(id)), {
        recursive: true,
        force: true,
      });
      throw cause;
    }
    if (cause instanceof VeritasError) throw cause;
    throw syncError(
      'SYNC_INCOMPLETE',
      'Transaction interrupted; inspect and run recover before continuing',
      5,
    );
  }
}
