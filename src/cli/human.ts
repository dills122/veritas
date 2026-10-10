import type { WritePlan } from '../model/types.js';

export function planSummary(value: WritePlan): string {
  const counts = {
    create: 0,
    replace: 0,
    delete: 0,
    unchanged: 0,
    conflict: 0,
  };
  for (const operation of value.operations) counts[operation.kind]++;
  return `Changes: ${counts.create} create, ${counts.replace} replace, ${counts.delete} delete; ${counts.unchanged} unchanged, ${counts.conflict} conflict.`;
}

export function humanPlan(
  command: 'plan' | 'sync' | 'check',
  value: WritePlan,
  diffs: ReadonlyMap<string, string> = new Map(),
): readonly string[] {
  if (!value.hasConflicts && !value.hasDrift)
    return ['Generated files and manifest are up to date.'];
  return [
    planSummary(value),
    ...(command !== 'sync' || value.hasConflicts
      ? value.operations
          .filter((operation) => operation.kind !== 'unchanged')
          .map((operation) => `${operation.kind} ${operation.path}`)
      : []),
    ...[...diffs.values()].flatMap((diff) => ['', diff]),
    ...(value.manifestChanged
      ? [
          command === 'sync' && !value.hasConflicts
            ? 'Manifest updated.'
            : 'Manifest update required.',
        ]
      : []),
    value.hasConflicts
      ? 'Nothing was written. Resolve each conflict using the per-file hints (docs/troubleshooting.md#output_conflict), then run plan again.'
      : command === 'sync'
        ? 'Synchronization complete.'
        : 'Next: run sync to apply the plan.',
  ];
}
