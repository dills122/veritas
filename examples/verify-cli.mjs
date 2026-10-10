import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const executable = resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the installed node_modules/.bin/veritas path');
const root = await mkdtemp(
  join(await realpath(tmpdir()), 'veritas-example-cli-'),
);
const examples = join(dirname(dirname(await realpath(executable))), 'examples');
const commands = [];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function run(project, command, expected = 0, extra = []) {
  const args = [command, '--project', project, '--json', ...extra];
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(
    result.status,
    expected,
    `${args.join(' ')}\n${result.stdout}\n${result.stderr}`,
  );
  assert.equal(result.stderr, '');
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.schemaVersion, 1);
  commands.push({
    args: args.map((arg) => arg.replace(root, '<temporary-root>')),
    exit: result.status,
    outcome: envelope.outcome,
    diagnostics: envelope.diagnostics.map((item) => item.code),
  });
  return envelope;
}
function runHuman(project, command, expected = 0, extra = []) {
  const args = [command, '--project', project, ...extra];
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(
    result.status,
    expected,
    `${args.join(' ')}\n${result.stdout}\n${result.stderr}`,
  );
  commands.push({
    args: args.map((arg) => arg.replace(root, '<temporary-root>')),
    exit: result.status,
    mode: 'human',
    stdout: result.stdout,
    stderr: result.stderr,
  });
  return result;
}
async function initialize(
  name,
  profile = 'baseline',
  extra = [],
  targets = 'codex,claude,kiro-ide',
) {
  const project = join(root, name);
  await mkdir(project, { recursive: true });
  run(project, 'init', 0, [
    '--source',
    '../company-library',
    '--profile',
    `company/${profile}`,
    '--targets',
    targets,
    ...extra,
  ]);
  return project;
}
try {
  await cp(join(examples, 'company-library'), join(root, 'company-library'), {
    recursive: true,
  });
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), '0.1.0-rc.0');
  assert.equal(spawnSync(executable, ['--help']).status, 0);
  const project = await initialize('project');
  await assert.rejects(stat(join(project, 'AGENTS.md')), { code: 'ENOENT' });
  run(project, 'validate');
  run(project, 'plan');
  run(project, 'check', 1);
  run(project, 'sync');
  run(project, 'check');
  const humanCheck = runHuman(project, 'check');
  assert.match(humanCheck.stdout, /up to date/u);
  assert.equal(humanCheck.stdout.trim().split('\n').length, 2);
  assert.equal(humanCheck.stderr, '');
  const humanValidate = runHuman(project, 'validate');
  assert.match(humanValidate.stdout, /Validated/u);
  assert.equal(humanValidate.stdout.trim().split('\n').length, 2);
  const humanSync = runHuman(project, 'sync');
  assert.match(humanSync.stdout, /up to date/u);
  const agentsBefore = await readFile(join(project, 'AGENTS.md'));
  const mtime = (await stat(join(project, 'AGENTS.md'))).mtimeMs;
  run(project, 'sync');
  assert.equal((await stat(join(project, 'AGENTS.md'))).mtimeMs, mtime);
  const binary = await readFile(
    join(examples, 'company-library/skills/review-repository/assets/bytes.bin'),
  );
  for (const family of ['.agents', '.claude', '.kiro']) {
    assert.deepEqual(
      await readFile(
        join(project, family, 'skills/review-repository/assets/bytes.bin'),
      ),
      binary,
    );
    assert.ok(
      (
        await stat(
          join(project, family, 'skills/review-repository/scripts/inert.sh'),
        )
      ).mode & 0o111,
    );
  }
  const upstreamRule = join(root, 'company-library/steering/baseline.md');
  await writeFile(
    upstreamRule,
    `${await readFile(upstreamRule, 'utf8')}\nAn intentional upstream update.\n`,
  );
  run(project, 'check');
  run(project, 'sync');
  assert.deepEqual(await readFile(join(project, 'AGENTS.md')), agentsBefore);
  const oldLock = await readFile(join(project, 'veritas.lock.json'));
  assert.equal(run(project, 'update').data.generationPending, true);
  assert.notDeepEqual(
    await readFile(join(project, 'veritas.lock.json')),
    oldLock,
  );
  assert.deepEqual(await readFile(join(project, 'AGENTS.md')), agentsBefore);
  run(project, 'plan');
  run(project, 'check', 1);
  run(project, 'sync');
  run(project, 'check');
  const lock = await readFile(join(project, 'veritas.lock.json'));
  await rm(
    join(project, '.veritas/runtime/cache', JSON.parse(lock).source.treeDigest),
    { recursive: true },
  );
  run(project, 'check', 4);
  run(project, 'update', 0, ['--restore']);
  assert.deepEqual(await readFile(join(project, 'veritas.lock.json')), lock);
  run(project, 'check');
  assert.equal(run(project, 'recover').data.action, 'none');
  const ownedTestLock = join(project, '.veritas/runtime/sync.lock');
  const ownedTestBytes = JSON.stringify({
    schemaVersion: 1,
    nonce: randomUUID(),
    pid: process.pid,
  });
  await writeFile(ownedTestLock, ownedTestBytes, { flag: 'wx', mode: 0o600 });
  run(project, 'check', 5);
  run(project, 'sync', 5);
  run(project, 'recover', 5);
  assert.equal(await readFile(ownedTestLock, 'utf8'), ownedTestBytes);
  // This live runner created the fixture lock; no abandoned-owner inference is made.
  await rm(ownedTestLock);
  const localProject = join(root, 'with-local');
  await mkdir(join(localProject, '.veritas'), { recursive: true });
  await cp(
    join(examples, 'local-overlay'),
    join(localProject, '.veritas/local'),
    { recursive: true },
  );
  await initialize('with-local', 'baseline', [
    '--local',
    '.veritas/local',
    '--local-profile',
    'project',
  ]);
  run(localProject, 'plan');
  run(localProject, 'sync');
  const localLock = await readFile(join(localProject, 'veritas.lock.json'));
  const localRule = join(
    localProject,
    '.veritas/local/steering/project-context.md',
  );
  await writeFile(
    localRule,
    `${await readFile(localRule, 'utf8')}\nA live project addition.\n`,
  );
  run(localProject, 'check', 1);
  run(localProject, 'plan');
  run(localProject, 'sync');
  run(localProject, 'check');
  assert.match(
    await readFile(join(localProject, 'AGENTS.md'), 'utf8'),
    /A live project addition/u,
  );
  assert.deepEqual(
    await readFile(join(localProject, 'veritas.lock.json')),
    localLock,
  );
  const native = await initialize('native', 'native-typescript');
  run(native, 'validate');
  run(native, 'sync');
  run(native, 'check');
  const unsupported = join(root, 'unsupported');
  await mkdir(unsupported);
  run(unsupported, 'init', 2, [
    '--source',
    '../company-library',
    '--profile',
    'company/typescript',
    '--targets',
    'codex',
  ]);
  await assert.rejects(stat(join(unsupported, 'veritas.yaml')), {
    code: 'ENOENT',
  });
  const adapted = await initialize('adapted', 'baseline', [], 'codex');
  await cp(
    join(examples, 'project/codex-adaptation.yaml'),
    join(adapted, 'veritas.yaml'),
  );
  run(adapted, 'validate');
  const adaptedPlan = run(adapted, 'plan');
  assert.ok(
    adaptedPlan.diagnostics.some(
      (diagnostic) => diagnostic.code === 'ACTIVATION_ADAPTED',
    ),
  );
  run(adapted, 'sync');
  run(adapted, 'check');
  const unmanaged = await initialize('unmanaged');
  await writeFile(
    join(unmanaged, 'AGENTS.md'),
    'Keep this unmanaged guidance.\n',
  );
  run(unmanaged, 'plan', 3);
  const unmanagedSync = run(unmanaged, 'sync', 3);
  assert.ok(
    unmanagedSync.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'OUTPUT_CONFLICT' &&
        diagnostic.source?.path === 'AGENTS.md',
    ),
  );
  assert.equal(
    await readFile(join(unmanaged, 'AGENTS.md'), 'utf8'),
    'Keep this unmanaged guidance.\n',
  );
  await writeFile(
    join(project, 'AGENTS.md'),
    'Keep this edited managed guidance.\n',
  );
  run(project, 'plan', 3);
  const editedSync = run(project, 'sync', 3);
  assert.ok(
    editedSync.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'OUTPUT_CONFLICT' &&
        diagnostic.source?.path === 'AGENTS.md',
    ),
  );
  const humanConflict = runHuman(project, 'sync', 3);
  assert.match(humanConflict.stderr, /OUTPUT_CONFLICT AGENTS.md/u);
  assert.match(humanConflict.stderr, /veritas plan/u);
  assert.equal(
    await readFile(join(project, 'AGENTS.md'), 'utf8'),
    'Keep this edited managed guidance.\n',
  );
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        packageVersion: version.stdout.trim(),
        node: process.version,
        platform: process.platform,
        executable,
        binarySha256: hash(binary),
        lockRestoreSha256: hash(lock),
        commands,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
