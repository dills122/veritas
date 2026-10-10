import { createHash } from 'node:crypto';
import type { FileEntry } from './types.js';

export function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareOrdinal(a, b))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}
export function canonicalJson(value: unknown): string {
  return JSON.stringify(stable(value), null, 2) + '\n';
}
export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
export function treeDigest(files: readonly FileEntry[]): string {
  return sha256(
    canonicalJson(
      [...files]
        .sort((a, b) => compareOrdinal(a.path, b.path))
        .map((file) => ({
          path: file.path,
          sha256: sha256(file.bytes),
          executable: file.executable,
        })),
    ),
  );
}
