import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, sha256 } from '../../../../src/model/hash.js';
import type { Artifact, CompileResult } from '../../../../src/model/types.js';
import { createManifest } from '../../../../src/sync/manifest.js';
import { plan } from '../../../../src/sync/plan.js';
import { equalState, observe } from '../../../../src/sync/observe.js';

const artifact = (
  path = 'AGENTS.md',
  body = 'baseline\n',
  executable = false,
): Artifact => ({
  path,
  bytes: Buffer.from(body),
  executable,
  sourceIds: ['company/baseline'],
  consumers: ['codex'],
});
const compilation = (
  artifacts: readonly Artifact[] = [artifact()],
  inputDigest = 'a'.repeat(64),
): CompileResult => ({
  artifacts,
  inputDigest,
  profiles: [{ id: 'codex', profile: 'codex-repo-v1' }],
  adaptations: [],
  diagnostics: [],
  compatibility: [],
  loading: [],
});
let project: string;
beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'veritas-plan-'));
});
afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});
async function put(
  path: string,
  bytes: string | Uint8Array,
  executable = false,
) {
  await mkdir(join(project, path, '..'), { recursive: true });
  await writeFile(join(project, path), bytes, {
    mode: executable ? 0o755 : 0o644,
  });
}
async function own(result = compilation()) {
  await put('.veritas/manifest.json', canonicalJson(createManifest(result)));
}

describe('deterministic manifest', () => {
  it('sorts artifacts, identities and consumers without timestamps or project paths', () => {
    const a = artifact('.agents/skills/review/SKILL.md');
    const b = {
      ...artifact(),
      sourceIds: ['company/z', 'company/a'],
      consumers: ['claude', 'codex'] as const,
    };
    const result = {
      ...compilation([a, b]),
      profiles: [
        { id: 'claude' as const, profile: 'claude-repo-v1' },
        ...compilation().profiles,
      ],
    };
    const manifest = createManifest(result);
    expect(manifest.artifacts.map((x) => x.path)).toEqual([
      '.agents/skills/review/SKILL.md',
      'AGENTS.md',
    ]);
    expect(manifest.artifacts[1]?.sourceIds).toEqual([
      'company/a',
      'company/z',
    ]);
    expect(manifest.artifacts[1]?.consumers).toEqual(['claude', 'codex']);
    expect(manifest.artifacts[1]?.sha256).toBe(sha256(b.bytes));
    expect(canonicalJson(manifest)).not.toContain(project);
    expect(createManifest({ ...result, artifacts: [b, a] })).toEqual(manifest);
  });
});

