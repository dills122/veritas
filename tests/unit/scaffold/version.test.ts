import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../../../src/index.js';

describe('public package version', () => {
  it('matches the distribution manifest', async () => {
    const manifest: unknown = JSON.parse(
      await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
    );
    expect(manifest).toHaveProperty('version', VERSION);
    expect(VERSION).toBe('0.1.0-rc.0');
  });
});
