import { describe, expect, it } from 'vitest';
import type { FileEntry, Result, Snapshot } from '../../../src/model/types.js';
import { LIMITS } from '../../../src/model/types.js';
import { parseMarkdown } from '../../../src/parsing/markdown.js';
import { parseLibrary } from '../../../src/parsing/library.js';
import {
  validateNativeImports,
  validateReferences,
  validateSnapshot,
} from '../../../src/validation/packages.js';

const entry = (path: string, text = ''): FileEntry => ({
  path,
  bytes: new TextEncoder().encode(text),
  executable: false,
});
const source = {
  id: 'company/sample',
  path: 'skills/sample/SKILL.md',
  line: 1,
  column: 1,
};
const snapshot = (files: readonly FileEntry[]): Snapshot => ({
  treeDigest: 'a'.repeat(64),
  files,
});
function codes(result: Result<unknown>): readonly string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

it.each([15, 16, 17])(
  'enforces directory depth %i consistently for complete skill parsing',
  (depth) => {
    const relativeAsset = [
      ...Array.from({ length: depth - 2 }, (_, i) => `d${i}`),
      'data.bin',
    ].join('/');
    const bytes = new Uint8Array([0, 255, 1]);
    const input = snapshot([
      entry(
        'veritas.library.yaml',
        'schemaVersion: 1\nsteering: []\nskills: [{name: sample, path: skills/sample}]\nprofiles: {baseline: {steering: [], skills: [sample]}}\n',
      ),
      entry(
        'skills/sample/SKILL.md',
        `---\nname: sample\ndescription: Check directory depth\n---\nRead [data](${relativeAsset}).\n`,
      ),
      { ...entry(`skills/sample/${relativeAsset}`), bytes },
    ]);
    const validated = validateSnapshot(input);
    const parsed = parseLibrary(input, 'company', 'baseline');
    expect(validated.ok).toBe(depth <= 16);
    expect(parsed.ok).toBe(depth <= 16);
    if (parsed.ok)
      expect(
        parsed.value.skills[0]?.files.find(
          (file) => file.path === relativeAsset,
        )?.bytes,
      ).toEqual(bytes);
    else expect(codes(parsed)).toContain('LIMIT_EXCEEDED');
  },
);
function references(
  text: string,
  document = 'SKILL.md',
  files = [
    'SKILL.md',
    'references/note.md',
    'assets/file name.bin',
    'references/%2e%2e',
  ],
) {
  const result = parseMarkdown(
    entry(document, text),
    { ...source, path: `skills/sample/${document}` },
    false,
  );
  if (!result.ok) throw new Error('Invalid test Markdown');
  return validateReferences(
    result.value.tree,
    document,
    new Set(files),
    source,
  );
}
function imports(text: string) {
  const result = parseMarkdown(
    entry('steering/baseline.md', text),
    source,
    false,
  );
  if (!result.ok) throw new Error('Invalid test Markdown');
  return validateNativeImports(result.value.tree, result.value.text, source);
}

