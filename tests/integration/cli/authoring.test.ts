import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { expandBraces } from '../../../src/cli/adopt.js';
const execute = promisify(execFile);
const bin = resolve('dist/bin.js');
const cleanups: string[] = [];
async function project() {
  const base = await mkdtemp(join(await realpath(tmpdir()), 'veritas-auth-'));
  cleanups.push(base);
  return base;
}
async function cli(cwd: string, ...args: string[]) {
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
async function write(root: string, path: string, text: string) {
  await mkdir(join(root, path, '..'), { recursive: true });
  await writeFile(join(root, path), text);
}
async function scaffolded() {
  const root = await project();
  const init = await cli(
    root,
    'init',
    '--scaffold',
    '--targets',
    'codex,claude,kiro-ide',
  );
  expect(init.code).toBe(0);
  return root;
}
afterEach(async () => {
  await Promise.all(
    cleanups
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

it('expands brace patterns into equivalent plain patterns', () => {
  expect(expandBraces('src/**/*.{ts,tsx}')).toEqual([
    'src/**/*.ts',
    'src/**/*.tsx',
  ]);
  expect(expandBraces('{a,b}/{c,d}')).toHaveLength(4);
  expect(expandBraces('plain/*.md')).toEqual(['plain/*.md']);
});

it('scaffolds a working starter library in one command', async () => {
  const root = await scaffolded();
  expect((await cli(root, 'validate')).code).toBe(0);
  expect((await cli(root, 'sync')).code).toBe(0);
  expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toContain(
    'Project guidance',
  );
  expect((await cli(root, 'check')).code).toBe(0);
  const again = await cli(root, 'init', '--scaffold', '--targets', 'codex');
  expect(again.code).toBe(3);
  expect(again.stderr).toContain('SCAFFOLD_EXISTS');
});

it('rejects conflicting or missing init arguments', async () => {
  const root = await project();
  const both = await cli(
    root,
    'init',
    '--scaffold',
    '--source',
    'x',
    '--targets',
    'codex',
  );
  expect(both.code).toBe(2);
  expect(both.stderr).toContain('do not combine');
  const none = await cli(root, 'init', '--targets', 'codex');
  expect(none.code).toBe(2);
  expect(none.stderr).toContain('--scaffold');
  await expect(stat(join(root, '.veritas'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

it('warns when a local source changed after it was locked', async () => {
  const root = await scaffolded();
  await write(
    root,
    '.veritas/library/steering/project-guidance.md',
    '---\nid: project-guidance\ndescription: Changed\nactivation: {mode: always}\n---\nNew text.\n',
  );
  const stale = await cli(root, 'plan');
  expect(stale.stderr).toContain('SOURCE_STALE');
  expect((await cli(root, 'update')).code).toBe(0);
  const fresh = await cli(root, 'plan');
  expect(fresh.stderr).not.toContain('SOURCE_STALE');
  expect(fresh.stdout).toContain('replace');
});

it('shows unified diffs for plan and check only when asked', async () => {
  const root = await scaffolded();
  await cli(root, 'sync');
  await write(
    root,
    '.veritas/library/steering/project-guidance.md',
    '---\nid: project-guidance\ndescription: Changed\nactivation: {mode: always}\n---\nBrand new line.\n',
  );
  await cli(root, 'update');
  const plain = await cli(root, 'plan');
  expect(plain.stdout).not.toContain('@@');
  const diff = await cli(root, 'plan', '--diff');
  expect(diff.stdout).toContain('--- AGENTS.md (on disk)');
  expect(diff.stdout).toContain('+Brand new line.');
  const json = JSON.parse(
    (await cli(root, '--json', 'plan', '--diff')).stdout,
  ) as {
    data: { operations: { path: string; diff?: string }[] };
  };
  expect(
    json.data.operations.find((o) => o.path === 'AGENTS.md')?.diff,
  ).toContain('@@');
  const checked = await cli(root, 'check', '--diff');
  expect(checked.code).toBe(1);
  expect(checked.stdout).toContain('+Brand new line.');
});

it('adopts steering and skills without touching the originals, then migrates cleanly', async () => {
  const root = await scaffolded();
  await write(root, 'AGENTS.md', '# Team rules\nBe kind.\n');
  await write(
    root,
    '.kiro/steering/ts-style.md',
    '---\ninclusion: fileMatch\nfileMatchPattern: "src/**/*.{ts,tsx}"\n---\n# TS style\nUse strict.\n',
  );
  await write(
    root,
    '.kiro/steering/release.md',
    '---\ninclusion: manual\n---\n# Release\nTag first.\n',
  );
  await write(
    root,
    '.claude/rules/testing.md',
    '---\npaths:\n  - "tests/**"\n---\n# Testing\nWrite tests.\n',
  );
  await write(
    root,
    '.claude/skills/lint-fix/SKILL.md',
    '---\nname: lint-fix\ndescription: Fix lint\n---\nRun the script.\n',
  );
  await write(
    root,
    '.claude/skills/lint-fix/scripts/run.sh',
    '#!/bin/sh\necho hi\n',
  );
  await chmod(join(root, '.claude/skills/lint-fix/scripts/run.sh'), 0o755);
  const original = await readFile(join(root, 'AGENTS.md'), 'utf8');
  for (const path of [
    'AGENTS.md',
    '.kiro/steering/ts-style.md',
    '.kiro/steering/release.md',
    '.claude/rules/testing.md',
    '.claude/skills/lint-fix',
  ]) {
    const result = await cli(root, 'adopt', path);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('was not changed or removed');
  }
  expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe(original);
  const ts = await readFile(
    join(root, '.veritas/library/steering/ts-style.md'),
    'utf8',
  );
  expect(ts).toContain('src/**/*.ts');
  expect(ts).toContain('src/**/*.tsx');
  expect(
    (await stat(join(root, '.veritas/library/skills/lint-fix/scripts/run.sh')))
      .mode & 0o111,
  ).not.toBe(0);
  expect(
    await readFile(join(root, '.veritas/library/veritas.library.yaml'), 'utf8'),
  ).toContain('# Library manifest');
  // The originals still collide until the user removes them.
  await cli(root, 'update');
  expect((await cli(root, 'plan')).code).toBe(3);
  await rm(join(root, 'AGENTS.md'));
  await rm(join(root, '.kiro'), { recursive: true });
  await rm(join(root, '.claude'), { recursive: true });
  expect((await cli(root, 'plan')).code).toBe(0);
  expect((await cli(root, 'sync')).code).toBe(0);
  expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toContain('Be kind.');
  expect(
    await readFile(join(root, '.claude/rules/repo--ts-style.md'), 'utf8'),
  ).toContain('src/**/*.tsx');
  expect(
    await readFile(join(root, '.kiro/steering/repo--release.md'), 'utf8'),
  ).toContain('manual');
  expect((await cli(root, 'check')).code).toBe(0);
});

it('rolls back and explains when adopted content is invalid', async () => {
  const root = await scaffolded();
  await write(root, 'notes.md', '@docs/other.md\n');
  const before = await readFile(
    join(root, '.veritas/library/veritas.library.yaml'),
    'utf8',
  );
  const result = await cli(root, 'adopt', 'notes.md');
  expect(result.code).toBe(2);
  expect(result.stderr).toContain('NATIVE_IMPORT_UNSUPPORTED');
  expect(
    await readFile(join(root, '.veritas/library/veritas.library.yaml'), 'utf8'),
  ).toBe(before);
  await expect(
    stat(join(root, '.veritas/library/steering/notes.md')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

it('refuses to adopt generated, missing or colliding content', async () => {
  const root = await scaffolded();
  await cli(root, 'sync');
  const managed = await cli(root, 'adopt', 'AGENTS.md');
  expect(managed.code).toBe(2);
  expect(managed.stderr).toContain('ADOPT_ALREADY_MANAGED');
  const missing = await cli(root, 'adopt', 'nope.md');
  expect(missing.stderr).toContain('ADOPT_PATH_INVALID');
  await write(root, 'extra.md', '# Extra\nText.\n');
  expect((await cli(root, 'adopt', 'extra.md')).code).toBe(0);
  await write(root, 'docs/extra.md', '# Another\nText.\n');
  const clash = await cli(root, 'adopt', 'docs/extra.md');
  expect(clash.code).toBe(3);
  expect(clash.stderr).toContain('ADOPT_ID_EXISTS');
  expect(
    (await cli(root, 'adopt', 'docs/extra.md', '--id', 'extra-two')).code,
  ).toBe(0);
});

it('resolves adopt paths from the shell directory and refuses Veritas control files', async () => {
  const root = await scaffolded();
  await execute('git', ['init', '-q'], { cwd: root });
  await write(root, 'sub/NOTES.md', '# Notes\nHello.\n');
  await mkdir(join(root, 'sub/deep'), { recursive: true });
  const fromSub = await cli(join(root, 'sub'), 'adopt', 'NOTES.md');
  expect(fromSub.code).toBe(0);
  await write(root, 'TWO.md', '# Two\nHi.\n');
  expect(
    (await cli(join(root, 'sub/deep'), 'adopt', '../../TWO.md')).code,
  ).toBe(0);
  for (const path of [
    'veritas.yaml',
    'veritas.lock.json',
    '.veritas/library/veritas.library.yaml',
  ]) {
    const refused = await cli(root, 'adopt', path);
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain('ADOPT_PATH_INVALID');
  }
  await write(root, '___.md', '# x\n');
  expect((await cli(root, 'adopt', '___.md')).stderr).toContain(
    'Could not derive a name',
  );
});

it('tells users how to recover from a held lock', async () => {
  const root = await scaffolded();
  await write(root, '.veritas/runtime/sync.lock', 'junk');
  const busy = await cli(root, 'sync');
  expect(busy.code).toBe(5);
  expect(busy.stderr).toContain('veritas recover');
});
