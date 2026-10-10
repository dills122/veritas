import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, sha256 } from '../../../src/model/hash.js';
import type { Artifact, CompileResult } from '../../../src/model/types.js';
import { createManifest } from '../../../src/sync/manifest.js';
import { plan } from '../../../src/sync/plan.js';
import { observe } from '../../../src/sync/observe.js';
import { apply } from '../../../src/sync/apply.js';
import { recover } from '../../../src/sync/recover.js';
import { writeControls } from '../../../src/sync/control.js';
import {
  acquireLock,
  assertNoIncompleteTransaction,
} from '../../../src/sync/lock.js';

const bytes = (text: string) => Buffer.from(text);
const artifact = (path = 'AGENTS.md', body = 'old\n'): Artifact => ({
  path,
  bytes: bytes(body),
  executable: false,
  sourceIds: ['company/base'],
  consumers: ['codex'],
});
const compilation = (
  artifacts: readonly Artifact[] = [artifact()],
): CompileResult => ({
  artifacts,
  diagnostics: [],
  compatibility: [],
  loading: [],
  inputDigest: sha256(artifacts.map((a) => sha256(a.bytes)).join()),
  adaptations: [],
  profiles: [{ id: 'codex', profile: 'codex-repo-v1' }],
});
let project: string;
beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'veritas-transaction-'));
});
afterEach(async () => {
  await rm(project, { force: true, recursive: true });
});
async function put(path: string, body: string | Uint8Array) {
  await mkdir(join(project, path, '..'), { recursive: true });
  await writeFile(join(project, path), body, { mode: 0o644 });
}
async function own(result = compilation()) {
  for (const file of result.artifacts) await put(file.path, file.bytes);
  await put('.veritas/manifest.json', canonicalJson(createManifest(result)));
}
const failAt = (point: string) => ({
  fault: (actual: string) => {
    if (actual === point) throw new Error(`test interruption ${point}`);
  },
});

