import { expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { renderClaude } from '../../../../src/adapters/claude/index.js';
import type { AdapterInput } from '../../../../src/model/types.js';
const base = {
  id: 'company/base',
  description: 'Base',
  activation: { mode: 'always' as const },
  body: 'Shared body.\n',
  source: { id: 'company/base', path: 'base.md' },
};
const files = {
  ...base,
  id: 'company/files',
  activation: {
    mode: 'files' as const,
    patterns: ['src/**/*.ts', 'tests/*.ts'],
  },
  body: 'Keep scoped body.\n',
};
const input: AdapterInput = {
  target: 'claude',
  rules: [base, files],
  skills: [],
  sharedRuleIds: [base.id],
  sharedConsumers: ['codex', 'claude'],
};
it('imports shared baseline once and renders conditional rules with valid paths metadata', () => {
  const result = renderClaude(input);
  expect(result.diagnostics).toEqual([]);
  const imported = result.artifacts.find((file) => file.path === 'CLAUDE.md');
  expect(
    new TextDecoder().decode(imported?.bytes).match(/@AGENTS.md/g),
  ).toHaveLength(1);
  expect(new TextDecoder().decode(imported?.bytes)).not.toContain(
    'Shared body',
  );
  const rule = result.artifacts.find(
    (file) => file.path === '.claude/rules/company--files.md',
  );
  const text = new TextDecoder().decode(rule?.bytes);
  expect(parseDocument(text.split('---')[1] ?? '').toJS()).toEqual({
    paths: ['src/**/*.ts', 'tests/*.ts'],
  });
  expect(text).toContain('Keep scoped body.\n');
  expect(
    result.loading.find((edge) => edge.artifactPath === 'CLAUDE.md')?.imports,
  ).toEqual(['AGENTS.md']);
});
it('rejects manual/auto while preserving target exclusions', () => {
  const result = renderClaude({
    ...input,
    rules: [
      { ...base, activation: { mode: 'manual' } },
      { ...files, targets: ['kiro-ide'] },
    ],
    sharedRuleIds: [],
  });
  expect(
    result.diagnostics.some((item) => item.code === 'ACTIVATION_UNSUPPORTED'),
  ).toBe(true);
  expect(result.artifacts).toEqual([]);
});
