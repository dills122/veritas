import { describe, expect, it } from 'vitest';
import {
  parseProjectConfig,
  parseLibraryManifest,
  parseYamlStrict,
} from '../../../src/config/parse.js';
import {
  manifestSchema,
  journalSchema,
  lockSchema,
  gitLocatorProblem,
} from '../../../src/config/schemas.js';

const config = `schemaVersion: 1
sources:
  company: {path: ../library}
profile: company/baseline
targets: [{id: codex, profile: codex-repo-v1}]
`;

describe('strict versioned contracts', () => {
  it.each([
    'file:///tmp/repo',
    'ext::command',
    'C:/repo',
    'https://token@example.com/repo',
    'ssh://user:secret@example.com/repo',
  ])('rejects unsafe Git locators before spawning', (locator) =>
    expect(gitLocatorProblem(locator)).toBeDefined(),
  );
  it('parses a bounded project and defaults explicit empty adaptations', () => {
    const result = parseProjectConfig(config, 'veritas.yaml');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.compatibility.adaptations).toEqual([]);
  });
  it.each([
    config + 'unknown: true\n',
    config.replace('schemaVersion: 1', 'schemaVersion: 2'),
    config.replace(
      'company: {path: ../library}',
      'company: {path: ../library}\n  extra: {path: ../other}',
    ),
    config.replace('company/baseline', 'missing/baseline'),
    config.replace('codex-repo-v1', 'claude-repo-v1'),
    config + 'local: {path: ../escape, profile: project}\n',
  ])('rejects invalid project shape and references', (text) => {
    expect(parseProjectConfig(text, 'veritas.yaml').ok).toBe(false);
  });
  it.each([
    'a: 1\na: 2',
    'a: &a value\nb: *a',
    'a: !custom value',
    'a: {<<: {b: 1}}',
  ])('rejects unsafe YAML features with a source location', (text) => {
    const result = parseYamlStrict(text, 'input.yaml');
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.source?.line).toBeGreaterThanOrEqual(1);
  });
  it('rejects duplicate declarations and missing profile references', () => {
    const text = `schemaVersion: 1\nsteering: [{id: a, path: a.md}, {id: a, path: b.md}]\nskills: []\nprofiles: {baseline: {steering: [missing], skills: []}}`;
    expect(parseLibraryManifest(text, 'veritas.library.yaml').ok).toBe(false);
  });
  it('reports the schema value location in user-facing columns', () => {
    const result = parseProjectConfig(
      config.replace('codex-repo-v1', 'wrong-profile'),
      'veritas.yaml',
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.source?.line).toBe(5);
    expect(result.diagnostics[0]?.source?.column).toBeGreaterThan(1);
  });
  it('does not turn malformed ownership or journal objects into authority', () => {
    expect(
      manifestSchema.safeParse({
        schemaVersion: 1,
        artifacts: [{ path: '../secret' }],
      }).success,
    ).toBe(false);
    expect(
      journalSchema.safeParse({
        schemaVersion: 1,
        kind: 'sync',
        commitPath: 'secret',
      }).success,
    ).toBe(false);
    expect(lockSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
  });
  it('validates transaction authority by journal kind', () => {
    const state = { kind: 'missing' };
    const entry = (path: string) => ({
      path,
      before: state,
      after: { kind: 'file', sha256: 'a'.repeat(64), executable: false },
    });
    const base = {
      schemaVersion: 1,
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      phase: 'prepared',
    };
    expect(
      journalSchema.safeParse({
        ...base,
        kind: 'init',
        commitPath: 'veritas.lock.json',
        entries: [entry('veritas.yaml'), entry('veritas.lock.json')],
      }).success,
    ).toBe(true);
    expect(
      journalSchema.safeParse({
        ...base,
        kind: 'update',
        commitPath: 'veritas.lock.json',
        entries: [entry('veritas.yaml'), entry('veritas.lock.json')],
      }).success,
    ).toBe(false);
    expect(
      journalSchema.safeParse({
        ...base,
        kind: 'sync',
        commitPath: '.veritas/manifest.json',
        entries: [entry('README.md'), entry('.veritas/manifest.json')],
      }).success,
    ).toBe(false);
    expect(
      journalSchema.safeParse({
        ...base,
        kind: 'sync',
        commitPath: '.veritas/manifest.json',
        entries: [entry('AGENTS.md')],
      }).success,
    ).toBe(false);
  });
});
