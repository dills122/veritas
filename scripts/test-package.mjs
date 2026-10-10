import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const consumer = await mkdtemp(join(tmpdir(), 'veritas-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function run(command, args, cwd = consumer, env = process.env) {
  const result = await execute(command, args, {
    cwd,
    env,
    timeout: 120_000,
    maxBuffer: 2_000_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

try {
  const { stdout } = await execute(
    npm,
    ['pack', '--json', '--ignore-scripts', '--pack-destination', consumer],
    { cwd: root, timeout: 120_000 },
  );
  const packed = JSON.parse(stdout);
  assert.ok(Array.isArray(packed) && packed.length === 1);
  const archive = packed[0];
  assert.equal(typeof archive.filename, 'string');
  assert.ok(archive.files.some((file) => file.path === 'dist/bin.js'));
  assert.ok(archive.files.some((file) => file.path === 'dist/index.d.ts'));
  const packagedGuides = new Set([
    'docs/user-guide.md',
    'docs/compatibility.md',
    'docs/troubleshooting.md',
    'examples/README.md',
  ]);
  for (const path of [
    ...packagedGuides,
    'examples/company-library/veritas.library.yaml',
    'examples/project/codex-adaptation.yaml',
    'examples/local-overlay/veritas.library.yaml',
  ])
    assert.ok(
      archive.files.some((file) => file.path === path),
      `Missing packaged guide/example: ${path}`,
    );
  for (const file of archive.files) {
    assert.ok(
      file.path.startsWith('dist/') ||
        packagedGuides.has(file.path) ||
        [
          'examples/company-library/',
          'examples/local-overlay/',
          'examples/project/',
        ].some((prefix) => file.path.startsWith(prefix)) ||
        ['package.json', 'README.md', 'LICENSE', 'LICENSE.md'].includes(
          file.path,
        ),
      `Unexpected packed file: ${file.path}`,
    );
  }
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({
      name: 'veritas-clean-consumer',
      private: true,
      type: 'module',
    }),
  );
  await run(npm, [
    'install',
    '--prefer-offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    join(consumer, archive.filename),
  ]);
  const sourceManifest = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8'),
  );
  await run(
    process.execPath,
    ['--test', join(root, 'tests/package/consumer.test.mjs')],
    consumer,
    {
      ...process.env,
      VERITAS_CONSUMER_ROOT: consumer,
      VERITAS_EXPECTED_VERSION: sourceManifest.version,
    },
  );
  await copyFile(
    join(root, 'tests/package/consumer.ts.txt'),
    join(consumer, 'consumer.ts'),
  );
  await run(process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'),
    '--strict',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ES2023',
    '--noEmit',
    '--types',
    'node',
    '--typeRoots',
    join(root, 'node_modules/@types'),
    join(consumer, 'consumer.ts'),
  ]);
  console.log(
    'Packed CLI, quiet core import, clean consumer and public declarations verified.',
  );
  const cliResult = await run(process.execPath, [
    join(root, 'examples/verify-cli.mjs'),
    join(consumer, 'node_modules/.bin/veritas'),
  ]);
  await mkdir(join(root, 'artifacts'), { recursive: true });
  await writeFile(
    join(root, 'artifacts/cli-verification.json'),
    `${JSON.stringify(JSON.parse(cliResult.stdout), null, 2)}\n`,
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}
