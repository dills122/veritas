import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { gitFailureHint } from '../../../src/sources/git-runner.js';
const execute = promisify(execFile);
const bin = resolve('dist/bin.js');
const cleanups: string[] = [];
async function root() {
  const base = await mkdtemp(join(await realpath(tmpdir()), 'veritas-ux-'));
  cleanups.push(base);
  return base;
}
async function human(cwd: string, ...args: string[]) {
  try {
    const result = await execute(process.execPath, [bin, ...args], {
      cwd,
      timeout: 30_000,
    });
    return { code: 0, ...result };
  } catch (cause) {
    const failed = cause as { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
  }
}
async function library(base: string) {
  const dir = join(base, 'library');
  await mkdir(dir);
  await writeFile(
    join(dir, 'veritas.library.yaml'),
    'schemaVersion: 1\nsteering: [{id: baseline, path: baseline.md}]\nskills: []\nprofiles: {baseline: {steering: [baseline], skills: []}}\n',
  );
  await writeFile(
    join(dir, 'baseline.md'),
    '---\nid: baseline\ndescription: Shared\nactivation: {mode: always}\n---\nBe kind.\n',
  );
  return dir;
}
afterEach(async () => {
  await Promise.all(
    cleanups
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

it('classifies Git failures without echoing stderr', () => {
  expect(gitFailureHint('fatal: Authentication failed for https://x')).toMatch(
    /Authentication failed/u,
  );
  expect(
    gitFailureHint('fatal: Could not resolve host: example.invalid'),
  ).toMatch(/unreachable/u);
  expect(gitFailureHint("fatal: couldn't find remote ref nope")).toMatch(
    /ref/u,
  );
  expect(gitFailureHint('weird secret-token')).not.toMatch(/secret-token/u);
});

it('explains a missing project directory', async () => {
  const base = await root();
  const result = await human(base, 'check', '--project', join(base, 'nope'));
  expect(result.code).toBe(2);
  expect(result.stderr).toContain('PROJECT_NOT_FOUND');
  expect(result.stderr).toContain('Pass an existing directory');
});

it('explains a missing local source', async () => {
  const base = await root();
  await mkdir(join(base, 'project'));
  const result = await human(
    base,
    'init',
    '--project',
    join(base, 'project'),
    '--source',
    '../missing',
    '--profile',
    'company/baseline',
    '--targets',
    'codex',
  );
  expect(result.code).toBe(4);
  expect(result.stderr).toContain('Source directory does not exist');
  expect(result.stderr).toContain('--source');
});

it('warns about unignored runtime state and gives per-file conflict hints', async () => {
  const base = await root(),
    lib = await library(base),
    project = join(base, 'project');
  await mkdir(project);
  await execute('git', ['init', '-q'], { cwd: project });
  await writeFile(join(project, 'AGENTS.md'), '# mine\n');
  const init = await human(
    project,
    'init',
    '--source',
    lib,
    '--profile',
    'company/baseline',
    '--targets',
    'codex',
  );
  expect(init.code).toBe(0);
  expect(init.stderr).toContain('RUNTIME_NOT_IGNORED');
  expect(init.stderr).toContain('.gitignore');
  expect(init.stdout).toContain('never overwrites unmanaged files');
  const plan = await human(project, 'plan');
  expect(plan.code).toBe(3);
  expect(plan.stderr).toContain('rename or remove AGENTS.md');
  await writeFile(join(project, '.gitignore'), '.veritas/runtime/\n');
  await rm(join(project, 'AGENTS.md'));
  expect((await human(project, 'sync')).code).toBe(0);
  await writeFile(join(project, 'AGENTS.md'), 'edited\n');
  const modified = await human(project, 'check');
  expect(modified.code).toBe(3);
  expect(modified.stderr).toContain('git diff -- AGENTS.md');
});

it('tells users to update after editing locked configuration', async () => {
  const base = await root(),
    lib = await library(base),
    project = join(base, 'project');
  await mkdir(project);
  await human(
    project,
    'init',
    '--source',
    lib,
    '--profile',
    'company/baseline',
    '--targets',
    'codex',
  );
  const config = join(project, 'veritas.yaml');
  const { readFile } = await import('node:fs/promises');
  await writeFile(
    config,
    (await readFile(config, 'utf8'))
      .replace('id: codex', 'id: claude')
      .replace('codex-repo-v1', 'claude-repo-v1'),
  );
  const result = await human(project, 'plan');
  expect(result.code).toBe(2);
  expect(result.stderr).toContain('veritas update');
});
