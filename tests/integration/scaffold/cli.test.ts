import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const binary = fileURLToPath(new URL('../../../dist/bin.js', import.meta.url));
const core = new URL('../../../dist/index.js', import.meta.url).href;

describe('standalone scaffold CLI', () => {
  it.each(['--help', '--version'])(
    'runs %s without project files',
    async (option) => {
      const cwd = await mkdtemp(join(tmpdir(), 'veritas-cli-'));
      try {
        const { stdout, stderr } = await execute(
          process.execPath,
          [binary, option],
          { cwd },
        );
        expect(stderr).toBe('');
        expect(stdout).toContain(
          option === '--help' ? 'Usage: veritas' : '0.1.0-rc.0',
        );
        expect(await readdir(cwd)).toEqual([]);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
  );

  it('imports the core quietly without creating project files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'veritas-import-'));
    try {
      const { stdout, stderr } = await execute(
        process.execPath,
        ['--input-type=module', '-e', `await import(${JSON.stringify(core)})`],
        { cwd },
      );
      expect(stdout).toBe('');
      expect(stderr).toBe('');
      expect(await readdir(cwd)).toEqual([]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('rejects unknown commands', async () => {
    await expect(
      execute(process.execPath, [binary, 'unknown-command']),
    ).rejects.toMatchObject({ code: 2 });
  });
});
