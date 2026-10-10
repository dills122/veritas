import { compareOrdinal } from '../model/hash.js';
import type { Diagnostic, Result, SourceLocation } from '../model/types.js';
export function success<T>(
  value: T,
  diagnostics: readonly Diagnostic[] = [],
): Result<T> {
  return { ok: true, value, diagnostics };
}
export function failure<T = never>(
  diagnostics: readonly Diagnostic[],
): Result<T> {
  return { ok: false, diagnostics };
}
export function error(
  code: string,
  message: string,
  source?: SourceLocation,
): Diagnostic {
  return { code, severity: 'error', message, ...(source ? { source } : {}) };
}
export function sortDiagnostics(
  diagnostics: readonly Diagnostic[],
): Diagnostic[] {
  const rank = { error: 0, warning: 1, info: 2 };
  return [...diagnostics].sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      compareOrdinal(a.code, b.code) ||
      compareOrdinal(a.source?.id ?? '', b.source?.id ?? '') ||
      compareOrdinal(a.source?.path ?? '', b.source?.path ?? '') ||
      (a.source?.line ?? 0) - (b.source?.line ?? 0) ||
      (a.source?.column ?? 0) - (b.source?.column ?? 0) ||
      compareOrdinal(a.target ?? '', b.target ?? '') ||
      compareOrdinal(a.message, b.message),
  );
}
export class VeritasError extends Error {
  constructor(
    public readonly diagnostic: Diagnostic,
    public readonly exitCode: 2 | 3 | 4 | 5 = 4,
  ) {
    super(diagnostic.message);
    this.name = 'VeritasError';
  }
}
