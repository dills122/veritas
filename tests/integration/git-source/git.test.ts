import { execFile } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGitSnapshot } from '../../../src/sources/git.js';
import { loadSnapshot, storeSnapshot } from '../../../src/sources/cache.js';
import type { GitRunner } from '../../../src/sources/git-runner.js';
import { LIMITS } from '../../../src/model/types.js';

const execute = promisify(execFile),
  roots: string[] = [];
const locator = 'https://example.test/library.git';
async function root() {
  const path = await mkdtemp(join(await realpath(tmpdir()), 'veritas-git-'));
  roots.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function git(cwd: string, args: string[]) {
  return (
    await execute(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_CONFIG_COUNT: '0',
          GIT_TERMINAL_PROMPT: '0',
        },
      },
    )
  ).stdout.trim();
}
async function fixture(format: 'sha1' | 'sha256' = 'sha1') {
  const source = await root(),
    project = await root();
  await git(source, [
    'init',
    '--initial-branch=main',
    `--object-format=${format}`,
    '--template=',
  ]);
  await writeFile(join(source, 'asset.bin'), new Uint8Array([0, 255, 128, 10]));
  await writeFile(join(source, 'run.sh'), '#!/bin/sh\necho pinned\n');
  await git(source, ['add', '.']);
  await git(source, ['update-index', '--chmod=+x', 'run.sh']);
  await git(source, ['commit', '-m', 'initial fixture']);
  await git(source, ['tag', 'v1']);
  const commit = await git(source, ['rev-parse', 'HEAD']);
  const bare = join(await root(), 'upstream.git');
  await git(source, ['clone', '--bare', source, bare]);
  const recorded: string[][] = [];
  const runner: GitRunner = async (args, options) => {
    recorded.push([...args]);
    const rewritten = args.map((value) => (value === locator ? bare : value));
    return await new Promise<Uint8Array>((resolve, reject) => {
      const child = execFile(
        'git',
        ['-c', 'protocol.file.allow=always', ...rewritten],
        {
          cwd: options.cwd,
          timeout: options.timeoutMs,
          maxBuffer: options.maxOutputBytes,
          encoding: 'buffer',
          env: {
            ...process.env,
            GIT_ALLOW_PROTOCOL: 'file',
            GIT_TERMINAL_PROMPT: '0',
            GIT_CONFIG_COUNT: '0',
            GIT_NO_REPLACE_OBJECTS: '1',
          },
        },
        (error, stdout) => {
          if (error)
            reject(new Error('Fixture Git execution failed', { cause: error }));
          else resolve(Uint8Array.from(stdout));
        },
      );
      child.stdin?.on('error', reject);
      child.stdin?.end(options.input);
    });
  };
  return { source, project, bare, commit, recorded, runner };
}

