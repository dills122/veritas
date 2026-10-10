import { expect, it } from 'vitest';
import { unifiedDiff } from '../../../src/cli/diff.js';

const bytes = (text: string) => new TextEncoder().encode(text);

it('shows changed lines with context', () => {
  const diff = unifiedDiff(
    'AGENTS.md',
    bytes('a\nb\nc\nd\ne\nf\ng\n'),
    bytes('a\nb\nc\nD\ne\nf\ng\n'),
  );
  expect(diff).toContain('--- AGENTS.md (on disk)');
  expect(diff).toContain('+++ AGENTS.md (generated)');
  expect(diff).toContain('@@ -1,7 +1,7 @@');
  expect(diff).toContain('-d\n+D');
});
it('splits distant changes into separate hunks', () => {
  const old = Array.from({ length: 30 }, (_, i) => `l${i}`);
  const next = [...old];
  next[2] = 'X';
  next[27] = 'Y';
  const diff = unifiedDiff(
    'f.md',
    bytes(old.join('\n') + '\n'),
    bytes(next.join('\n') + '\n'),
  );
  expect(diff.match(/^@@/gmu)).toHaveLength(2);
});
it('handles creation from empty and full deletion', () => {
  expect(unifiedDiff('f', bytes(''), bytes('x\n'))).toContain(
    '@@ -0,0 +1,1 @@',
  );
  expect(unifiedDiff('f', bytes('x\n'), bytes(''))).toContain(
    '@@ -1,1 +0,0 @@',
  );
});
it('skips binary, oversized and identical content', () => {
  expect(unifiedDiff('b', new Uint8Array([0, 1]), bytes('x'))).toContain(
    'diff skipped',
  );
  expect(unifiedDiff('big', bytes('x\n'.repeat(3000)), bytes('y\n'))).toContain(
    'more than 2000 lines',
  );
  expect(unifiedDiff('same', bytes('x\n'), bytes('x\n'))).toContain(
    'no line differences',
  );
});
