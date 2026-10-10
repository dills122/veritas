import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256, treeDigest } from '../../../src/model/hash.js';
import {
  isManagedPath,
  pathProblem,
  pathsProblem,
  patternProblem,
  matchPattern,
} from '../../../src/model/paths.js';

describe('portable deterministic identity', () => {
  it('ignores object insertion and tree enumeration order but retains mode intent', () => {
    expect(canonicalJson({ b: 2, a: { z: 1, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, z: 1 }, b: 2 }),
    );
    const a = { path: 'a', bytes: new Uint8Array([0, 255]), executable: false };
    const b = {
      path: 'b',
      bytes: new TextEncoder().encode('text'),
      executable: false,
    };
    expect(treeDigest([a, b])).toBe(treeDigest([b, a]));
    expect(treeDigest([a])).not.toBe(treeDigest([{ ...a, executable: true }]));
    expect(sha256(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it.each([
    '../escape',
    'a/../b',
    'C:/drive',
    'a\\b',
    'a/NUL.txt',
    'a.',
    'a//b',
    'e\u0301.txt',
    '.git/config',
    'a\u0001',
    'a<b',
    'a|b',
    'a?b',
    'a*b',
  ])('rejects unsafe portable paths', (path) =>
    expect(pathProblem(path)).toBeDefined(),
  );
  it('restricts generated authority and rejects aliases and ancestor collisions', () => {
    expect(isManagedPath('AGENTS.md')).toBe(true);
    expect(isManagedPath('.agents/skills/review/assets/data.bin')).toBe(true);
    expect(isManagedPath('src/AGENTS.md')).toBe(false);
    expect(isManagedPath('.veritas/manifest.json')).toBe(false);
    expect(pathsProblem(['a/X', 'a/x'])).toBeDefined();
    expect(pathsProblem(['a', 'a/b'])).toBeDefined();
    expect(pathsProblem(['A/b', 'a'])).toBeDefined();
  });
  it('matches the portable positive pattern subset, including future files and dotfiles', () => {
    expect(matchPattern('**/*.ts', 'x.ts')).toBe(true);
    expect(matchPattern('**/*.ts', '.hidden/x.ts')).toBe(true);
    expect(matchPattern('src/?*.ts', 'src/a.ts')).toBe(true);
    expect(matchPattern('src/*.ts', 'src/sub/a.ts')).toBe(false);
    expect(matchPattern('**/*.ts', 'X.TS')).toBe(false);
  });
  it.each(['!a', 'foo**bar', '../a', 'a/{b,c}', '[ab]', '/a', 'a\\b'])(
    'rejects unsupported pattern syntax',
    (pattern) => expect(patternProblem(pattern)).toBeDefined(),
  );
});
