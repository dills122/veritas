import type { Root } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { parseYamlStrict } from '../config/parse.js';
import { error, failure, success } from '../diagnostics/index.js';
import { LIMITS } from '../model/types.js';
import type { FileEntry, Result, SourceLocation } from '../model/types.js';

export type MarkdownDocument = {
  text: string;
  tree: Root;
  frontmatter: unknown;
  frontmatterText: string;
  frontmatterLineOffset: number;
  body: string;
};

export function decodeText(
  entry: FileEntry,
  source: SourceLocation,
  maxBytes: number = LIMITS.documentBytes,
): Result<string> {
  if (entry.bytes.byteLength > maxBytes)
    return failure([
      error('LIMIT_EXCEEDED', `Text exceeds ${maxBytes} bytes`, source),
    ]);
  // Do not let TextDecoder silently discard a BOM and move the frontmatter boundary.
  if (
    entry.bytes[0] === 0xef &&
    entry.bytes[1] === 0xbb &&
    entry.bytes[2] === 0xbf
  )
    return failure([
      error(
        'UTF8_BOM_UNSUPPORTED',
        'UTF-8 BOM is not supported; save text without a BOM',
        source,
      ),
    ]);
  try {
    return success(
      new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes),
    );
  } catch {
    return failure([
      error('UTF8_INVALID', 'Text must contain valid UTF-8 bytes', source),
    ]);
  }
}

export function parseMarkdown(
  entry: FileEntry,
  source: SourceLocation,
  requireFrontmatter: boolean,
): Result<MarkdownDocument> {
  const decoded = decodeText(
    entry,
    source,
    requireFrontmatter ? LIMITS.documentBytes : LIMITS.assetBytes,
  );
  if (!decoded.ok) return decoded;
  const text = decoded.value.replaceAll('\r\n', '\n');
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .parse(text);
  const first = tree.children[0];
  if (first?.type !== 'yaml' || first.position?.start.offset !== 0) {
    if (requireFrontmatter)
      return failure([
        error(
          text.startsWith('---\n')
            ? 'FRONTMATTER_INVALID'
            : 'FRONTMATTER_MISSING',
          'A closed YAML frontmatter block must begin on the first line',
          source,
        ),
      ]);
    return success({
      text,
      tree,
      frontmatter: undefined,
      frontmatterText: '',
      frontmatterLineOffset: 0,
      body: text,
    });
  }
  const parsed = parseYamlStrict(first.value, entry.path);
  const frontmatterLineOffset = first.position.start.line;
  if (!parsed.ok)
    return failure(
      parsed.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        source: {
          ...source,
          line: (diagnostic.source?.line ?? 1) + frontmatterLineOffset,
          column: diagnostic.source?.column ?? 1,
        },
      })),
    );
  return success({
    text,
    tree,
    frontmatter: parsed.value,
    frontmatterText: first.value,
    frontmatterLineOffset,
    body: text.slice(first.position.end.offset ?? text.length),
  });
}
