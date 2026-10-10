import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
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
import { lockSchema } from '../../../src/config/schemas.js';
import { acquireLock } from '../../../src/sync/lock.js';
const execute = promisify(execFile);
const bin = resolve('dist/bin.js');
const cleanups: string[] = [];
async function fixture() {
  const base = await mkdtemp(join(await realpath(tmpdir()), 'veritas-cli-'));
  cleanups.push(base);
  const project = join(base, 'project'),
    library = join(base, 'library');
  await mkdir(project);
  await mkdir(join(library, 'skills/review/assets'), { recursive: true });
  await writeFile(
    join(library, 'veritas.library.yaml'),
    'schemaVersion: 1\nsteering: [{id: baseline, path: baseline.md}]\nskills: [{name: review, path: skills/review}]\nprofiles: {baseline: {steering: [baseline], skills: [review]}}\n',
  );
  await writeFile(
    join(library, 'baseline.md'),
    '---\nid: baseline\ndescription: Shared standards\nactivation: {mode: always}\n---\nKeep the first baseline.\n',
  );
  await writeFile(
    join(library, 'skills/review/SKILL.md'),
    '---\nname: review\ndescription: Review source\n---\nRead [data](assets/data.bin).\n',
  );
  await writeFile(
    join(library, 'skills/review/assets/data.bin'),
    new Uint8Array([0, 255, 1]),
  );
  return { base, project, library };
}
async function cli(project: string, ...args: string[]) {
  return invoke(project, args, true);
}
async function invoke(project: string, args: string[], json: boolean) {
  let stdout: string,
    stderr: string,
    code = 0;
  try {
    const result = await execute(
      process.execPath,
      [bin, ...args, '--project', project, ...(json ? ['--json'] : [])],
      { timeout: 30_000 },
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (cause) {
    if (
      cause instanceof Error &&
      'stdout' in cause &&
      'stderr' in cause &&
      'code' in cause
    ) {
      stdout = String(cause.stdout);
      stderr = String(cause.stderr);
      code = typeof cause.code === 'number' ? cause.code : 4;
    } else throw cause;
  }
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    value = undefined;
  }
  return { code, stdout, stderr, value };
}
afterEach(async () => {
  for (const path of cleanups.splice(0))
    await rm(path, { recursive: true, force: true });
});
it.each(['.', '..'])(
  'rejects an upstream root %s containing its consuming project',
  async (source) => {
    const { project, base } = await fixture();
    const root = source === '.' ? project : base;
    await writeFile(
      join(root, 'veritas.library.yaml'),
      'schemaVersion: 1\nsteering: [{id: baseline, path: baseline.md}]\nskills: []\nprofiles: {baseline: {steering: [baseline], skills: []}}\n',
    );
    await writeFile(
      join(root, 'baseline.md'),
      '---\nid: baseline\ndescription: Baseline\nactivation: {mode: always}\n---\nKeep source separate.\n',
    );
    const result = await cli(
      project,
      'init',
      '--source',
      source,
      '--profile',
      'company/baseline',
      '--targets',
      'codex',
    );
    expect(result.code).toBe(2);
    expect(result.value).toMatchObject({
      diagnostics: [{ code: 'SOURCE_ROOT_CONTAINS_PROJECT' }],
    });
    for (const path of [
      'veritas.yaml',
      'veritas.lock.json',
      '.veritas/runtime/cache',
      'AGENTS.md',
    ])
      await expect(stat(join(project, path))).rejects.toMatchObject({
        code: 'ENOENT',
      });
  },
);
it('inventories existing guidance during control-only initialization', async () => {
  const { project } = await fixture();
  const original = 'User-owned instructions.\n';
  await writeFile(join(project, 'AGENTS.md'), original);
  await writeFile(join(project, 'AGENTS.override.md'), 'Override remains.\n');
  await mkdir(join(project, 'nested'));
  await writeFile(join(project, 'nested/AGENTS.md'), 'Nested remains.\n');
  const result = await cli(
    project,
    'init',
    '--source',
    '../library',
    '--profile',
    'company/baseline',
    '--targets',
    'codex',
  );
  expect(result.code).toBe(0);
  expect(result.value).toMatchObject({
    data: { guidance: { generationBlocked: true } },
  });
  const entries = (
    result.value as { data: { guidance: { entries: unknown[] } } }
  ).data.guidance.entries;
  expect(entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: { id: 'AGENTS.md', path: 'AGENTS.md' },
        code: 'GUIDANCE_UNMANAGED',
        outputCollision: true,
      }),
      expect.objectContaining({
        source: { id: 'AGENTS.override.md', path: 'AGENTS.override.md' },
        code: 'GUIDANCE_SHADOW',
      }),
      expect.objectContaining({
        source: { id: 'nested/AGENTS.md', path: 'nested/AGENTS.md' },
        code: 'GUIDANCE_UNMANAGED',
      }),
    ]),
  );
  expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe(original);
  expect((await cli(project, 'sync')).code).toBe(3);
  expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe(original);
});
it('rejects a project-root local overlay before caching or committing controls', async () => {
  const { project } = await fixture();
  const result = await cli(
    project,
    'init',
    '--source',
    '../library',
    '--profile',
    'company/baseline',
    '--targets',
    'codex',
    '--local',
    '.',
  );
  expect(result.code).toBe(2);
  expect(result.value).toMatchObject({
    diagnostics: [{ code: 'SCHEMA_INVALID' }],
  });
  await expect(stat(join(project, 'veritas.yaml'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
it('initializes, validates, plans, syncs and checks one pinned combined-target project', async () => {
  const { project } = await fixture();
  const initialized = await cli(
    project,
    'init',
    '--source',
    '../library',
    '--profile',
    'company/baseline',
    '--targets',
    'codex,claude,kiro-ide',
  );
  expect(initialized.code).toBe(0);
  expect(initialized.stderr).toBe('');
  expect(initialized.value).toMatchObject({
    schemaVersion: 1,
    command: 'init',
    outcome: 'success',
  });
  await expect(stat(join(project, 'AGENTS.md'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect((await cli(project, 'validate')).code).toBe(0);
  expect((await cli(project, 'plan')).code).toBe(0);
  expect((await cli(project, 'check')).code).toBe(1);
  expect((await cli(project, 'sync')).code).toBe(0);
  expect(
    await readFile(join(project, '.kiro/skills/review/assets/data.bin')),
  ).toEqual(Buffer.from([0, 255, 1]));
  expect(await readFile(join(project, 'CLAUDE.md'), 'utf8')).toContain(
    '@AGENTS.md',
  );
  const before = await stat(join(project, 'AGENTS.md'));
  expect((await cli(project, 'sync')).code).toBe(0);
  expect((await stat(join(project, 'AGENTS.md'))).mtimeMs).toBe(before.mtimeMs);
  expect((await cli(project, 'check')).code).toBe(0);
});
it('keeps upstream edits pinned until explicit update and leaves generated output pending', async () => {
  const { project, library } = await fixture();
  expect(
    (
      await cli(
        project,
        'init',
        '--source',
        '../library',
        '--profile',
        'company/baseline',
        '--targets',
        'codex',
      )
    ).code,
  ).toBe(0);
  expect((await cli(project, 'sync')).code).toBe(0);
  const lock = await readFile(join(project, 'veritas.lock.json'));
  await writeFile(
    join(library, 'baseline.md'),
    '---\nid: baseline\ndescription: Shared standards\nactivation: {mode: always}\n---\nUse the second baseline.\n',
  );
  expect((await cli(project, 'sync')).code).toBe(0);
  expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toContain(
    'first baseline',
  );
  expect((await cli(project, 'update')).code).toBe(0);
  expect(await readFile(join(project, 'veritas.lock.json'))).not.toEqual(lock);
  expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toContain(
    'first baseline',
  );
  expect((await cli(project, 'check')).code).toBe(1);
  expect((await cli(project, 'sync')).code).toBe(0);
  expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toContain(
    'second baseline',
  );
});
it('preserves unmanaged and edited outputs and returns ownership exit 3', async () => {
  const { project } = await fixture();
  expect(
    (
      await cli(
        project,
        'init',
        '--source',
        '../library',
        '--profile',
        'company/baseline',
        '--targets',
        'codex',
      )
    ).code,
  ).toBe(0);
  await writeFile(join(project, 'AGENTS.md'), 'User-owned guidance\n');
  const unmanaged = await cli(project, 'sync');
  expect(unmanaged.code).toBe(3);
  expect(unmanaged.value).toMatchObject({
    diagnostics: [
      {
        code: 'OUTPUT_CONFLICT',
        source: { id: 'AGENTS.md', path: 'AGENTS.md' },
      },
      { code: 'PLAN_CONFLICT' },
    ],
  });
  expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe(
    'User-owned guidance\n',
  );
  await rm(join(project, 'AGENTS.md'));
  expect((await cli(project, 'sync')).code).toBe(0);
  await writeFile(join(project, 'AGENTS.md'), 'User edit\n');
  expect((await cli(project, 'check')).code).toBe(3);
  const edited = await cli(project, 'sync');
  expect(edited.code).toBe(3);
  expect(edited.value).toMatchObject({
    diagnostics: [
      {
        code: 'OUTPUT_CONFLICT',
        source: { id: 'AGENTS.md', path: 'AGENTS.md' },
      },
      { code: 'PLAN_CONFLICT' },
    ],
  });
  expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe(
    'User edit\n',
  );
});
it('identifies a corrupt manifest when sync refuses the plan', async () => {
  const { project } = await fixture();
  expect(
    (
      await cli(
        project,
        'init',
        '--source',
        '../library',
        '--profile',
        'company/baseline',
        '--targets',
        'codex',
      )
    ).code,
  ).toBe(0);
  expect((await cli(project, 'sync')).code).toBe(0);
  const before = await readFile(join(project, 'AGENTS.md'));
  await writeFile(join(project, '.veritas/manifest.json'), '{}\n');
  const result = await cli(project, 'sync');
  expect(result.code).toBe(3);
  expect(result.stderr).toBe('');
  expect(result.value).toMatchObject({
    diagnostics: [
      {
        code: 'MANIFEST_INVALID',
        source: {
          id: '.veritas/manifest.json',
          path: '.veritas/manifest.json',
        },
      },
      { code: 'PLAN_CONFLICT' },
    ],
  });
  expect(await readFile(join(project, 'AGENTS.md'))).toEqual(before);
  expect(await readFile(join(project, '.veritas/manifest.json'), 'utf8')).toBe(
    '{}\n',
  );
});
it('summarizes human workflows while keeping structured output complete', async () => {
  const { project, library } = await fixture();
  const initialized = await invoke(
    project,
    [
      'init',
      '--source',
      '../library',
      '--profile',
      'company/baseline',
      '--targets',
      'codex,claude,kiro-ide',
    ],
    false,
  );
  expect(initialized.code).toBe(0);
  expect(initialized.stdout).toContain('veritas.yaml');
  expect(initialized.stdout).toContain('veritas.lock.json');
  expect(initialized.stdout.trim().split('\n').length).toBeLessThan(12);
  const planned = await invoke(project, ['plan'], false);
  expect(planned.stdout).toContain('create AGENTS.md');
  expect(planned.stdout).not.toContain('sha256');
  const drift = await invoke(project, ['check'], false);
  expect(drift.code).toBe(1);
  expect(drift.stdout).toContain('create AGENTS.md');
  const synced = await invoke(project, ['sync'], false);
  expect(synced.code).toBe(0);
  expect(synced.stdout.trim().split('\n').length).toBeLessThan(8);
  const clean = await invoke(project, ['check'], false);
  expect(clean.code).toBe(0);
  expect(clean.stdout).toContain('up to date');
  expect(clean.stdout.trim().split('\n').length).toBe(2);
  const structured = await cli(project, 'plan');
  expect(structured.stderr).toBe('');
  const expectedHash: unknown = expect.any(String);
  const expectedArtifacts: unknown = expect.any(Array);
  const expectedOperations: unknown = expect.arrayContaining([
    expect.objectContaining({
      path: 'AGENTS.md',
      kind: 'unchanged',
      expectedBefore: {
        kind: 'file',
        sha256: expectedHash,
        executable: false,
      },
    }),
  ]);
  expect(structured.value).toMatchObject({
    data: {
      operations: expectedOperations,
      manifest: { artifacts: expectedArtifacts },
    },
  });
  await writeFile(
    join(library, 'baseline.md'),
    (await readFile(join(library, 'baseline.md'), 'utf8')) +
      '\nUpdated source.\n',
  );
  const updated = await invoke(project, ['update'], false);
  expect(updated.code).toBe(0);
  expect(updated.stdout).toContain('plan');
  expect(updated.stdout.trim().split('\n').length).toBeLessThan(8);
  const recovered = await invoke(project, ['recover'], false);
  expect(recovered.code).toBe(0);
  expect(recovered.stdout).toContain('No interrupted transaction');
  await writeFile(join(project, 'AGENTS.md'), 'Keep this external edit.\n');
  const conflict = await invoke(project, ['sync'], false);
  expect(conflict.code).toBe(3);
  expect(conflict.stderr).toContain('OUTPUT_CONFLICT AGENTS.md');
  expect(conflict.stderr).toContain('plan');
  expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe(
    'Keep this external edit.\n',
  );
});
it('keeps read-only cache failures offline and restores exact local pins without rewriting lock', async () => {
  const { project, library } = await fixture();
  expect(
    (
      await cli(
        project,
        'init',
        '--source',
        '../library',
        '--profile',
        'company/baseline',
        '--targets',
        'codex',
      )
    ).code,
  ).toBe(0);
  const original = await readFile(join(project, 'veritas.lock.json'));
  const value: unknown = JSON.parse(original.toString('utf8')),
    lock = lockSchema.parse(value);
  const cache = join(project, '.veritas/runtime/cache', lock.source.treeDigest);
  await rm(cache, { recursive: true });
  expect((await cli(project, 'validate')).code).toBe(4);
  await expect(stat(cache)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(join(project, 'veritas.lock.json'))).toEqual(original);
  expect((await cli(project, 'update', '--restore')).code).toBe(0);
  expect(await readFile(join(project, 'veritas.lock.json'))).toEqual(original);
  await rm(cache, { recursive: true });
  await writeFile(join(library, 'baseline.md'), 'changed upstream bytes');
  expect((await cli(project, 'update', '--restore')).code).toBe(4);
  expect(await readFile(join(project, 'veritas.lock.json'))).toEqual(original);
});
it('incorporates live local additions without repinning upstream', async () => {
  const { project } = await fixture();
  const local = join(project, '.veritas/local');
  await mkdir(local, { recursive: true });
  await writeFile(
    join(local, 'veritas.library.yaml'),
    'schemaVersion: 1\nsteering: [{id: project, path: project.md}]\nskills: []\nprofiles: {project: {steering: [project], skills: []}}\n',
  );
  const content = (body: string) =>
    `---\nid: project\ndescription: Local project\nactivation: {mode: always}\n---\n${body}\n`;
  await writeFile(join(local, 'project.md'), content('First local addition.'));
  expect(
    (
      await cli(
        project,
        'init',
        '--source',
        '../library',
        '--profile',
        'company/baseline',
        '--targets',
        'codex',
        '--local',
        '.veritas/local',
      )
    ).code,
  ).toBe(0);
  expect((await cli(project, 'sync')).code).toBe(0);
  const lock = await readFile(join(project, 'veritas.lock.json'));
  await writeFile(join(local, 'project.md'), content('Second local addition.'));
  expect((await cli(project, 'check')).code).toBe(1);
  expect((await cli(project, 'sync')).code).toBe(0);
  expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toContain(
    'Second local addition',
  );
  expect(await readFile(join(project, 'veritas.lock.json'))).toEqual(lock);
});
it('reports invalid input and busy state as stable JSON without stderr', async () => {
  const { project } = await fixture();
  const invalid = await cli(project, 'init');
  expect(invalid.code).toBe(2);
  expect(invalid.stderr).toBe('');
  expect(invalid.value).toMatchObject({ schemaVersion: 1, outcome: 'invalid' });
  expect(
    (
      await cli(
        project,
        'init',
        '--source',
        '../library',
        '--profile',
        'company/baseline',
        '--targets',
        'codex',
      )
    ).code,
  ).toBe(0);
  const lease = await acquireLock(project);
  try {
    const busy = await cli(project, 'validate');
    expect(busy.code).toBe(5);
    expect(busy.value).toMatchObject({ command: 'validate', outcome: 'busy' });
  } finally {
    await lease.release();
  }
  await writeFile(
    join(project, 'veritas.yaml'),
    (await readFile(join(project, 'veritas.yaml'), 'utf8')) + 'unknown: true\n',
  );
  expect((await cli(project, 'validate')).code).toBe(2);
});
