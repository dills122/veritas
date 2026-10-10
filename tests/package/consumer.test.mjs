import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
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
    if (option === '--help') {
      assert.match(stdout, /Initialize/u);
      assert.match(
        stdout,
        /Workflow: init -> validate -> plan -> sync -> check/u,
      );
      assert.match(stdout, /kiro-cli/u);
    }
  }
});

test('installed guides and examples have reachable relative documentation links', async () => {
  const packageRoot = join(consumer, 'node_modules', 'veritas');
  for (const path of [
    'README.md',
    'docs/user-guide.md',
    'docs/compatibility.md',
    'docs/troubleshooting.md',
    'examples/README.md',
  ]) {
    const document = join(packageRoot, path);
    const markdown = await readFile(document, 'utf8');
    for (const match of markdown.matchAll(/\]\(([^)]+)\)/gu)) {
      const destination = match[1];
      if (!destination || /^(?:https?:|mailto:|#)/u.test(destination)) continue;
      const relativePath = destination.split('#')[0];
      assert.ok(relativePath);
      await stat(resolve(dirname(document), relativePath));
    }
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
