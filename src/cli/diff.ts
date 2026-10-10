/** Bounded unified diff for human review. Pure: callers supply bytes. */
const MAX_BYTES = 256 * 1024;
const MAX_LINES = 2000;
const CONTEXT = 3;

function decode(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength > MAX_BYTES || bytes.includes(0)) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}
function lines(text: string): string[] {
  if (!text) return [];
  const parts = text.split('\n');
  if (parts.at(-1) === '') parts.pop();
  return parts;
}
type Edit = { kind: ' ' | '-' | '+'; text: string };

function edits(a: readonly string[], b: readonly string[]): Edit[] {
  const n = a.length,
    m = b.length,
    width = m + 1;
  const table = new Int32Array((n + 1) * width);
  const cell = (i: number, j: number): number => table[i * width + j] ?? 0;
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i * width + j] =
        a[i] === b[j]
          ? cell(i + 1, j + 1) + 1
          : Math.max(cell(i + 1, j), cell(i, j + 1));
  const result: Edit[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ kind: ' ', text: a[i] ?? '' });
      i++;
      j++;
    } else if (cell(i + 1, j) >= cell(i, j + 1))
      result.push({ kind: '-', text: a[i++] ?? '' });
    else result.push({ kind: '+', text: b[j++] ?? '' });
  }
  while (i < n) result.push({ kind: '-', text: a[i++] ?? '' });
  while (j < m) result.push({ kind: '+', text: b[j++] ?? '' });
  return result;
}

/**
 * Unified diff from the file on disk to the content Veritas would write.
 * Returns a note instead of a diff for binary, oversized or identical input.
 */
export function unifiedDiff(
  path: string,
  current: Uint8Array,
  desired: Uint8Array,
): string {
  const before = decode(current),
    after = decode(desired);
  if (before === undefined || after === undefined)
    return `(diff skipped for ${path}: binary or larger than ${MAX_BYTES / 1024} KiB)`;
  const a = lines(before),
    b = lines(after);
  if (a.length > MAX_LINES || b.length > MAX_LINES)
    return `(diff skipped for ${path}: more than ${MAX_LINES} lines)`;
  const all = edits(a, b);
  if (!all.some((edit) => edit.kind !== ' '))
    return `(no line differences in ${path}; modes or line endings may differ)`;
  const out = [`--- ${path} (on disk)`, `+++ ${path} (generated)`];
  const changed = all.flatMap((edit, index) =>
    edit.kind === ' ' ? [] : [index],
  );
  let start = 0;
  while (start < changed.length) {
    let end = start;
    while (
      end + 1 < changed.length &&
      (changed[end + 1] ?? 0) - (changed[end] ?? 0) <= CONTEXT * 2 + 1
    )
      end++;
    const from = Math.max(0, (changed[start] ?? 0) - CONTEXT),
      to = Math.min(all.length - 1, (changed[end] ?? 0) + CONTEXT);
    const slice = all.slice(from, to + 1);
    const oldStart =
      all.slice(0, from).filter((edit) => edit.kind !== '+').length + 1;
    const newStart =
      all.slice(0, from).filter((edit) => edit.kind !== '-').length + 1;
    const oldCount = slice.filter((edit) => edit.kind !== '+').length;
    const newCount = slice.filter((edit) => edit.kind !== '-').length;
    out.push(
      `@@ -${oldCount ? oldStart : oldStart - 1},${oldCount} +${newCount ? newStart : newStart - 1},${newCount} @@`,
    );
    for (const edit of slice) out.push(`${edit.kind}${edit.text}`);
    start = end + 1;
  }
  return out.join('\n');
}
