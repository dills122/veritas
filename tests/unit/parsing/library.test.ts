import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FileEntry, Result, Snapshot } from '../../../src/model/types.js';
import { parseLibrary } from '../../../src/parsing/library.js';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const file = (
  path: string,
  text: string | Uint8Array,
  executable = false,
): FileEntry => ({
  path,
  bytes: typeof text === 'string' ? bytes(text) : text,
  executable,
});
const manifest = `schemaVersion: 1
steering:
  - id: baseline
    path: steering/baseline.md
skills:
  - name: sample
    path: skills/sample
profiles:
  default:
    steering: [baseline]
    skills: [sample]
`;
const rule = `---
id: baseline
description: Baseline guidance
activation:
  mode: always
---

# Exact body

Keep  spacing.\n`;
const skill = `---
name: sample
description: Read reference data.
license: MIT
metadata:
  author: Example
---

Read [reference](references/note.md).
`;
function snapshot(overrides: readonly FileEntry[] = []): Snapshot {
  const originals = [
    file('veritas.library.yaml', manifest),
    file('steering/baseline.md', rule),
    file('skills/sample/SKILL.md', skill),
    file('skills/sample/references/note.md', '# Reference\n'),
    file('skills/sample/assets/data.bin', new Uint8Array([0, 255, 10, 128])),
    file('skills/sample/scripts/inert.sh', '#!/bin/sh\nexit 99\n', true),
  ];
  const paths = new Set(overrides.map((entry) => entry.path));
  return {
    treeDigest: 'a'.repeat(64),
    files: [
      ...originals.filter((entry) => !paths.has(entry.path)),
      ...overrides,
    ],
  };
}
function codes(result: Result<unknown>): readonly string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe('parseLibrary', () => {
  it('parses the retained portable package fixture including license and README assets', () => {
    const root = new URL('../../fixtures/packages/portable/', import.meta.url);
    const paths = [
      'veritas.library.yaml',
      'steering/baseline.md',
      'skills/sample/SKILL.md',
      'skills/sample/LICENSE',
      'skills/sample/README.md',
      'skills/sample/references/note.md',
      'skills/sample/assets/data.bin',
      'skills/sample/scripts/inert.sh',
    ];
    const files = paths.map((path) => ({
      path,
      bytes: new Uint8Array(readFileSync(new URL(path, root))),
      executable: path.endsWith('/inert.sh'),
    }));
    const result = parseLibrary(
      { treeDigest: 'a'.repeat(64), files },
      'company',
      'default',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.skills[0]?.files.map((entry) => entry.path)).toEqual([
      'LICENSE',
      'README.md',
      'SKILL.md',
      'assets/data.bin',
      'references/note.md',
      'scripts/inert.sh',
    ]);
    expect(
      result.value.skills[0]?.files.find((entry) => entry.path === 'LICENSE')
        ?.bytes,
    ).toEqual(files.find((entry) => entry.path.endsWith('/LICENSE'))?.bytes);
  });
  it('qualifies identities, preserves body slices and complete binary/executable package files', () => {
    const input = snapshot();
    const result = parseLibrary(input, 'company', 'default');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rules[0]).toMatchObject({
      id: 'company/baseline',
      body: '\n\n# Exact body\n\nKeep  spacing.\n',
      source: {
        id: 'company/baseline',
        path: 'steering/baseline.md',
        line: 1,
        column: 1,
      },
    });
    const packageFiles = result.value.skills[0]?.files;
    expect(result.value.skills[0]?.source.id).toBe('company/sample');
    expect(packageFiles?.map((entry) => entry.path)).toEqual([
      'SKILL.md',
      'assets/data.bin',
      'references/note.md',
      'scripts/inert.sh',
    ]);
    expect(
      packageFiles?.find((entry) => entry.path === 'assets/data.bin')?.bytes,
    ).toEqual(new Uint8Array([0, 255, 10, 128]));
    expect(
      packageFiles?.find((entry) => entry.path === 'scripts/inert.sh')
        ?.executable,
    ).toBe(true);
    expect(
      packageFiles?.find((entry) => entry.path === 'SKILL.md')?.bytes,
    ).toEqual(bytes(skill));
    expect(input.files).toHaveLength(6);
  });

  it('normalizes CRLF bodies without reformatting Markdown or skill files', () => {
    const result = parseLibrary(
      snapshot([file('steering/baseline.md', rule.replaceAll('\n', '\r\n'))]),
      'company',
      'default',
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.rules[0]?.body).toBe(
        '\n\n# Exact body\n\nKeep  spacing.\n',
      );
  });

  it.each([
    ['FRONTMATTER_MISSING', '# Plain rule\n'],
    ['FRONTMATTER_MISSING', '```yaml\n---\nid: baseline\n---\n```\n'],
    ['FRONTMATTER_INVALID', '---\nid: baseline\n'],
    ['UTF8_BOM_UNSUPPORTED', '\uFEFF' + rule],
  ])('rejects invalid frontmatter boundaries with %s', (code, content) => {
    expect(
      codes(
        parseLibrary(
          snapshot([file('steering/baseline.md', content)]),
          'company',
          'default',
        ),
      ),
    ).toContain(code);
  });

  it('reports duplicate YAML metadata with qualified source and one-based document location', () => {
    const result = parseLibrary(
      snapshot([
        file(
          'steering/baseline.md',
          rule.replace(
            'description: Baseline guidance',
            'description: Baseline guidance\ndescription: Duplicate',
          ),
        ),
      ]),
      'company',
      'default',
    );
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.find(
        (diagnostic) => diagnostic.code === 'YAML_INVALID',
      )?.source,
    ).toMatchObject({
      id: 'company/baseline',
      path: 'steering/baseline.md',
      line: 4,
    });
  });

  it('rejects invalid UTF-8 instead of replacing source bytes', () => {
    expect(
      codes(
        parseLibrary(
          snapshot([
            file('steering/baseline.md', new Uint8Array([0xc3, 0x28])),
          ]),
          'company',
          'default',
        ),
      ),
    ).toContain('UTF8_INVALID');
  });

  it('rejects mismatched rule identity and unknown frontmatter controls', () => {
    expect(
      codes(
        parseLibrary(
          snapshot([
            file(
              'steering/baseline.md',
              rule.replace('id: baseline', 'id: another'),
            ),
          ]),
          'company',
          'default',
        ),
      ),
    ).toContain('IDENTITY_MISMATCH');
    expect(
      codes(
        parseLibrary(
          snapshot([
            file(
              'skills/sample/SKILL.md',
              skill.replace('license: MIT', 'allowed-tools: Read'),
            ),
          ]),
          'company',
          'default',
        ),
      ),
    ).toContain('SCHEMA_INVALID');
  });

  it('rejects invocation sidecars rather than silently dropping their controls', () => {
    const result = parseLibrary(
      snapshot([
        file(
          'skills/sample/agents/openai.yaml',
          'policy:\n  allow_implicit_invocation: false\n',
        ),
      ]),
      'company',
      'default',
    );
    expect(codes(result)).toContain('SKILL_CONTROL_UNSUPPORTED');
  });

  it('requires declared skill directory and frontmatter names to agree', () => {
    const result = parseLibrary(
      snapshot([
        file(
          'skills/sample/SKILL.md',
          skill.replace('name: sample', 'name: other'),
        ),
      ]),
      'company',
      'default',
    );
    expect(codes(result)).toContain('IDENTITY_MISMATCH');
  });

  it('validates references in supporting Markdown, including definitions and images', () => {
    const result = parseLibrary(
      snapshot([
        file(
          'skills/sample/references/note.md',
          '# Reference\n![image][missing]\n\n[missing]: ../assets/absent.bin\n',
        ),
      ]),
      'company',
      'default',
    );
    expect(codes(result)).toContain('REFERENCE_MISSING');
    expect(
      result.diagnostics.find(
        (diagnostic) => diagnostic.code === 'REFERENCE_MISSING',
      )?.source,
    ).toMatchObject({
      path: 'skills/sample/references/note.md',
      line: 4,
    });
  });

  it('validates all declarations/profile references but parses selected bodies only', () => {
    const input = snapshot([
      file(
        'veritas.library.yaml',
        manifest.replace(
          'skills:',
          '  - id: unused\n    path: steering/unused.md\nskills:',
        ),
      ),
      file('steering/unused.md', '\uFEFFthis unselected body is not parsed'),
    ]);
    expect(parseLibrary(input, 'company', 'default').ok).toBe(true);
    expect(
      codes(
        parseLibrary(
          snapshot([
            file(
              'veritas.library.yaml',
              manifest.replace('steering: [baseline]', 'steering: [missing]'),
            ),
          ]),
          'company',
          'default',
        ),
      ),
    ).toContain('SCHEMA_INVALID');
  });

  it('rejects unavailable declared files, unknown profiles and unsafe namespace', () => {
    expect(codes(parseLibrary(snapshot(), '../outside', 'default'))).toContain(
      'SCHEMA_INVALID',
    );
    expect(codes(parseLibrary(snapshot(), 'company', 'absent'))).toContain(
      'PROFILE_UNKNOWN',
    );
    expect(
      codes(
        parseLibrary(
          snapshot([
            file(
              'veritas.library.yaml',
              manifest.replace('steering/baseline.md', 'steering/absent.md'),
            ),
          ]),
          'company',
          'default',
        ),
      ),
    ).toContain('PACKAGE_MISSING');
  });
  it('bounds steering/SKILL documents but allows larger supporting Markdown assets', () => {
    const largeText = 'a'.repeat(1_048_577);
    expect(
      codes(
        parseLibrary(
          snapshot([file('steering/baseline.md', largeText)]),
          'company',
          'default',
        ),
      ),
    ).toContain('LIMIT_EXCEEDED');
    expect(
      parseLibrary(
        snapshot([file('skills/sample/references/note.md', largeText)]),
        'company',
        'default',
      ).ok,
    ).toBe(true);
  });
  it('copies Buffer-backed package bytes so normalized output cannot mutate the immutable snapshot', () => {
    const original = Buffer.from([0, 255, 10]);
    const result = parseLibrary(
      snapshot([file('skills/sample/assets/data.bin', original)]),
      'company',
      'default',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const copied = result.value.skills[0]?.files.find(
      (entry) => entry.path === 'assets/data.bin',
    );
    if (!copied) throw new Error('Missing normalized binary asset');
    copied.bytes[0] = 42;
    expect(original[0]).toBe(0);
  });
});
