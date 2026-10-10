/* eslint-disable no-control-regex -- Portable path validation intentionally rejects control bytes. */
import { compareOrdinal } from './hash.js';

export function pathProblem(path: string): string | undefined {
  if (
    !path ||
    path !== path.normalize('NFC') ||
    /[\u0000-\u001f\u007f\\:<>"|?*]/u.test(path) ||
    path.startsWith('/')
  )
    return 'Path must be relative, NFC and portable';
  const parts = path.split('/');
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /[. ]$/u.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part) ||
        part.toLowerCase() === '.git',
    )
  )
    return 'Unsafe or reserved path segment';
  return undefined;
}
export function pathsProblem(paths: readonly string[]): string | undefined {
  const sorted = [...paths].sort(compareOrdinal);
  const seen = new Set<string>();
  for (const path of sorted) {
    const problem = pathProblem(path);
    if (problem) return `${path}: ${problem}`;
    const key = path.toLowerCase();
    if (seen.has(key)) return `Duplicate or case-colliding path: ${path}`;
    seen.add(key);
  }
  for (const path of sorted) {
    const parts = path.toLowerCase().split('/').slice(0, -1);
    if (parts.some((_, i) => seen.has(parts.slice(0, i + 1).join('/'))))
      return `File/directory overlap: ${path}`;
  }
  return undefined;
}
export function isManagedPath(path: string): boolean {
  return (
    !pathProblem(path) &&
    (path === 'AGENTS.md' ||
      path === 'CLAUDE.md' ||
      /^(?:\.agents\/skills|\.claude\/(?:rules|skills)|\.kiro\/(?:steering|skills))\/[^/]+(?:\/[^/]+)*$/u.test(
        path,
      ))
  );
}
export function patternProblem(pattern: string): string | undefined {
  if (
    !pattern ||
    pattern.startsWith('/') ||
    /[!{}[\]\\:()\u0000-\u001f]/u.test(pattern)
  )
    return 'Unsupported activation pattern';
  if (
    pattern
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          (part.includes('**') && part !== '**'),
      )
  )
    return 'Patterns require relative segments and whole-segment **';
  return undefined;
}
export function matchPattern(pattern: string, path: string): boolean {
  if (patternProblem(pattern) || pathProblem(path)) return false;
  const p = pattern.split('/'),
    s = path.split('/');
  const memo = new Map<string, boolean>();
  function match(pi: number, si: number): boolean {
    const key = `${pi}:${si}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const result = compute(pi, si);
    memo.set(key, result);
    return result;
  }
  function compute(pi: number, si: number): boolean {
    if (pi === p.length) return si === s.length;
    const part = p[pi];
    if (part === '**')
      return match(pi + 1, si) || (si < s.length && match(pi, si + 1));
    if (part === undefined || si === s.length) return false;
    const expression = part
      .replace(/[.+^$|(){}[\]\\]/gu, '\\$&')
      .replace(/\*/gu, '[^/]*')
      .replace(/\?/gu, '[^/]');
    return (
      new RegExp(`^${expression}$`, 'u').test(s[si] ?? '') &&
      match(pi + 1, si + 1)
    );
  }
  return match(0, 0);
}

const MAX_EXPANSION = 100;
/**
 * Expands `{a,b}` groups into the equivalent plain patterns. Unmatched braces,
 * or an expansion above the pattern limit, return the input unchanged so
 * validation rejects it; the cap also bounds work on hostile input.
 */
export function expandBraces(pattern: string): string[] {
  const results: string[] = [];
  function expand(text: string): boolean {
    const match = /\{([^{}]*)\}/u.exec(text);
    if (!match) {
      results.push(text);
      return results.length <= MAX_EXPANSION;
    }
    for (const alternative of (match[1] ?? '').split(','))
      if (
        !expand(
          text.slice(0, match.index) +
            alternative +
            text.slice(match.index + match[0].length),
        )
      )
        return false;
    return true;
  }
  return expand(pattern) ? results : [pattern];
}
