import {
  isAlias,
  isNode,
  isScalar,
  LineCounter,
  parseDocument,
  visit,
} from 'yaml';
import type { z } from 'zod';
import { error, failure, success } from '../diagnostics/index.js';
import { LIMITS } from '../model/types.js';
import type { Diagnostic, Result } from '../model/types.js';
import { libraryManifestSchema, projectConfigSchema } from './schemas.js';
import type { LibraryManifest, ProjectConfig } from './schemas.js';

function position(
  counter: LineCounter,
  offset: number,
): { line: number; column: number } {
  const { line, col } = counter.linePos(offset);
  return { line, column: col };
}

export function parseYamlStrict(text: string, path: string): Result<unknown> {
  const source = { id: path, path, line: 1, column: 1 };
  if (Buffer.byteLength(text) > LIMITS.configBytes)
    return failure([
      error('LIMIT_EXCEEDED', 'YAML document exceeds 1 MiB', source),
    ]);
  const lineCounter = new LineCounter();
  const document = parseDocument(text, {
    version: '1.2',
    strict: true,
    uniqueKeys: true,
    merge: false,
    lineCounter,
  });
  const diagnostics: Diagnostic[] = [
    ...document.errors,
    ...document.warnings,
  ].map((issue) =>
    error('YAML_INVALID', issue.message, {
      ...source,
      ...position(lineCounter, issue.pos[0]),
    }),
  );
  visit(document, (_key, node) => {
    if (
      isAlias(node) ||
      (isNode(node) &&
        node.tag !== undefined &&
        !node.tag.startsWith('tag:yaml.org,2002:')) ||
      (isScalar(node) && node.value === '<<')
    ) {
      const offset = isNode(node) ? (node.range?.[0] ?? 0) : 0;
      diagnostics.push(
        error(
          'YAML_UNSUPPORTED',
          'Aliases, custom tags and merge keys are not supported',
          { ...source, ...position(lineCounter, offset) },
        ),
      );
    }
  });
  if (diagnostics.length) return failure(diagnostics);
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  if (value === null || value === undefined)
    return failure([
      {
        ...error('YAML_EMPTY', `${path} is empty`, source),
        remediation: path.endsWith('veritas.library.yaml')
          ? 'Declare schemaVersion: 1 with steering, skills and profiles (docs/user-guide.md#author-a-library), or run `veritas init --scaffold` in a new project for a starter library.'
          : 'Restore the file from version control, or recreate it with `veritas init`.',
      },
    ]);
  return success(value);
}
export function parseWithSchema<T>(
  value: unknown,
  schema: z.ZodType<T>,
  path: string,
  text?: string,
): Result<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return success(parsed.data);
  const counter = new LineCounter();
  const document =
    text === undefined
      ? undefined
      : parseDocument(text, { lineCounter: counter });
  return failure(
    parsed.error.issues.map((issue) =>
      error(
        'SCHEMA_INVALID',
        `${issue.path.map(String).join('.') || 'document'}: ${issue.message}`,
        {
          id: path,
          path,
          ...(() => {
            if (!document) return { line: 1, column: 1 };
            const node = document.getIn(issue.path, true);
            return position(counter, isNode(node) ? (node.range?.[0] ?? 0) : 0);
          })(),
        },
      ),
    ),
  );
}
export function parseProjectConfig(
  text: string,
  path = 'veritas.yaml',
): Result<ProjectConfig> {
  const parsed = parseYamlStrict(text, path);
  return parsed.ok
    ? parseWithSchema(parsed.value, projectConfigSchema, path, text)
    : parsed;
}
export function parseLibraryManifest(
  text: string,
  path = 'veritas.library.yaml',
): Result<LibraryManifest> {
  const parsed = parseYamlStrict(text, path);
  return parsed.ok
    ? parseWithSchema(parsed.value, libraryManifestSchema, path, text)
    : parsed;
}
