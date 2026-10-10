import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalSnapshot } from '../../../src/sources/local.js';
import { loadSnapshot, storeSnapshot } from '../../../src/sources/cache.js';
import { canonicalJson, sha256, treeDigest } from '../../../src/model/hash.js';
import type { Snapshot } from '../../../src/model/types.js';

const roots: string[] = [];
async function root(): Promise<string> {
  const path = await mkdtemp(join(await realpath(tmpdir()), 'veritas-cache-'));
  roots.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
function cachePath(project: string, snapshot: Snapshot): string {
  return join(project, '.veritas', 'runtime', 'cache', snapshot.treeDigest);
}
async function setup(): Promise<{
  source: string;
  project: string;
  snapshot: Snapshot;
}> {
  const source = await root(),
    project = await root();
  await mkdir(join(source, 'skills', 'portable'), { recursive: true });
  await writeFile(
    join(source, 'skills', 'portable', 'asset.bin'),
    new Uint8Array([0, 255, 128, 10]),
  );
  await writeFile(join(source, 'run.sh'), '#!/bin/sh\necho original\n', {
    mode: 0o755,
  });
  return { source, project, snapshot: await createLocalSnapshot(source) };
}

describe('verified immutable cache', () => {
  it('keeps locked bytes after upstream edits and restores the exact digest explicitly', async () => {
    const { source, project, snapshot } = await setup();
    await storeSnapshot(project, snapshot);
    await writeFile(join(source, 'run.sh'), 'changed');
    const loaded = await loadSnapshot(project, snapshot.treeDigest);
    expect(loaded).toEqual(snapshot);
    expect((await createLocalSnapshot(source)).treeDigest).not.toBe(
      snapshot.treeDigest,
    );
    await storeSnapshot(project, snapshot);
    await rm(cachePath(project, snapshot), { recursive: true });
    await expect(
      loadSnapshot(project, snapshot.treeDigest),
    ).rejects.toMatchObject({
      diagnostic: { code: 'CACHE_MISSING' },
      exitCode: 4,
    });
    await storeSnapshot(project, snapshot);
    expect(await loadSnapshot(project, snapshot.treeDigest)).toEqual(snapshot);
  });

  it('never populates missing cache on a read', async () => {
    const project = await root();
    await expect(loadSnapshot(project, 'a'.repeat(64))).rejects.toMatchObject({
      diagnostic: { code: 'CACHE_MISSING' },
    });
    expect(await readdir(project)).toEqual([]);
  });

  it('reads valid cache without rewriting its inventory or tree', async () => {
    const { project, snapshot } = await setup();
    await storeSnapshot(project, snapshot);
    const before = await readFile(
      join(cachePath(project, snapshot), 'inventory.json'),
    );
    const contents = await readdir(
      join(project, '.veritas', 'runtime', 'cache'),
    );
    await loadSnapshot(project, snapshot.treeDigest);
    expect(
      await readFile(join(cachePath(project, snapshot), 'inventory.json')),
    ).toEqual(before);
    expect(
      await readdir(join(project, '.veritas', 'runtime', 'cache')),
    ).toEqual(contents);
  });

  it.each([
    'bytes',
    'mode',
    'missing',
    'extra',
    'empty-directory',
    'symlink',
    'hardlink',
  ])('rejects %s cache corruption', async (kind) => {
    const { project, snapshot } = await setup();
    await storeSnapshot(project, snapshot);
    const directory = cachePath(project, snapshot),
      path = join(directory, 'files', 'run.sh');
    if (kind === 'bytes') await writeFile(path, 'bad bytes');
    if (kind === 'mode') await chmod(path, 0o644);
    if (kind === 'missing') await rm(path);
    if (kind === 'extra')
      await writeFile(join(directory, 'files', 'extra'), 'extra');
    if (kind === 'empty-directory')
      await mkdir(join(directory, 'files', 'extra'));
    if (kind === 'symlink') {
      await rm(path);
      await symlink(join(directory, 'inventory.json'), path);
    }
    if (kind === 'hardlink')
      await link(path, join(directory, 'files', 'extra'));
    await expect(
      loadSnapshot(project, snapshot.treeDigest),
    ).rejects.toMatchObject({ exitCode: 4 });
    await expect(storeSnapshot(project, snapshot)).rejects.toMatchObject({
      exitCode: 4,
    });
  });

  it.each([
    'traversal',
    'unknown-key',
    'wrong-hash',
    'duplicate-key',
    'wrong-digest',
  ])('rejects forged inventory: %s', async (kind) => {
    const { project, snapshot } = await setup();
    await storeSnapshot(project, snapshot);
    const path = join(cachePath(project, snapshot), 'inventory.json');
    const original = {
      schemaVersion: 1,
      treeDigest: snapshot.treeDigest,
      files: snapshot.files.map((file) => ({
        path: file.path,
        sha256: sha256(file.bytes),
        executable: file.executable,
      })),
    };
    if (kind === 'traversal') {
      const file = original.files[0];
      if (file) file.path = '../outside';
    }
    if (kind === 'unknown-key')
      await writeFile(path, canonicalJson({ ...original, execute: 'hook' }));
    else if (kind === 'duplicate-key')
      await writeFile(
        path,
        `{"schemaVersion":1,"schemaVersion":1,"treeDigest":"${snapshot.treeDigest}","files":[]}`,
      );
    else {
      if (kind === 'wrong-hash') {
        const file = original.files[0];
        if (file) file.sha256 = 'f'.repeat(64);
      }
      if (kind === 'wrong-digest') original.treeDigest = 'a'.repeat(64);
      await writeFile(path, canonicalJson(original));
    }
    await expect(
      loadSnapshot(project, snapshot.treeDigest),
    ).rejects.toMatchObject({
      diagnostic: { code: 'CACHE_INVALID' },
      exitCode: 4,
    });
  });

  it('rejects invalid digest and unsafe cache ancestors without writing elsewhere', async () => {
    const project = await root(),
      outside = await root();
    await expect(loadSnapshot(project, '../elsewhere')).rejects.toMatchObject({
      diagnostic: { code: 'CACHE_INVALID' },
    });
    await symlink(outside, join(project, '.veritas'));
    const snapshot: Snapshot = { files: [], treeDigest: treeDigest([]) };
    await expect(storeSnapshot(project, snapshot)).rejects.toMatchObject({
      exitCode: 4,
    });
    expect(await readdir(outside)).toEqual([]);
  });

  it('rejects caller-provided directory case collisions before creating cache', async () => {
    const project = await root();
    const files = [
      { path: 'A/one', bytes: new Uint8Array([1]), executable: false },
      { path: 'a/two', bytes: new Uint8Array([2]), executable: false },
    ];
    await expect(
      storeSnapshot(project, { files, treeDigest: treeDigest(files) }),
    ).rejects.toMatchObject({ diagnostic: { code: 'CACHE_INVALID' } });
    expect(await readdir(project)).toEqual([]);
  });

  it('rejects an executable canonical library manifest supplied for caching', async () => {
    const project = await root();
    const files = [
      {
        path: 'veritas.library.yaml',
        bytes: new TextEncoder().encode('schemaVersion: 1'),
        executable: true,
      },
    ];
    await expect(
      storeSnapshot(project, { files, treeDigest: treeDigest(files) }),
    ).rejects.toMatchObject({
      diagnostic: { code: 'CACHE_INVALID' },
      exitCode: 4,
    });
    expect(await readdir(project)).toEqual([]);
  });

  it('rejects case-folded directory/file overlap before creating cache', async () => {
    const project = await root();
    const files = [
      { path: 'A/one', bytes: new Uint8Array([1]), executable: false },
      { path: 'a', bytes: new Uint8Array([2]), executable: false },
    ];
    await expect(
      storeSnapshot(project, { files, treeDigest: treeDigest(files) }),
    ).rejects.toMatchObject({ diagnostic: { code: 'CACHE_INVALID' } });
    expect(await readdir(project)).toEqual([]);
  });

  it('publishes concurrent identical snapshots without partial cache state', async () => {
    const { project, snapshot } = await setup();
    await Promise.all([
      storeSnapshot(project, snapshot),
      storeSnapshot(project, snapshot),
    ]);
    expect(await loadSnapshot(project, snapshot.treeDigest)).toEqual(snapshot);
    expect(
      await readdir(join(project, '.veritas', 'runtime', 'cache')),
    ).toEqual([snapshot.treeDigest]);
  });
});