describe('snapshot boundaries', () => {
  it.each([
    '../escape',
    '/absolute',
    'dir\\file',
    'CON.txt',
    'dir/.git/config',
    'e\u0301.md',
    'bad:name',
    'dir/trailing.',
  ])('rejects unsafe entry %s', (path) => {
    expect(codes(validateSnapshot(snapshot([entry(path)])))).toContain(
      'PATH_UNSAFE',
    );
  });
  it.each([
    ['references/A.md', 'references/a.md'],
    ['references/One/a.md', 'references/one/b.md'],
    ['file', 'FILE/child'],
    ['duplicate', 'duplicate'],
  ])(
    'rejects case collision, file ancestor or duplicate: %s %s',
    (first, second) => {
      expect(
        codes(validateSnapshot(snapshot([entry(first), entry(second)]))),
      ).toContain('PATH_COLLISION');
    },
  );
  it('enforces path depth, asset size, snapshot size and entry count before parsing', () => {
    expect(
      codes(
        validateSnapshot(
          snapshot([
            entry(
              [
                ...Array.from({ length: LIMITS.depth + 1 }, () => 'x'),
                'data.bin',
              ].join('/'),
            ),
          ]),
        ),
      ),
    ).toContain('LIMIT_EXCEEDED');
    const large = {
      ...entry('large'),
      bytes: new Uint8Array(LIMITS.assetBytes + 1),
    };
    expect(codes(validateSnapshot(snapshot([large])))).toContain(
      'LIMIT_EXCEEDED',
    );
    const block = new Uint8Array(LIMITS.assetBytes);
    expect(
      codes(
        validateSnapshot(
          snapshot(
            Array.from({ length: 11 }, (_, i) => ({
              ...entry(`file-${i}`),
              bytes: block,
            })),
          ),
        ),
      ),
    ).toContain('LIMIT_EXCEEDED');
    expect(
      codes(
        validateSnapshot(
          snapshot(
            Array.from({ length: LIMITS.entries + 1 }, (_, i) =>
              entry(`file-${i}`),
            ),
          ),
        ),
      ),
    ).toContain('LIMIT_EXCEEDED');
  });
});

describe('parsed Markdown references', () => {
  it('allows package-local parent references, one decode, query/fragment and external HTTPS/mail', () => {
    expect(
      references(
        '[parent](../assets/file%20name.bin?download=1#bytes)\n[once](%252e%252e)\n[anchor](#section)\n[web](https://example.com)\n[mail](mailto:user@example.com)',
        'references/note.md',
      ),
    ).toEqual([]);
  });
  it.each([
    '../outside',
    '%2e%2e/outside',
    '/absolute',
    'C:/drive',
    'assets/%00bad',
    'https%3A%2F%2Fexample.com',
    '//example.com',
  ])('rejects unsafe relative reference %s', (path) => {
    expect(
      references(`[reference](${path})`).map((diagnostic) => diagnostic.code),
    ).toContain('REFERENCE_UNSAFE');
  });
  it('rejects bad percent escapes and missing files', () => {
    expect(
      references('[broken](assets/%ZZ)').map((diagnostic) => diagnostic.code),
    ).toContain('REFERENCE_INVALID');
    expect(
      references('[missing](assets/absent.bin)').map(
        (diagnostic) => diagnostic.code,
      ),
    ).toContain('REFERENCE_MISSING');
  });
  it('ignores links written as literal code', () => {
    expect(
      references('`[missing](absent.md)`\n\n```md\n[missing](absent.md)\n```'),
    ).toEqual([]);
  });
});

describe('native imports in steering', () => {
  it.each([
    '@AGENTS.md',
    '@docs/guidance.md',
    '@../outside.md',
    '#[[file:docs/reference.md]]',
    '#[[folder:docs]]',
  ])('rejects native import %s with a precise location', (token) => {
    expect(
      imports(`Heading\n\nRead ${token}.`).find(
        (diagnostic) => diagnostic.code === 'NATIVE_IMPORT_UNSUPPORTED',
      )?.source,
    ).toMatchObject({ line: 3, column: 6 });
  });
  it('preserves literal code, ordinary links, email addresses and mentions', () => {
    expect(
      imports(
        '`@docs/rules.md`\n\n```md\n# [[file:path.md]]\n@AGENTS.md\n```\n\n[ordinary](docs/reference.md) @reviewer user@example.com',
      ),
    ).toEqual([]);
  });
  it('rejects native import tokens in HTML comments as well as ordinary prose', () => {
    expect(
      imports('<!-- @AGENTS.md -->').map((diagnostic) => diagnostic.code),
    ).toContain('NATIVE_IMPORT_UNSUPPORTED');
  });
  it('reports original source offsets after escaped Markdown characters', () => {
    expect(
      imports('\\* Read @AGENTS.md').find(
        (diagnostic) => diagnostic.code === 'NATIVE_IMPORT_UNSUPPORTED',
      )?.source,
    ).toMatchObject({ line: 1, column: 9 });
  });
});
