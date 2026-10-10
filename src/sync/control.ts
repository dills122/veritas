import type { ObservedFileState } from '../model/types.js';
import { runTransaction } from './journal.js';
import type { TransactionOptions } from './journal.js';
import { assertNoJournal, syncError, withProjectLock } from './lock.js';

export type ControlFile = {
  path: 'veritas.yaml' | 'veritas.lock.json';
  bytes: Uint8Array;
  expectedBefore: ObservedFileState;
};
export async function writeControls(
  project: string,
  kind: 'init' | 'update',
  controls: readonly ControlFile[],
  options: TransactionOptions = {},
): Promise<void> {
  const names = controls.map((control) => control.path);
  if (
    kind === 'init'
      ? names.length !== 2 ||
        !names.includes('veritas.yaml') ||
        !names.includes('veritas.lock.json') ||
        controls.some((control) => control.expectedBefore.kind !== 'missing')
      : names.length !== 1 ||
        names[0] !== 'veritas.lock.json' ||
        controls[0]?.expectedBefore.kind !== 'file'
  )
    throw syncError(
      'CONTROL_INVALID',
      'Control transaction violates init/update authority',
    );
  return withProjectLock(
    project,
    async () => {
      await assertNoJournal(project);
      const files = [...controls]
        .sort((a, b) =>
          a.path === 'veritas.lock.json'
            ? 1
            : b.path === 'veritas.lock.json'
              ? -1
              : 0,
        )
        .map((control) => ({
          path: control.path,
          before: control.expectedBefore,
          bytes: control.bytes,
          executable: false,
        }));
      await runTransaction(project, kind, 'veritas.lock.json', files, options);
    },
    options.lease,
  );
}
