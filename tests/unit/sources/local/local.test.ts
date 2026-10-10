import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalSnapshot } from '../../../../src/sources/local.js';
import { treeDigest } from '../../../../src/model/hash.js';
import { LIMITS } from '../../../../src/model/types.js';

const roots: string[] = [];
async function root(): Promise<string> {
  const path = await mkdtemp(join(await realpath(tmpdir()), 'veritas-local-'));
  roots.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('local immutable snapshots', () => {
  it('sorts portable paths and preserves binary bytes and executable intent', async () => {
    const path = await root();
    await mkdir(join(path, 'skills'));
    await writeFile(join(path, 'z.md'), 'last', { mode: 0o600 });
    await writeFile(
      join(path, 'skills', 'run.sh'),
      new Uint8Array([0, 255, 128, 10]),
      { mode: 0o700 },
    );
    const snapshot = await createLocalSnapshot(path);
    expect(snapshot.files.map((file) => file.path)).toEqual([
      'skills/run.sh',
      'z.md',
    ]);
    expect(snapshot.files[0]?.bytes).toEqual(new Uint8Array([0, 255, 128, 10]));
    expect(snapshot.files[0]?.executable).toBe(true);
    expect(snapshot.treeDigest).toBe(treeDigest(snapshot.files));
    await chmod(join(path, 'z.md'), 0o644);
    expect((await createLocalSnapshot(path)).treeDigest).toBe(
      snapshot.treeDigest,
    );
    await writeFile(join(path, 'z.md'), 'changed');
    expect(new TextDecoder().decode(snapshot.files[1]?.bytes)).toBe('last');
    expect((await createLocalSnapshot(path)).treeDigest).not.toBe(
      snapshot.treeDigest,
    );
  });

  it('excludes only root Git metadata while retaining dotfiles/assets', async () => {
    const path = await root();
    await mkdir(join(path, '.git'));
    await writeFile(join(path, '.git', 'config'), 'metadata');
    await writeFile(join(path, '.hidden'), 'retained');
    expect(
      (await createLocalSnapshot(path)).files.map((file) => file.path),
    ).toEqual(['.hidden']);
    await mkdir(join(path, 'nested', '.git'), { recursive: true });
    await expect(createLocalSnapshot(path)).rejects.toMatchObject({
      diagnostic: { code: 'SOURCE_UNSAFE_PATH' },
      exitCode: 4,
    });
  });

  it.each(['symlink', 'hardlink'])('rejects %s entries', async (kind) => {
    const path = await root();
    await writeFile(join(path, 'target'), 'a');
    if (kind === 'symlink')
      await symlink(join(path, 'target'), join(path, 'alias'));
    else await link(join(path, 'target'), join(path, 'alias'));
    await expect(createLocalSnapshot(path)).rejects.toMatchObject({
      diagnostic: { code: 'SOURCE_UNSAFE_ENTRY' },
    });
  });

  it('rejects symlinked source roots and ancestors', async () => {
    const path = await root();
    await mkdir(join(path, 'real', 'inner'), { recursive: true });
    await symlink(join(path, 'real'), join(path, 'alias'));
    await expect(
      createLocalSnapshot(join(path, 'alias')),
    ).rejects.toMatchObject({ diagnostic: { code: 'SOURCE_UNSAFE_ENTRY' } });
    await expect(
      createLocalSnapshot(join(path, 'alias', 'inner')),
    ).rejects.toMatchObject({ diagnostic: { code: 'SOURCE_UNSAFE_ENTRY' } });
  });

  it('rejects reserved names', async () => {
    const path = await root();
    await writeFile(join(path, 'CON.txt'), 'a');
    await expect(createLocalSnapshot(path)).rejects.toMatchObject({
      diagnostic: { code: 'SOURCE_UNSAFE_PATH' },
    });
  });

  it('rejects executable config and privileged file modes', async () => {
    const path = await root();
    await writeFile(join(path, 'library.yaml'), 'schemaVersion: 1', {
      mode: 0o755,
    });
    await expect(createLocalSnapshot(path)).rejects.toMatchObject({
      diagnostic: { code: 'SOURCE_UNSAFE_MODE' },
    });
    await chmod(join(path, 'library.yaml'), 0o1644);
    await expect(createLocalSnapshot(path)).rejects.toMatchObject({
      diagnostic: { code: 'SOURCE_UNSAFE_MODE' },
    });
  });

  it('rejects the executable canonical library manifest', async () => {
    const path = await root();
    await writeFile(join(path, 'veritas.library.yaml'), 'schemaVersion: 1', {
      mode: 0o755,
    });
    await expect(createLocalSnapshot(path)).rejects.toMatchObject({
      diagnostic: { code: 'SOURCE_UNSAFE_MODE' },
      exitCode: 4,
    });
  });

  it('bounds directory depth and individual asset size before reading', async () => {
    const path = await root();
    await mkdir(
      join(
        path,
        ...Array.from({ length: LIMITS.depth + 1 }, (_, i) => `d${i}`),
      ),
      { recursive: true },
    );
    await expect(createLocalSnapshot(path)).rejects.toMatchObject({
      diagnostic: { code: 'SOURCE_LIMIT' },
    });
    const second = await root();
    await writeFile(
      join(second, 'large.bin'),
      new Uint8Array(LIMITS.assetBytes + 1),
    );
    await expect(createLocalSnapshot(second)).rejects.toMatchObject({
      diagnostic: { code: 'SOURCE_LIMIT' },
    });
  });

  it('allows files at the maximum directory depth', async () => {
    const path = await root(),
      parts = Array.from({ length: LIMITS.depth }, (_, i) => `d${i}`);
    await mkdir(join(path, ...parts), { recursive: true });
    await writeFile(join(path, ...parts, 'file'), 'data');
    expect((await createLocalSnapshot(path)).files).toHaveLength(1);
  });

  it('reports missing roots as structured operational failures', async () => {
    const path = await root();
    await expect(
      createLocalSnapshot(join(path, 'missing')),
    ).rejects.toMatchObject({
      diagnostic: { code: 'SOURCE_READ_FAILED' },
      exitCode: 4,
    });
  });
});