describe('intentional Git snapshot resolution', () => {
  it.each(['sha1', 'sha256'] as const)(
    'resolves %s objects without checkout and preserves bytes/modes',
    async (format) => {
      const f = await fixture(format);
      const result = await resolveGitSnapshot(
        f.project,
        { git: locator, ref: 'main' },
        { runner: f.runner },
      );
      expect(result.resolvedCommit).toBe(f.commit);
      expect(result.resolvedCommit).toHaveLength(format === 'sha1' ? 40 : 64);
      expect(
        result.snapshot.files.find((file) => file.path === 'asset.bin')?.bytes,
      ).toEqual(new Uint8Array([0, 255, 128, 10]));
      expect(
        result.snapshot.files.find((file) => file.path === 'run.sh')
          ?.executable,
      ).toBe(true);
      expect(
        f.recorded.some(
          (args) => args.includes('checkout') || args.includes('submodule'),
        ),
      ).toBe(false);
      expect(
        await readdir(join(f.project, '.veritas', 'runtime', 'git')),
      ).toEqual([]);
    },
  );

  it('keeps a cached pin after tags move and resolves a fixed commit for restore', async () => {
    const f = await fixture();
    const original = await resolveGitSnapshot(
      f.project,
      { git: locator, ref: 'v1' },
      { runner: f.runner },
    );
    await storeSnapshot(f.project, original.snapshot);
    await writeFile(join(f.source, 'run.sh'), 'changed');
    await git(f.source, ['add', '.']);
    await git(f.source, ['commit', '-m', 'changed fixture']);
    await git(f.source, ['tag', '--force', 'v1']);
    await git(f.source, ['push', '--force', f.bare, 'main', 'refs/tags/v1']);
    expect(await loadSnapshot(f.project, original.snapshot.treeDigest)).toEqual(
      original.snapshot,
    );
    const updated = await resolveGitSnapshot(
      f.project,
      { git: locator, ref: 'v1' },
      { runner: f.runner },
    );
    expect(updated.resolvedCommit).not.toBe(original.resolvedCommit);
    expect(updated.snapshot.treeDigest).not.toBe(original.snapshot.treeDigest);
    const restored = await resolveGitSnapshot(
      f.project,
      { git: locator, ref: original.resolvedCommit },
      { runner: f.runner },
    );
    expect(restored).toEqual(original);
  });

  it('peels annotated tags to their immutable commit', async () => {
    const f = await fixture();
    await git(f.source, [
      '-c',
      'tag.gpgSign=false',
      'tag',
      '--annotate',
      '--message',
      'annotated fixture',
      'annotated',
    ]);
    await git(f.source, ['push', f.bare, 'refs/tags/annotated']);
    expect(
      (
        await resolveGitSnapshot(
          f.project,
          { git: locator, ref: 'refs/tags/annotated' },
          { runner: f.runner },
        )
      ).resolvedCommit,
    ).toBe(f.commit);
  });

  it.each(['symlink', 'submodule', 'lfs', 'large'])(
    'rejects %s tree entries',
    async (kind) => {
      const f = await fixture();
      if (kind === 'symlink') await symlink('run.sh', join(f.source, 'alias'));
      if (kind === 'lfs')
        await writeFile(
          join(f.source, 'pointer.bin'),
          'version https://git-lfs.github.com/spec/v1\noid sha256:' +
            'a'.repeat(64) +
            '\nsize 100\n',
        );
      if (kind === 'large')
        await writeFile(
          join(f.source, 'large.bin'),
          new Uint8Array(LIMITS.assetBytes + 1),
        );
      await git(f.source, ['add', '.']);
      if (kind === 'submodule')
        await git(f.source, [
          'update-index',
          '--add',
          '--cacheinfo',
          `160000,${f.commit},nested`,
        ]);
      await git(f.source, ['commit', '-m', 'unsafe fixture']);
      await git(f.source, ['push', f.bare, 'main']);
      await expect(
        resolveGitSnapshot(
          f.project,
          { git: locator, ref: 'main' },
          { runner: f.runner },
        ),
      ).rejects.toMatchObject({ exitCode: 4 });
      expect(
        await readdir(join(f.project, '.veritas', 'runtime', 'git')),
      ).toEqual([]);
    },
  );

  it('rejects an executable canonical library manifest in a Git snapshot', async () => {
    const f = await fixture();
    await writeFile(join(f.source, 'veritas.library.yaml'), 'schemaVersion: 1');
    await git(f.source, ['add', 'veritas.library.yaml']);
    await git(f.source, ['update-index', '--chmod=+x', 'veritas.library.yaml']);
    await git(f.source, ['commit', '-m', 'executable manifest fixture']);
    await git(f.source, ['push', f.bare, 'main']);
    await expect(
      resolveGitSnapshot(
        f.project,
        { git: locator, ref: 'main' },
        { runner: f.runner },
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: 'CACHE_INVALID' },
      exitCode: 4,
    });
  });

  it('does not run imported hook, filter or skill scripts', async () => {
    const f = await fixture(),
      marker = join(f.project, 'executed');
    await git(f.bare, ['config', 'filter.marker.smudge', `touch '${marker}'`]);
    await writeFile(
      join(f.source, '.gitattributes'),
      'asset.bin filter=marker\n',
    );
    await writeFile(
      join(f.source, 'script.sh'),
      `#!/bin/sh\ntouch '${marker}'\n`,
    );
    await git(f.source, ['add', '.']);
    await git(f.source, ['commit', '-m', 'inert content fixture']);
    await git(f.source, ['push', f.bare, 'main']);
    const hooks = join(f.bare, 'hooks');
    await mkdir(hooks, { recursive: true });
    await writeFile(
      join(hooks, 'reference-transaction'),
      `#!/bin/sh\ntouch '${marker}'\n`,
    );
    await chmod(join(hooks, 'reference-transaction'), 0o755);
    const result = await resolveGitSnapshot(
      f.project,
      { git: locator, ref: 'main' },
      { runner: f.runner },
    );
    expect(
      result.snapshot.files.some((file) => file.path === 'script.sh'),
    ).toBe(true);
    expect(await readdir(f.project)).toEqual(['.veritas']);
  });

  it('rejects unsafe locators and refs before any filesystem or Git work', async () => {
    const project = await root();
    const runner: GitRunner = () => {
      throw new Error('must not run');
    };
    for (const gitLocator of [
      'file:///tmp/source',
      'git://example.test/repo',
      'http://example.test/repo',
      'C:/source',
      'ext::touch-marker',
      '--upload-pack=evil',
      'https://user:secret@example.test/repo',
    ]) {
      await expect(
        resolveGitSnapshot(
          project,
          { git: gitLocator, ref: 'main' },
          { runner },
        ),
      ).rejects.toMatchObject({ diagnostic: { code: 'GIT_INVALID_LOCATOR' } });
    }
    for (const ref of [
      '--upload-pack=evil',
      'main:other',
      'main^{commit}',
      '../main',
      'refs/heads/a.lock',
    ])
      await expect(
        resolveGitSnapshot(project, { git: locator, ref }, { runner }),
      ).rejects.toMatchObject({ diagnostic: { code: 'GIT_INVALID_REF' } });
    expect(await readdir(project)).toEqual([]);
  });

  it('rejects missing and ambiguous refs with sanitized errors', async () => {
    const f = await fixture();
    await expect(
      resolveGitSnapshot(
        f.project,
        { git: locator, ref: 'absent' },
        { runner: f.runner },
      ),
    ).rejects.toMatchObject({ diagnostic: { code: 'GIT_REF_MISSING' } });
    await git(f.bare, ['update-ref', 'refs/tags/main', f.commit]);
    await expect(
      resolveGitSnapshot(
        f.project,
        { git: locator, ref: 'main' },
        { runner: f.runner },
      ),
    ).rejects.toMatchObject({ diagnostic: { code: 'GIT_REF_AMBIGUOUS' } });
    const runner: GitRunner = () => {
      throw new Error('auth secret-password');
    };
    await expect(
      resolveGitSnapshot(f.project, { git: locator, ref: 'main' }, { runner }),
    ).rejects.toMatchObject({
      message: 'Git source resolution failed',
      exitCode: 4,
    });
  });
});
