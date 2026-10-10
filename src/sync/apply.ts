import { manifestSchema } from '../config/schemas.js';
import { canonicalJson } from '../model/hash.js';
import { isManagedPath, pathsProblem } from '../model/paths.js';
import type { WritePlan } from '../model/types.js';
import { runTransaction } from './journal.js';
import type { TransactionFile, TransactionOptions } from './journal.js';
import { assertNoJournal, syncError, withProjectLock } from './lock.js';

export async function apply(
  project: string,
  buildPlan: () => Promise<WritePlan>,
  options: TransactionOptions = {},
): Promise<WritePlan> {
  return withProjectLock(project, async () => {
    await assertNoJournal(project);
    const plan = await buildPlan();
    if (
      plan.hasConflicts ||
      plan.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ||
      plan.operations.some((operation) => operation.kind === 'conflict')
    )
      throw syncError(
        'PLAN_CONFLICT',
        'The complete plan has conflicts or errors; no output was written',
      );
    if (
      pathsProblem(plan.operations.map((operation) => operation.path)) ||
      plan.operations.some((operation) => !isManagedPath(operation.path)) ||
      !manifestSchema.safeParse(plan.manifest).success ||
      !Buffer.from(plan.manifestBytes).equals(
        Buffer.from(canonicalJson(plan.manifest)),
      )
    )
      throw syncError(
        'PLAN_INVALID',
        'Write plan exceeds its generated-output authority',
      );
    if (!plan.hasDrift) return plan;
    // Retain unchanged entries too: the manifest commit certifies the complete set.
    const files: TransactionFile[] = plan.operations.map((operation) => ({
      path: operation.path,
      before: operation.expectedBefore,
      ...(operation.after
        ? {
            bytes: operation.after.bytes,
            executable: operation.after.executable,
          }
        : {}),
    }));
    files.push({
      path: '.veritas/manifest.json',
      before: plan.expectedManifest,
      bytes: plan.manifestBytes,
      executable: false,
    });
    await runTransaction(
      project,
      'sync',
      '.veritas/manifest.json',
      files,
      options,
    );
    return plan;
  });
}
