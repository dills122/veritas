import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const consumer = process.env.VERITAS_CONSUMER_ROOT;
const version = process.env.VERITAS_EXPECTED_VERSION;
assert.ok(consumer && version, 'Run through npm run test:package');
const binary = join(consumer, 'node_modules', 'veritas', 'dist', 'bin.js');

test('installed executable prints help and version', async () => {
  const command =
    process.platform === 'win32'
      ? process.execPath
      : join(consumer, 'node_modules', '.bin', 'veritas');
  for (const option of ['--help', '--version']) {
    const args = process.platform === 'win32' ? [binary, option] : [option];
    const { stdout, stderr } = await execute(command, args, { cwd: consumer });
    assert.equal(stderr, '');
    assert.ok(
      stdout.includes(option === '--help' ? 'Usage: veritas' : version),
    );
  }
});

test('consumer resolves public core quietly without filesystem writes', async () => {
  const before = await readdir(consumer);
  const { stdout, stderr } = await execute(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const core = await import('veritas'); if(core.VERSION !== ${JSON.stringify(version)}) throw new Error('Wrong version');`,
    ],
    { cwd: consumer },
  );
  assert.equal(stdout, '');
  assert.equal(stderr, '');
  assert.deepEqual(await readdir(consumer), before);
});
