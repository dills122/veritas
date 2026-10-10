import { describe, expect, it } from 'vitest';
import { compile } from '../../../src/compiler/index.js';
import { canonicalJson } from '../../../src/model/hash.js';
import { PROFILES } from '../../../src/adapters/profiles/index.js';
import type {
  Activation,
  CanonicalRule,
  CompileInput,
  TargetId,
} from '../../../src/model/types.js';
const rule = (
  id: string,
  activation: Activation = { mode: 'always' },
  targets?: readonly TargetId[],
): CanonicalRule => ({
  id: `company/${id}`,
  description: 'Use quality standards',
  activation,
  body: `${id} body.\n`,
  source: { id: `company/${id}`, path: `${id}.md` },
  ...(targets ? { targets } : {}),
});
const input = (
  targets: TargetId[],
  rules: CanonicalRule[] = [rule('baseline')],
): CompileInput => ({
  rules,
  skills: [],
  targets: targets.map((id) => ({ id, profile: PROFILES[id].id })),
  adaptations: [],
  inputDigest: 'a'.repeat(64),
});
describe('combined-target compilation', () => {
  it.each(
    Array.from({ length: 15 }, (_, index) =>
      (['codex', 'claude', 'kiro-ide', 'kiro-cli'] as TargetId[]).filter(
        (_, bit) => ((index + 1) & (1 << bit)) !== 0,
      ),
    ).map((targets) => ({ targets })),
  )(
    'has one loading route per always rule for selected families',
    ({ targets }) => {
      const result = compile(input(targets));
      expect(
        result.diagnostics.filter((item) => item.severity === 'error'),
      ).toEqual([]);
      expect(result.compatibility).toHaveLength(targets.length);
      if (targets.includes('codex')) {
        const baseline = result.artifacts.find(
          (file) => file.path === 'AGENTS.md',
        );
        expect(baseline?.consumers).toEqual([...targets].sort());
        expect(
          result.artifacts.filter(
            (file) =>
              file.path.includes('/steering/') || file.path.includes('/rules/'),
          ),
        ).toHaveLength(0);
      } else
        expect(
          result.artifacts.find((file) => file.path === 'AGENTS.md'),
        ).toBeUndefined();
    },
  );
  it('rejects a Codex-only baseline exposed to an excluded AGENTS consumer', () => {
    const result = compile(
      input(
        ['codex', 'kiro-ide'],
        [rule('private', { mode: 'always' }, ['codex'])],
      ),
    );
    expect(
      result.diagnostics.some((item) => item.code === 'SHARED_SCOPE_LEAK'),
    ).toBe(true);
    expect(result.artifacts).toEqual([]);
  });
  it('rejects IDE-only steering or skills when both Kiro consumers share the path', () => {
    const result = compile(
      input(
        ['kiro-ide', 'kiro-cli'],
        [
          rule('private', { mode: 'files', patterns: ['src/**'] }, [
            'kiro-ide',
          ]),
        ],
      ),
    );
    expect(
      result.diagnostics.some((item) => item.code === 'SHARED_SCOPE_LEAK'),
    ).toBe(true);
    const value = input(['kiro-ide', 'kiro-cli'], []);
    expect(
      compile({
        ...value,
        skills: [
          {
            name: 'private',
            description: 'Test',
            source: { id: 'company/private', path: 'skills/private' },
            targets: ['kiro-ide'],
            files: [
              {
                path: 'SKILL.md',
                bytes: new Uint8Array([1]),
                executable: false,
              },
            ],
          },
        ],
      }).diagnostics.some((item) => item.code === 'SHARED_SCOPE_LEAK'),
    ).toBe(true);
  });
  it('keeps a Claude-only native rule scoped when no shared AGENTS exposure exists', () => {
    const result = compile(
      input(
        ['claude', 'kiro-ide'],
        [rule('private', { mode: 'always' }, ['claude'])],
      ),
    );
    expect(
      result.diagnostics.filter((item) => item.severity === 'error'),
    ).toEqual([]);
    expect(result.artifacts.map((file) => file.path)).toEqual([
      '.claude/rules/company--private.md',
    ]);
  });
  it('requires exact adaptation and retains its label and declaration', () => {
    const value = input(
      ['codex'],
      [rule('files', { mode: 'files', patterns: ['src/**'] })],
    );
    expect(compile(value).compatibility[0]?.status).toBe('unsupported');
    const result = compile({
      ...value,
      adaptations: [
        { rule: 'company/files', target: 'codex', kind: 'files-to-always' },
      ],
    });
    expect(result.compatibility[0]?.status).toBe('adapted');
    expect(result.artifacts[0]?.path).toBe('AGENTS.md');
    expect(result.adaptations).toHaveLength(1);
  });
  it('rejects stale/irrelevant adaptations and mixed effective activation in shared AGENTS', () => {
    const value = input(
      ['codex', 'claude'],
      [rule('files', { mode: 'files', patterns: ['src/**'] })],
    );
    expect(
      compile({
        ...value,
        adaptations: [
          { rule: 'company/files', target: 'codex', kind: 'files-to-always' },
        ],
      }).diagnostics.some((item) => item.code === 'SHARED_SCOPE_LEAK'),
    ).toBe(true);
    expect(
      compile({
        ...value,
        adaptations: [
          { rule: 'company/missing', target: 'codex', kind: 'files-to-always' },
        ],
      }).diagnostics.some((item) => item.code === 'ADAPTATION_INVALID'),
    ).toBe(true);
  });
  it('fails duplicate skill identity even when bytes or targets are different', () => {
    const skill = {
      name: 'review',
      description: 'Review',
      source: { id: 'company/review', path: 'skills/review' },
      files: [
        { path: 'SKILL.md', bytes: new Uint8Array([0]), executable: false },
      ],
    };
    expect(
      compile({
        ...input(['claude']),
        skills: [
          skill,
          { ...skill, source: { id: 'local/review', path: 'skills/review' } },
        ],
      }).diagnostics.some((item) => item.code === 'IDENTITY_COLLISION'),
    ).toBe(true);
  });
  it('is deterministic under target/rule/asset permutation and merges both Kiro outputs', () => {
    const a = input(
      ['kiro-cli', 'claude', 'kiro-ide'],
      [rule('b'), rule('a', { mode: 'files', patterns: ['src/**'] })],
    );
    const b = {
      ...a,
      targets: [...a.targets].reverse(),
      rules: [...a.rules].reverse(),
    };
    const first = compile(a),
      second = compile(b);
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(
      first.artifacts.find(
        (file) => file.path === '.kiro/steering/company--b.md',
      )?.consumers,
    ).toEqual(['kiro-cli', 'kiro-ide']);
  });
});
