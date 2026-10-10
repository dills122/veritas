import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGitRunner } from '../../../src/sources/git-runner.js';

const directories: string[] = [];
async function options() {
  const cwd = await mkdtemp(
    join(await realpath(tmpdir()), 'veritas-git-runner-'),
  );
  directories.push(cwd);
  return { cwd, timeoutMs: 5_000, maxOutputBytes: 4096 };
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
describe('bounded sanitized Git process runner', () => {
  it('captures bounded successful output', async () => {
    const output = await createGitRunner()(['--version'], await options());
    expect(new TextDecoder().decode(output)).toMatch(/^git version /u);
  });
  it('reports missing Git without leaking executable details', async () => {
    await expect(
      createGitRunner('/nonexistent/git-secret')([], await options()),
    ).rejects.toMatchObject({
      diagnostic: { code: 'GIT_UNAVAILABLE' },
      exitCode: 4,
    });
  });
  it('enforces output limits and process timeouts', async () => {
    const config = await options();
    await expect(
      createGitRunner(process.execPath)(
        ['-e', 'process.stdout.write("x".repeat(100000))'],
        { ...config, maxOutputBytes: 1024 },
      ),
    ).rejects.toMatchObject({ diagnostic: { code: 'GIT_OUTPUT_LIMIT' } });
    await expect(
      createGitRunner(process.execPath)(['-e', 'setInterval(()=>{},1000)'], {
        ...config,
        timeoutMs: 30,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: 'GIT_TIMEOUT' } });
  });
  it('sanitizes stderr from failed authentication and supports binary input/output', async () => {
    const config = await options();
    await expect(
      createGitRunner(process.execPath)(
        ['-e', 'process.stderr.write("secret-password");process.exit(1)'],
        config,
      ),
    ).rejects.toMatchObject({
      message: 'Git command failed',
      diagnostic: { code: 'GIT_FAILED' },
    });
    const bytes = new Uint8Array([0, 255, 128, 10]);
    const output = await createGitRunner(process.execPath)(
      ['-e', 'process.stdin.pipe(process.stdout)'],
      { ...config, input: bytes },
    );
    expect(output).toEqual(bytes);
  });
});