describe('exclusive lease', () => {
  it('reuses the verified source-resolution lease without releasing the caller lock', async () => {
    const lease = await acquireLock(project);
    try {
      await assertNoIncompleteTransaction(project, lease);
      // Representative explicit source/cache work remains inside the caller's lease.
      await put('.veritas/runtime/cache/selection', 'source snapshot');
      await expect(
        writeControls(project, 'init', [
          {
            path: 'veritas.yaml',
            bytes: bytes('competing'),
            expectedBefore: { kind: 'missing' },
          },
          {
            path: 'veritas.lock.json',
            bytes: bytes('competing'),
            expectedBefore: { kind: 'missing' },
          },
        ]),
      ).rejects.toMatchObject({ exitCode: 5 });
      await writeControls(
        project,
        'init',
        [
          {
            path: 'veritas.yaml',
            bytes: bytes('config'),
            expectedBefore: { kind: 'missing' },
          },
          {
            path: 'veritas.lock.json',
            bytes: bytes('lock'),
            expectedBefore: { kind: 'missing' },
          },
        ],
        { lease },
      );
      expect((await observe(project, '.veritas/runtime/sync.lock')).kind).toBe(
        'file',
      );
      await expect(acquireLock(project)).rejects.toMatchObject({ exitCode: 5 });
      await assertNoIncompleteTransaction(project, lease);
    } finally {
      expect(await lease.release()).toBe(true);
    }
    await assertNoIncompleteTransaction(project);
  });
  it('rejects a forged caller nonce without releasing the actual owner or writing controls', async () => {
    const lease = await acquireLock(project);
    const forged = { ...lease, nonce: 'forged nonce' };
    await expect(
      assertNoIncompleteTransaction(project, forged),
    ).rejects.toMatchObject({ exitCode: 5 });
    await expect(
      writeControls(
        project,
        'init',
        [
          {
            path: 'veritas.yaml',
            bytes: bytes('config'),
            expectedBefore: { kind: 'missing' },
          },
          {
            path: 'veritas.lock.json',
            bytes: bytes('lock'),
            expectedBefore: { kind: 'missing' },
          },
        ],
        { lease: forged },
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
    expect((await observe(project, 'veritas.yaml')).kind).toBe('missing');
    expect(await lease.release()).toBe(true);
  });
  it('matching caller lease never bypasses an incomplete journal', async () => {
    const lease = await acquireLock(project);
    await put('.veritas/runtime/journal.json', 'interrupted');
    await expect(
      assertNoIncompleteTransaction(project, lease),
    ).rejects.toMatchObject({ exitCode: 5 });
    await lease.release();
  });
  it('an overlapping mutator fails while a fresh plan remains under its lease', async () => {
    let entered!: () => void;
    let finish!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const first = apply(project, async () => {
      entered();
      await gate;
      return plan(project, compilation());
    });
    await ready;
    await expect(
      apply(project, () => plan(project, compilation())),
    ).rejects.toMatchObject({ exitCode: 5 });
    finish();
    await first;
  });
  it('serializes mutators and releases only its own nonce', async () => {
    const lease = await acquireLock(project);
    await expect(acquireLock(project)).rejects.toMatchObject({ exitCode: 5 });
    await writeFile(
      join(project, '.veritas/runtime/sync.lock'),
      JSON.stringify({ schemaVersion: 1, nonce: 'another owner', pid: 123 }),
    );
    expect(await lease.release()).toBe(false);
    expect(
      await readFile(join(project, '.veritas/runtime/sync.lock'), 'utf8'),
    ).toContain('another owner');
  });
  it('read-only incomplete-state detection never creates directories', async () => {
    await assertNoIncompleteTransaction(project);
    expect(await readdir(project)).toEqual([]);
    const lease = await acquireLock(project);
    await expect(assertNoIncompleteTransaction(project)).rejects.toMatchObject({
      exitCode: 5,
    });
    await lease.release();
  });
});

describe('apply and recovery', () => {
  it('builds the fresh plan only after taking the exclusive lock', async () => {
    let locked = false;
    await apply(project, async () => {
      locked =
        (await observe(project, '.veritas/runtime/sync.lock')).kind === 'file';
      return plan(project, compilation());
    });
    expect(locked).toBe(true);
    expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe('old\n');
    await assertNoIncompleteTransaction(project);
  });
  it('second sync preserves output and manifest mtimes and modes', async () => {
    await apply(project, () => plan(project, compilation()));
    const before = await stat(join(project, 'AGENTS.md'));
    const manifest = await stat(join(project, '.veritas/manifest.json'));
    const result = await apply(project, () => plan(project, compilation()));
    expect(result.hasDrift).toBe(false);
    expect((await stat(join(project, 'AGENTS.md'))).mtimeMs).toBe(
      before.mtimeMs,
    );
    expect((await stat(join(project, 'AGENTS.md'))).mode).toBe(before.mode);
    expect((await stat(join(project, '.veritas/manifest.json'))).mtimeMs).toBe(
      manifest.mtimeMs,
    );
  });
  it('refuses every operation if any path conflicts', async () => {
    await put('AGENTS.md', 'user');
    await expect(
      apply(project, () =>
        plan(
          project,
          compilation([artifact(), artifact('.agents/skills/review/SKILL.md')]),
        ),
      ),
    ).rejects.toMatchObject({ exitCode: 3 });
    expect(
      (await observe(project, '.agents/skills/review/SKILL.md')).kind,
    ).toBe('missing');
  });
  it.each(['after-prepare', 'before-entry', 'after-entry', 'before-commit'])(
    'rolls back interruption at %s',
    async (point) => {
      await own();
      const oldManifest = await readFile(
        join(project, '.veritas/manifest.json'),
      );
      await expect(
        apply(
          project,
          () => plan(project, compilation([artifact('AGENTS.md', 'new\n')])),
          failAt(point),
        ),
      ).rejects.toMatchObject({ exitCode: 5 });
      const result = await recover(project);
      expect(result.action).toBe('rollback');
      expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe('old\n');
      expect(await readFile(join(project, '.veritas/manifest.json'))).toEqual(
        oldManifest,
      );
      expect((await recover(project)).action).toBe('none');
      await assertNoIncompleteTransaction(project);
    },
  );
  it.each(['after-commit', 'before-cleanup', 'after-remove-staging'])(
    'recognizes committed output and only cleans up at %s',
    async (point) => {
      await own();
      const desired = compilation([artifact('AGENTS.md', 'new\n')]);
      await expect(
        apply(project, () => plan(project, desired), failAt(point)),
      ).rejects.toMatchObject({ exitCode: 5 });
      expect((await recover(project)).action).toBe('cleanup');
      expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe('new\n');
      expect((await plan(project, desired)).hasDrift).toBe(false);
    },
  );
  it('rechecks unchanged managed files before the ownership commit', async () => {
    await own();
    const desired = compilation([
      artifact(),
      artifact('.agents/skills/review/SKILL.md', 'new skill'),
    ]);
    await expect(
      apply(project, () => plan(project, desired), {
        fault: async (point) => {
          if (point === 'before-commit') await put('AGENTS.md', 'external');
        },
      }),
    ).rejects.toMatchObject({ exitCode: 3 });
    await expect(recover(project)).rejects.toMatchObject({ exitCode: 3 });
    expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe('external');
  });
  it('restarts rollback cleanup even after its backups were removed', async () => {
    await own();
    await expect(
      apply(
        project,
        () => plan(project, compilation([artifact('AGENTS.md', 'new')])),
        failAt('after-entry'),
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
    await expect(
      recover(project, failAt('after-remove-staging')),
    ).rejects.toMatchObject({ exitCode: 5 });
    expect((await recover(project)).action).toBe('rollback');
    expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe('old\n');
  });
  it('rechecks preconditions before each destination and preserves an intervening edit', async () => {
    await own();
    await expect(
      apply(
        project,
        () => plan(project, compilation([artifact('AGENTS.md', 'new\n')])),
        {
          fault: async (point) => {
            if (point === 'before-entry') await put('AGENTS.md', 'external');
          },
        },
      ),
    ).rejects.toMatchObject({ exitCode: 3 });
    await expect(recover(project)).rejects.toMatchObject({ exitCode: 3 });
    expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe('external');
  });
  it('prevalidates all affected files before rollback, preserving evidence on external edit', async () => {
    await own(
      compilation([artifact(), artifact('.agents/skills/review/SKILL.md')]),
    );
    await expect(
      apply(
        project,
        () => plan(project, compilation([])),
        failAt('after-entry'),
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
    await put('AGENTS.md', 'external');
    await expect(recover(project)).rejects.toMatchObject({ exitCode: 3 });
    expect((await observe(project, '.veritas/runtime/journal.json')).kind).toBe(
      'file',
    );
  });
  it('rollback is restartable after interruption', async () => {
    await own(
      compilation([artifact(), artifact('.agents/skills/review/SKILL.md')]),
    );
    await expect(
      apply(
        project,
        () => plan(project, compilation([])),
        failAt('after-entry'),
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
    await expect(
      recover(project, failAt('after-rollback')),
    ).rejects.toMatchObject({ exitCode: 5 });
    expect((await recover(project)).action).toBe('rollback');
    expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe('old\n');
    expect(
      await readFile(join(project, '.agents/skills/review/SKILL.md'), 'utf8'),
    ).toBe('old\n');
  });
  it('handles equal manifest digests when recreating missing output', async () => {
    await own();
    await rm(join(project, 'AGENTS.md'));
    const before = await readFile(join(project, '.veritas/manifest.json'));
    await expect(
      apply(project, () => plan(project, compilation()), failAt('after-entry')),
    ).rejects.toMatchObject({ exitCode: 5 });
    expect((await recover(project)).action).toBe('cleanup');
    expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe('old\n');
    expect(await readFile(join(project, '.veritas/manifest.json'))).toEqual(
      before,
    );
  });
  it('validates backups before any rollback', async () => {
    await own();
    await expect(
      apply(
        project,
        () => plan(project, compilation([artifact('AGENTS.md', 'new')])),
        failAt('after-entry'),
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
    const journal = JSON.parse(
      await readFile(join(project, '.veritas/runtime/journal.json'), 'utf8'),
    ) as { id: string };
    await put(`.veritas/runtime/transactions/${journal.id}/0.backup`, 'forged');
    await expect(recover(project)).rejects.toMatchObject({ exitCode: 3 });
    expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe('new');
  });
  it('validates staged bytes before replacing an owned destination', async () => {
    await own();
    await expect(
      apply(
        project,
        () => plan(project, compilation([artifact('AGENTS.md', 'new')])),
        {
          fault: async (point) => {
            if (point === 'after-prepare') {
              const journal = JSON.parse(
                await readFile(
                  join(project, '.veritas/runtime/journal.json'),
                  'utf8',
                ),
              ) as { id: string };
              await put(
                `.veritas/runtime/transactions/${journal.id}/0.stage`,
                'tampered',
              );
            }
          },
        },
      ),
    ).rejects.toMatchObject({ exitCode: 3 });
    expect(await readFile(join(project, 'AGENTS.md'), 'utf8')).toBe('old\n');
    expect((await recover(project)).action).toBe('rollback');
  });
  it('rejects forged journals extending transaction authority', async () => {
    await put(
      '.veritas/runtime/journal.json',
      JSON.stringify({
        schemaVersion: 1,
        kind: 'sync',
        id: '12345678-1234-1234-1234-123456789abc',
        phase: 'applying',
        commitPath: '.veritas/manifest.json',
        entries: [
          {
            path: '.git/config',
            before: { kind: 'missing' },
            after: { kind: 'missing' },
          },
          {
            path: '.veritas/manifest.json',
            before: { kind: 'missing' },
            after: { kind: 'missing' },
          },
        ],
      }),
    );
    await expect(recover(project)).rejects.toMatchObject({ exitCode: 3 });
    expect(
      await readFile(join(project, '.veritas/runtime/journal.json'), 'utf8'),
    ).toContain('.git/config');
  });
  it('preserves executable intent across replacement and rollback', async () => {
    const old = { ...artifact(), executable: true };
    await own(compilation([old]));
    await chmod(join(project, 'AGENTS.md'), 0o755);
    await expect(
      apply(
        project,
        () => plan(project, compilation([artifact('AGENTS.md', 'new')])),
        failAt('after-entry'),
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
    await recover(project);
    expect(await observe(project, 'AGENTS.md')).toMatchObject({
      kind: 'file',
      executable: true,
    });
  });
});

describe('control file transactions', () => {
  it('does not overwrite new config or accept an update transaction for generated outputs', async () => {
    await put('veritas.yaml', 'existing');
    await expect(
      writeControls(project, 'init', [
        {
          path: 'veritas.yaml',
          bytes: bytes('new'),
          expectedBefore: { kind: 'missing' },
        },
        {
          path: 'veritas.lock.json',
          bytes: bytes('lock'),
          expectedBefore: { kind: 'missing' },
        },
      ]),
    ).rejects.toMatchObject({ exitCode: 3 });
    expect(await readFile(join(project, 'veritas.yaml'), 'utf8')).toBe(
      'existing',
    );
    await expect(
      writeControls(project, 'update', [
        {
          path: 'veritas.yaml',
          bytes: bytes('new'),
          expectedBefore: await observe(project, 'veritas.yaml'),
        },
      ]),
    ).rejects.toMatchObject({ exitCode: 3 });
  });
  it('guards config edits during update source resolution without changing its lock', async () => {
    await put('veritas.yaml', 'old config');
    await put('veritas.lock.json', 'old lock');
    const configBefore = await observe(project, 'veritas.yaml');
    const lockBefore = await observe(project, 'veritas.lock.json');
    await put('veritas.yaml', 'external config');
    await expect(
      writeControls(
        project,
        'update',
        [
          {
            path: 'veritas.lock.json',
            bytes: bytes('new lock'),
            expectedBefore: lockBefore,
          },
        ],
        {
          preconditions: [
            { path: 'veritas.yaml', expectedBefore: configBefore },
          ],
        },
      ),
    ).rejects.toMatchObject({ exitCode: 3 });
    expect(await readFile(join(project, 'veritas.lock.json'), 'utf8')).toBe(
      'old lock',
    );
  });
  it('init writes config first and recovers interruption before lock commit', async () => {
    await expect(
      writeControls(
        project,
        'init',
        [
          {
            path: 'veritas.yaml',
            bytes: bytes('config'),
            expectedBefore: { kind: 'missing' },
          },
          {
            path: 'veritas.lock.json',
            bytes: bytes('lock'),
            expectedBefore: { kind: 'missing' },
          },
        ],
        failAt('after-entry'),
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
    expect(await readFile(join(project, 'veritas.yaml'), 'utf8')).toBe(
      'config',
    );
    expect((await observe(project, 'veritas.lock.json')).kind).toBe('missing');
    expect((await recover(project)).action).toBe('rollback');
    expect((await observe(project, 'veritas.yaml')).kind).toBe('missing');
  });
  it('rejects changed source-resolution control preconditions', async () => {
    await put('veritas.lock.json', 'old');
    const before = await observe(project, 'veritas.lock.json');
    await put('veritas.lock.json', 'external');
    await expect(
      writeControls(project, 'update', [
        {
          path: 'veritas.lock.json',
          bytes: bytes('new'),
          expectedBefore: before,
        },
      ]),
    ).rejects.toMatchObject({ exitCode: 3 });
    expect(await readFile(join(project, 'veritas.lock.json'), 'utf8')).toBe(
      'external',
    );
  });
  it('update commits only lock bytes and cleans interrupted commit', async () => {
    await put('veritas.yaml', 'config');
    await put('veritas.lock.json', 'old');
    await expect(
      writeControls(
        project,
        'update',
        [
          {
            path: 'veritas.lock.json',
            bytes: bytes('new'),
            expectedBefore: await observe(project, 'veritas.lock.json'),
          },
        ],
        failAt('after-commit'),
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
    expect((await recover(project)).action).toBe('cleanup');
    expect(await readFile(join(project, 'veritas.yaml'), 'utf8')).toBe(
      'config',
    );
    expect(await readFile(join(project, 'veritas.lock.json'), 'utf8')).toBe(
      'new',
    );
  });
});