describe('ownership matrix', () => {
  it('creates missing unmanaged output without writing directories or controls', async () => {
    const result = await plan(project, compilation());
    expect(result.operations.map((x) => x.kind)).toEqual(['create']);
    expect(result.expectedManifest).toEqual({ kind: 'missing' });
    expect(result.hasDrift).toBe(true);
    expect(result.hasConflicts).toBe(false);
    expect(await readdir(project)).toEqual([]);
  });
  it('conflicts on identical unmanaged content rather than adopting it', async () => {
    await put('AGENTS.md', 'baseline\n');
    const result = await plan(project, compilation());
    expect(result.operations[0]?.kind).toBe('conflict');
    expect(result.hasConflicts).toBe(true);
  });
  it('leaves matching managed outputs and manifest unchanged', async () => {
    await put('AGENTS.md', 'baseline\n');
    await own();
    const result = await plan(project, compilation());
    expect(result.operations[0]?.kind).toBe('unchanged');
    expect(result.hasDrift).toBe(false);
    expect(result.manifestChanged).toBe(false);
  });
  it('replaces an unchanged owned file when desired bytes differ', async () => {
    await put('AGENTS.md', 'baseline\n');
    await own();
    const result = await plan(
      project,
      compilation([artifact('AGENTS.md', 'new\n')]),
    );
    expect(result.operations[0]?.kind).toBe('replace');
    expect(result.operations[0]?.expectedBefore).toEqual({
      kind: 'file',
      sha256: sha256('baseline\n'),
      executable: false,
    });
  });
  it('deletes only unchanged stale owned files, preserving unlisted assets', async () => {
    const old = compilation([artifact('.agents/skills/review/old.txt')]);
    await own(old);
    await put('.agents/skills/review/old.txt', 'baseline\n');
    await put('.agents/skills/review/my.txt', 'mine');
    const result = await plan(project, compilation([]));
    expect(result.operations.map((x) => [x.path, x.kind])).toEqual([
      ['.agents/skills/review/old.txt', 'delete'],
    ]);
    expect(
      await readFile(join(project, '.agents/skills/review/my.txt'), 'utf8'),
    ).toBe('mine');
  });
  it('recreates a missing owned output even when the manifest digest is equal', async () => {
    await own();
    const result = await plan(project, compilation());
    expect(result.operations[0]?.kind).toBe('create');
    expect(result.manifestChanged).toBe(false);
    expect(result.hasDrift).toBe(true);
  });
  it('removes ownership of already absent stale outputs through manifest-only drift', async () => {
    await own();
    const result = await plan(project, compilation([]));
    expect(result.hasConflicts).toBe(false);
    expect(result.manifestChanged).toBe(true);
    expect(result.hasDrift).toBe(true);
  });
  it.each([true, false])(
    'protects modified bytes whether desired exists=%s',
    async (present) => {
      await own();
      await put('AGENTS.md', 'user edit');
      const result = await plan(
        project,
        compilation(present ? [artifact()] : []),
      );
      expect(result.operations[0]?.kind).toBe('conflict');
      expect(result.hasConflicts).toBe(true);
    },
  );
  it('protects modified executable semantics', async () => {
    await own();
    await put('AGENTS.md', 'baseline\n');
    await chmod(join(project, 'AGENTS.md'), 0o755);
    expect((await plan(project, compilation())).operations[0]?.kind).toBe(
      'conflict',
    );
  });
  it('reports provenance drift when artifact bytes match', async () => {
    await own();
    await put('AGENTS.md', 'baseline\n');
    const result = await plan(
      project,
      compilation([artifact()], 'b'.repeat(64)),
    );
    expect(result.operations[0]?.kind).toBe('unchanged');
    expect(result.manifestChanged).toBe(true);
    expect(result.hasDrift).toBe(true);
  });
  it.each(['{', '{"schemaVersion":1}', 'null'])(
    'treats malformed ownership as conflict: %s',
    async (text) => {
      await put('.veritas/manifest.json', text);
      const result = await plan(project, compilation());
      expect(result.hasConflicts).toBe(true);
      expect(
        result.diagnostics.some((x) => x.code === 'MANIFEST_INVALID'),
      ).toBe(true);
      expect(result.operations).toEqual([]);
    },
  );
  it('rejects duplicate manifest keys instead of choosing one authority silently', async () => {
    const text = canonicalJson(createManifest(compilation())).replace(
      '"schemaVersion": 1',
      '"schemaVersion": 2, "schemaVersion": 1',
    );
    await put('.veritas/manifest.json', text);
    const result = await plan(project, compilation());
    expect(result.hasConflicts).toBe(true);
    expect(
      result.diagnostics.some((item) => item.code === 'MANIFEST_INVALID'),
    ).toBe(true);
  });
  it('leaves existing bytes, modes and directory contents unchanged', async () => {
    await own();
    await put('AGENTS.md', 'baseline\n');
    const before = await readFile(join(project, '.veritas/manifest.json'));
    const state = await observe(project, 'AGENTS.md');
    await plan(project, compilation([artifact('AGENTS.md', 'replacement')]));
    expect(await readFile(join(project, '.veritas/manifest.json'))).toEqual(
      before,
    );
    expect(await observe(project, 'AGENTS.md')).toEqual(state);
    expect(await readdir(join(project, '.veritas'))).toEqual(['manifest.json']);
  });
  it('rejects fresh output outside the output allowlist', async () => {
    const result = await plan(project, compilation([artifact('.git/config')]));
    expect(result.hasConflicts).toBe(true);
    expect(result.operations).toEqual([]);
  });
});

