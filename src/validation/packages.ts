import type { Root } from 'mdast';
import { posix } from 'node:path';
import { error, failure, success } from '../diagnostics/index.js';
import { compareOrdinal } from '../model/hash.js';
import { pathProblem } from '../model/paths.js';
import { LIMITS } from '../model/types.js';
import type {
  Diagnostic,
  FileEntry,
  Result,
  Snapshot,
  SourceLocation,
} from '../model/types.js';

type MarkdownNode = {
  type: string;
  url?: string | undefined;
  value?: string | undefined;
  children?: readonly MarkdownNode[] | undefined;
  position?:
    | {
        start: { line: number; column: number; offset?: number | undefined };
        end?: { offset?: number | undefined } | undefined;
      }
    | undefined;
};

export function validateSnapshot(
  snapshot: Snapshot,
): Result<readonly FileEntry[]> {
  const diagnostics: Diagnostic[] = [];
  if (snapshot.files.length > LIMITS.entries)
    return failure([
      error('LIMIT_EXCEEDED', `Snapshot exceeds ${LIMITS.entries} entries`),
    ]);
  let total = 0;
  const files = new Set<string>();
  const spellings = new Map<string, string>();
  for (const entry of [...snapshot.files].sort((a, b) =>
    compareOrdinal(a.path, b.path),
  )) {
    const source = { id: entry.path, path: entry.path, line: 1, column: 1 };
    const problem = pathProblem(entry.path);
    if (problem) diagnostics.push(error('PATH_UNSAFE', problem, source));
    const segments = entry.path.split('/');
    if (segments.length - 1 > LIMITS.depth)
      diagnostics.push(
        error(
          'LIMIT_EXCEEDED',
          `Path exceeds ${LIMITS.depth} directory levels`,
          source,
        ),
      );
    for (let i = 1; i <= segments.length; i++) {
      const prefix = segments.slice(0, i).join('/');
      const prior = spellings.get(prefix.toLowerCase());
      if (prior !== undefined && prior !== prefix)
        diagnostics.push(
          error(
            'PATH_COLLISION',
            `Case-colliding paths: ${prior} and ${prefix}`,
            source,
          ),
        );
      spellings.set(prefix.toLowerCase(), prefix);
    }
    const key = entry.path.toLowerCase();
    if (files.has(key))
      diagnostics.push(
        error(
          'PATH_COLLISION',
          `Duplicate snapshot entry ${entry.path}`,
          source,
        ),
      );
    files.add(key);
    if (entry.bytes.byteLength > LIMITS.assetBytes)
      diagnostics.push(
        error(
          'LIMIT_EXCEEDED',
          `File exceeds ${LIMITS.assetBytes} bytes`,
          source,
        ),
      );
    total += entry.bytes.byteLength;
  }
  for (const entry of snapshot.files) {
    const segments = entry.path.toLowerCase().split('/');
    for (let i = 1; i < segments.length; i++)
      if (files.has(segments.slice(0, i).join('/')))
        diagnostics.push(
          error('PATH_COLLISION', `File/directory overlap at ${entry.path}`, {
            id: entry.path,
            path: entry.path,
          }),
        );
  }
  if (total > LIMITS.snapshotBytes)
    diagnostics.push(
      error('LIMIT_EXCEEDED', `Snapshot exceeds ${LIMITS.snapshotBytes} bytes`),
    );
  return diagnostics.length
    ? failure(diagnostics)
    : success(
        [...snapshot.files].sort((a, b) => compareOrdinal(a.path, b.path)),
      );
}

function nodes(tree: MarkdownNode, visit: (node: MarkdownNode) => void): void {
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    visit(node);
    for (const child of [...(node.children ?? [])].reverse())
      pending.push(child);
  }
}
function at(node: MarkdownNode, source: SourceLocation): SourceLocation {
  return {
    ...source,
    line: node.position?.start.line ?? 1,
    column: node.position?.start.column ?? 1,
  };
}

export function validateReferences(
  tree: Root,
  relativeDocument: string,
  packageFiles: ReadonlySet<string>,
  source: SourceLocation,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  nodes(tree, (node) => {
    if (
      !['link', 'image', 'definition'].includes(node.type) ||
      node.url === undefined
    )
      return;
    const destination = node.url;
    const location = at(node, source);
    if (destination.startsWith('#')) return;
    if (/^https:\/\//iu.test(destination) || /^mailto:/iu.test(destination)) {
      try {
        new URL(destination);
      } catch {
        diagnostics.push(
          error(
            'REFERENCE_INVALID',
            `Invalid external reference ${destination}`,
            location,
          ),
        );
      }
      return;
    }
    // Split query/fragment before a single decode so encoded filename delimiters stay filename characters.
    const pathPart = destination.split(/[?#]/u, 1)[0] ?? '';
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      diagnostics.push(
        error(
          'REFERENCE_INVALID',
          `Malformed percent escape in ${destination}`,
          location,
        ),
      );
      return;
    }
    if (
      decoded.startsWith('/') ||
      decoded.includes('\\') ||
      decoded.includes(':')
    ) {
      diagnostics.push(
        error(
          'REFERENCE_UNSAFE',
          `Reference must be relative inside its skill package: ${destination}`,
          location,
        ),
      );
      return;
    }
    const resolved = decoded
      ? posix.normalize(posix.join(posix.dirname(relativeDocument), decoded))
      : relativeDocument;
    const problem = pathProblem(resolved);
    if (problem) {
      diagnostics.push(
        error(
          'REFERENCE_UNSAFE',
          `Reference escapes the package or has an unsafe path: ${destination}`,
          location,
        ),
      );
      return;
    }
    if (!packageFiles.has(resolved))
      diagnostics.push(
        error(
          'REFERENCE_MISSING',
          `Reference does not resolve to a package file: ${destination}`,
          location,
        ),
      );
  });
  return diagnostics;
}

export function validateNativeImports(
  tree: Root,
  text: string,
  source: SourceLocation,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  nodes(tree, (node) => {
    if (!['text', 'html'].includes(node.type) || node.value === undefined)
      return;
    const pattern =
      /#\[\[(?:file|folder):[^\]]*\]\]|(?<![\p{L}\p{N}_])@(?:\.{0,2}\/|~\/|\/)?[\p{L}\p{N}_.-]+(?:\/[\p{L}\p{N}_.-]+)*\/?/gu;
    const original =
      node.position?.start.offset === undefined
        ? node.value
        : text.slice(node.position.start.offset, node.position.end?.offset);
    for (const match of original.matchAll(pattern)) {
      if (!match[0].startsWith('#') && !/[./]/u.test(match[0])) continue;
      const start = (node.position?.start.offset ?? 0) + (match.index ?? 0);
      const preceding = text.slice(0, start);
      const line = preceding.split('\n').length;
      const column = start - preceding.lastIndexOf('\n');
      diagnostics.push({
        ...error(
          'NATIVE_IMPORT_UNSUPPORTED',
          `Native import ${match[0]} is not allowed in canonical steering`,
          { ...source, line, column },
        ),
        remediation:
          'Format the token as literal code or remove the native import; ordinary Markdown links do not trigger native imports.',
      });
    }
  });
  return diagnostics;
}
