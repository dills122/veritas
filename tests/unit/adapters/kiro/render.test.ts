import { expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { renderKiro } from '../../../../src/adapters/kiro/index.js';
import type { AdapterInput, Activation } from '../../../../src/model/types.js';
const makeInput = (activation: Activation): AdapterInput => ({
  target: 'kiro-ide',
  rules: [
    {
      id: 'company/rule',
      description: 'Relevant API design',
      activation,
      body: 'Preserve this body.\n',
      source: { id: 'company/rule', path: 'rule.md' },
    },
  ],
  skills: [],
  sharedRuleIds: [],
  sharedConsumers: [],
});
it.each([
  { mode: 'always' as const },
  { mode: 'files' as const, patterns: ['src/**/*.ts', 'tests/**'] },
  { mode: 'manual' as const },
  { mode: 'auto' as const },
])(
  'renders documented inclusion mode and identical IDE/CLI bytes',
  (activation) => {
    const ide = renderKiro(makeInput(activation));
    const cli = renderKiro({ ...makeInput(activation), target: 'kiro-cli' });
    expect(ide.diagnostics).toEqual([]);
    expect(ide.artifacts[0]?.bytes).toEqual(cli.artifacts[0]?.bytes);
    const text = new TextDecoder().decode(ide.artifacts[0]?.bytes);
    const metadata: unknown = parseDocument(text.split('---')[1] ?? '').toJS();
    if (activation.mode === 'auto')
      expect(metadata).toEqual({
        inclusion: 'auto',
        name: 'company--rule',
        description: 'Relevant API design',
      });
    else if (activation.mode === 'files')
      expect(metadata).toEqual({
        inclusion: 'fileMatch',
        fileMatchPattern: activation.patterns,
      });
    else expect(metadata).toEqual({ inclusion: activation.mode });
    expect(text).toContain('Preserve this body.\n');
  },
);
it('omits a compiler-selected shared body from native steering', () => {
  expect(
    renderKiro({
      ...makeInput({ mode: 'always' }),
      sharedRuleIds: ['company/rule'],
      sharedConsumers: ['codex', 'kiro-ide'],
    }).artifacts,
  ).toEqual([]);
});
