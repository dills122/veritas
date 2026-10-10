import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Journal, ObservedFileState } from '../model/types.js';
import { LIMITS } from '../model/types.js';
import {
  backupPath,
  cleanupJournal,
  fault,
  fsyncDirectory,
  loadJournal,
  replaceFrom,
  requireState,
  transactionPath,
  writeExclusive,
} from './journal.js';
import type { TransactionOptions } from './journal.js';
import { syncError, withProjectLock } from './lock.js';
import { equalState, observe, readObservedFile } from './observe.js';
import { VeritasError } from '../diagnostics/index.js';

export type RecoveryResult = {
  action: 'none' | 'rollback' | 'cleanup';
  kind?: Journal['kind'];
};
export async function recover(
  project: string,
  options: TransactionOptions = {},
): Promise<RecoveryResult> {
  return withProjectLock(project, async () => {
    const journal = await loadJournal(project);
    if (!journal) return { action: 'none' };
    const current: ObservedFileState[] = [];
    for (const entry of journal.entries) {
      const state = await observe(project, entry.path);
      if (!equalState(state, entry.before) && !equalState(state, entry.after))
        throw syncError(
          'RECOVERY_CONFLICT',
          `Interrupted output was externally changed or is unsafe: ${entry.path}`,
        );
      current.push(state);
    }
    const commit = journal.entries.at(-1);
    const commitState = current.at(-1);
    if (!commit || !commitState)
      throw syncError('JOURNAL_INVALID', 'Journal lacks its commit inventory');
    const allAfter = journal.entries.every((entry, index) => {
      const state = current[index];
      return state !== undefined && equalState(state, entry.after);
    });
    const committed = equalState(commitState, commit.after) && allAfter;
    const allBefore = journal.entries.every((entry, index) => {
      const state = current[index];
      return state !== undefined && equalState(state, entry.before);
    });
    if (!committed && !equalState(commitState, commit.before))
      throw syncError(
        'RECOVERY_CONFLICT',
        'Commit exists but its complete output inventory does not match',
      );
    const backups = new Map<number, Uint8Array>();
    let backupBytes = 0;
    // Validate every backup before any restoration. Cleanup may resume after backup deletion.
    for (let index = 0; index < journal.entries.length; index++) {
      const entry = journal.entries[index];
      if (!entry || entry.before.kind !== 'file') continue;
      const read = await readObservedFile(
        project,
        backupPath(journal.id, index),
      );
      if ((committed || allBefore) && read.state.kind === 'missing') continue;
      if (!equalState(read.state, entry.before) || !read.bytes)
        throw syncError(
          'RECOVERY_BACKUP_INVALID',
          `Backup is missing, modified or unsafe for ${entry.path}`,
        );
      backups.set(index, read.bytes);
      backupBytes += read.bytes.byteLength;
      if (backupBytes > LIMITS.snapshotBytes + LIMITS.assetBytes)
        throw syncError(
          'RECOVERY_LIMIT',
          'Backup inventory exceeds the bounded transaction size',
        );
    }
    try {
      if (committed) {
        await fault(options, 'before-cleanup');
        await cleanupJournal(project, journal, options);
        return { action: 'cleanup', kind: journal.kind };
      }
      for (let index = journal.entries.length - 1; index >= 0; index--) {
        const entry = journal.entries[index];
        const state = current[index];
        if (!entry || !state || equalState(state, entry.before)) continue;
        await fault(options, 'before-rollback', { path: entry.path, index });
        await requireState(project, entry.path, state);
        if (entry.before.kind === 'missing') {
          await unlink(join(project, entry.path));
          await fsyncDirectory(join(project, entry.path, '..'));
        } else if (entry.before.kind === 'file') {
          const bytes = backups.get(index);
          if (!bytes)
            throw syncError(
              'RECOVERY_BACKUP_INVALID',
              'Validated backup was unavailable',
            );
          const restore = `${transactionPath(journal.id)}/${index}.restore-${process.pid}`;
          // A previous restoration may have left a staged file; validate rather than overwrite it.
          const existing = await readObservedFile(project, restore);
          if (existing.state.kind === 'missing')
            await writeExclusive(
              project,
              restore,
              bytes,
              entry.before.executable,
            );
          else if (!equalState(existing.state, entry.before))
            throw syncError(
              'RECOVERY_CONFLICT',
              'Existing recovery stage was externally changed',
            );
          await replaceFrom(project, restore, entry.path, state, entry.before);
        }
        await fault(options, 'after-rollback', { path: entry.path, index });
      }
      await cleanupJournal(project, journal, options);
      return { action: 'rollback', kind: journal.kind };
    } catch (cause) {
      if (cause instanceof VeritasError) throw cause;
      throw syncError(
        'SYNC_INCOMPLETE',
        'Recovery interrupted; preserve runtime state and run recover again',
        5,
      );
    }
  });
}