describe('unsafe filesystem and guidance inventory', () => {
  it('rejects output symlinks and hardlinks', async () => {
    await put('outside', 'baseline\n');
    await symlink(join(project, 'outside'), join(project, 'AGENTS.md'));
    expect((await observe(project, 'AGENTS.md')).kind).toBe('unsafe');
    await rm(join(project, 'AGENTS.md'));
    await link(join(project, 'outside'), join(project, 'AGENTS.md'));
    expect((await observe(project, 'AGENTS.md')).kind).toBe('unsafe');
  });
  it('rejects destination spelling that collides by case', async () => {
    await put('agents.md', 'baseline\n');
    expect((await observe(project, 'AGENTS.md')).kind).toBe('unsafe');
    await mkdir(join(project, '.Agents'));
    expect(
      (await observe(project, '.agents/skills/review/SKILL.md')).kind,
    ).toBe('unsafe');
  });
  it('warns about native symbolic skill folders without following them', async () => {
    await mkdir(join(project, '.agents/skills'), { recursive: true });
    await mkdir(join(project, 'outside'));
    await put('outside/SKILL.md', 'outside');
    await symlink(
      join(project, 'outside'),
      join(project, '.agents/skills/unmanaged'),
    );
    const result = await plan(project, compilation());
    expect(
      result.diagnostics.some(
        (x) =>
          x.code === 'GUIDANCE_UNMANAGED' &&
          x.source?.path === '.agents/skills/unmanaged',
      ),
    ).toBe(true);
  });
  it('rejects oversized fresh output before proposing any operation', async () => {
    const result = await plan(
      project,
      compilation([{ ...artifact(), bytes: new Uint8Array(10_485_761) }]),
    );
    expect(result.hasConflicts).toBe(true);
    expect(result.operations).toEqual([]);
  });
  it('rejects symlink ancestors before following them', async () => {
    await mkdir(join(project, 'elsewhere'));
    await symlink(join(project, 'elsewhere'), join(project, '.agents'));
    const result = await plan(
      project,
      compilation([artifact('.agents/skills/review/SKILL.md')]),
    );
    expect(result.hasConflicts).toBe(true);
    expect(result.operations[0]?.expectedBefore.kind).toBe('unsafe');
  });
  it('rejects crossing a nested Git root', async () => {
    await mkdir(join(project, '.agents'));
    await put('.agents/.git', 'gitdir: elsewhere');
    expect(
      (await observe(project, '.agents/skills/review/SKILL.md')).kind,
    ).toBe('unsafe');
  });
  it('rejects a unsafe ownership manifest path', async () => {
    await mkdir(join(project, 'other'));
    await symlink(join(project, 'other'), join(project, '.veritas'));
    expect((await plan(project, compilation())).hasConflicts).toBe(true);
  });
  it('reports shadow guidance as a hard conflict only for selected consumers', async () => {
    await put('AGENTS.override.md', 'override');
    expect(
      (await plan(project, compilation())).diagnostics.some(
        (x) => x.code === 'GUIDANCE_SHADOW' && x.severity === 'error',
      ),
    ).toBe(true);
    const result = {
      ...compilation([artifact('.claude/rules/company--baseline.md')]),
      profiles: [{ id: 'claude' as const, profile: 'claude-repo-v1' }],
      artifacts: [
        {
          ...artifact('.claude/rules/company--baseline.md'),
          consumers: ['claude' as const],
        },
      ],
    };
    expect((await plan(project, result)).hasConflicts).toBe(false);
  });
  it('warns about unmanaged nested guidance without mutation', async () => {
    await put('nested/AGENTS.md', 'nested');
    await put('.claude/CLAUDE.md', 'competing');
    const result = await plan(project, compilation());
    expect(
      result.diagnostics.some(
        (x) =>
          x.code === 'GUIDANCE_UNMANAGED' &&
          x.source?.path === 'nested/AGENTS.md',
      ),
    ).toBe(true);
    expect(await readFile(join(project, 'nested/AGENTS.md'), 'utf8')).toBe(
      'nested',
    );
  });
  it('competing Claude root guidance conflicts when Claude is selected', async () => {
    await put('.claude/CLAUDE.md', 'competing');
    const result = {
      ...compilation([]),
      profiles: [{ id: 'claude' as const, profile: 'claude-repo-v1' }],
    };
    expect((await plan(project, result)).hasConflicts).toBe(true);
  });
  it('state equality compares executable semantics and absence', () => {
    expect(equalState({ kind: 'missing' }, { kind: 'missing' })).toBe(true);
    expect(
      equalState(
        { kind: 'file', sha256: 'a', executable: false },
        { kind: 'file', sha256: 'a', executable: true },
      ),
    ).toBe(false);
    expect(
      equalState(
        { kind: 'unsafe', reason: 'x' },
        { kind: 'unsafe', reason: 'x' },
      ),
    ).toBe(false);
  });
});
