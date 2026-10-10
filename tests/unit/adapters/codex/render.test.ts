import { expect, it } from 'vitest';
import { renderCodex } from '../../../../src/adapters/codex/index.js';
import type { AdapterInput } from '../../../../src/model/types.js';
const input: AdapterInput = {
  target: 'codex',
  rules: [
    {
      id: 'company/base',
      description: 'Baseline',
      activation: { mode: 'always' },
      body: 'Keep types strict.\n',
      source: { id: 'company/base', path: 'base.md' },
    },
  ],
  skills: [
    {
      name: 'review',
      description: 'Review code',
      source: { id: 'company/review', path: 'skills/review/SKILL.md' },
      files: [
        {
          path: 'SKILL.md',
          bytes: new TextEncoder().encode('skill'),
          executable: false,
        },
        {
          path: 'scripts/helper.sh',
          bytes: new Uint8Array([0, 255]),
          executable: true,
        },
      ],
    },
  ],
  sharedRuleIds: ['company/base'],
  sharedConsumers: ['codex'],
};
it('copies complete Codex skill bytes/modes without choosing a baseline', () => {
  const result = renderCodex(input);
  expect(result.diagnostics).toEqual([]);
  expect(result.artifacts.map((file) => file.path)).toEqual([
    '.agents/skills/review/SKILL.md',
    '.agents/skills/review/scripts/helper.sh',
    'AGENTS.md',
  ]);
  expect(result.artifacts[1]?.bytes).toEqual(new Uint8Array([0, 255]));
  expect(result.artifacts[1]?.executable).toBe(true);
  const baseline = new TextDecoder().decode(
    result.artifacts.find((file) => file.path === 'AGENTS.md')?.bytes,
  );
  expect(baseline).toContain('source: company/base');
  expect(baseline).toContain('Keep types strict.\n');
  expect(result.loading).toEqual([
    { consumer: 'codex', artifactPath: 'AGENTS.md', ruleIds: ['company/base'] },
  ]);
});
it('rejects conditional Codex steering without broadening', () => {
  const rule = input.rules[0];
  if (!rule) throw Error('fixture');
  const result = renderCodex({
    ...input,
    rules: [{ ...rule, activation: { mode: 'files', patterns: ['src/**'] } }],
    sharedRuleIds: [],
  });
  expect(result.diagnostics.some((item) => item.severity === 'error')).toBe(
    true,
  );
  expect(result.artifacts.some((file) => file.path.endsWith('AGENTS.md'))).toBe(
    false,
  );
});
