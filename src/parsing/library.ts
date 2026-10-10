import { posix } from 'node:path';
import type { z } from 'zod';
import { parseLibraryManifest, parseWithSchema } from '../config/parse.js';
import {
  identifierSchema,
  ruleFrontmatterSchema,
  skillFrontmatterSchema,
} from '../config/schemas.js';
import {
  error,
  failure,
  sortDiagnostics,
  success,
} from '../diagnostics/index.js';
import { compareOrdinal } from '../model/hash.js';
import type {
  CanonicalRule,
  Diagnostic,
  NormalizedLibrary,
  Result,
  SkillPackage,
  Snapshot,
  SourceLocation,
} from '../model/types.js';
import {
  validateNativeImports,
  validateReferences,
  validateSnapshot,
} from '../validation/packages.js';
import { decodeText, parseMarkdown } from './markdown.js';
import type { MarkdownDocument } from './markdown.js';

function metadata<T>(
  document: MarkdownDocument,
  schema: z.ZodType<T>,
  source: SourceLocation,
): Result<T> {
  const result = parseWithSchema(
    document.frontmatter,
    schema,
    source.path,
    document.frontmatterText,
  );
  return result.ok
    ? result
    : failure(
        result.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          source: {
            ...source,
            line:
              (diagnostic.source?.line ?? 1) + document.frontmatterLineOffset,
            column: diagnostic.source?.column ?? 1,
          },
        })),
      );
}

export function parseLibrary(
  snapshot: Snapshot,
  namespace: string,
  profile: string,
): Result<NormalizedLibrary> {
  const checked = validateSnapshot(snapshot);
  if (!checked.ok) return checked;
  const namespaceResult = parseWithSchema(
    namespace,
    identifierSchema,
    'veritas.library.yaml',
  );
  if (!namespaceResult.ok) return namespaceResult;
  const files = new Map(checked.value.map((entry) => [entry.path, entry]));
  const manifestEntry = files.get('veritas.library.yaml');
  if (!manifestEntry)
    return failure([
      {
        ...error(
          'LIBRARY_MANIFEST_MISSING',
          'Snapshot has no veritas.library.yaml',
        ),
        remediation:
          'The library root (the repository root for Git sources) must contain veritas.library.yaml; a subdirectory of a repository cannot be used as a source. Point --source at a directory that has it, or run `veritas init --scaffold` to create a starter library.',
      },
    ]);
  const manifestText = decodeText(manifestEntry, {
    id: namespace,
    path: manifestEntry.path,
    line: 1,
    column: 1,
  });
  if (!manifestText.ok) return manifestText;
  const parsed = parseLibraryManifest(manifestText.value);
  if (!parsed.ok) return parsed;
  const manifest = parsed.value;
  const selected = Object.hasOwn(manifest.profiles, profile)
    ? manifest.profiles[profile]
    : undefined;
  if (!selected)
    return failure([
      error(
        'PROFILE_UNKNOWN',
        `Library profile ${namespace}/${profile} does not exist`,
        { id: namespace, path: manifestEntry.path },
      ),
    ]);
  const diagnostics: Diagnostic[] = [];
  for (const declared of manifest.steering)
    if (!files.has(declared.path))
      diagnostics.push(
        error(
          'PACKAGE_MISSING',
          `Declared steering file is missing: ${declared.path}`,
          { id: `${namespace}/${declared.id}`, path: declared.path },
        ),
      );
  for (const declared of manifest.skills) {
    const source = {
      id: `${namespace}/${declared.name}`,
      path: `${declared.path}/SKILL.md`,
      line: 1,
      column: 1,
    };
    if (posix.basename(declared.path) !== declared.name)
      diagnostics.push(
        error(
          'IDENTITY_MISMATCH',
          'Skill directory name must match its declared name',
          source,
        ),
      );
    if (!files.has(source.path))
      diagnostics.push(
        error(
          'PACKAGE_MISSING',
          `Declared skill is missing SKILL.md: ${declared.path}`,
          source,
        ),
      );
  }
  if (diagnostics.length) return failure(sortDiagnostics(diagnostics));
  const rules: CanonicalRule[] = [];
  for (const declared of [...manifest.steering].sort((a, b) =>
    compareOrdinal(a.id, b.id),
  )) {
    if (!selected.steering.includes(declared.id)) continue;
    const entry = files.get(declared.path);
    if (!entry) continue; // Declaration existence was validated above.
    const source = {
      id: `${namespace}/${declared.id}`,
      path: entry.path,
      line: 1,
      column: 1,
    };
    const document = parseMarkdown(entry, source, true);
    if (!document.ok) {
      diagnostics.push(...document.diagnostics);
      continue;
    }
    const frontmatter = metadata(document.value, ruleFrontmatterSchema, source);
    if (!frontmatter.ok) {
      diagnostics.push(...frontmatter.diagnostics);
      continue;
    }
    if (frontmatter.value.id !== declared.id) {
      diagnostics.push(
        error(
          'IDENTITY_MISMATCH',
          'Rule frontmatter id must match its manifest declaration',
          source,
        ),
      );
      continue;
    }
    diagnostics.push(
      ...validateNativeImports(
        document.value.tree,
        document.value.text,
        source,
      ),
    );
    rules.push({
      id: source.id,
      description: frontmatter.value.description,
      activation: frontmatter.value.activation,
      body: document.value.body,
      source,
      ...(frontmatter.value.targets
        ? { targets: frontmatter.value.targets }
        : {}),
    });
  }
  const skills: SkillPackage[] = [];
  for (const declared of [...manifest.skills].sort((a, b) =>
    compareOrdinal(a.name, b.name),
  )) {
    if (!selected.skills.includes(declared.name)) continue;
    const source = {
      id: `${namespace}/${declared.name}`,
      path: `${declared.path}/SKILL.md`,
      line: 1,
      column: 1,
    };
    const entry = files.get(source.path);
    if (!entry) continue;
    const packageFiles = checked.value
      .filter((entry) => entry.path.startsWith(`${declared.path}/`))
      .map((entry) => ({
        ...entry,
        path: entry.path.slice(declared.path.length + 1),
        bytes: new Uint8Array(entry.bytes),
      }));
    const document = parseMarkdown(entry, source, true);
    if (!document.ok) {
      diagnostics.push(...document.diagnostics);
      continue;
    }
    const frontmatter = metadata(
      document.value,
      skillFrontmatterSchema,
      source,
    );
    if (!frontmatter.ok) {
      diagnostics.push(...frontmatter.diagnostics);
      continue;
    }
    if (frontmatter.value.name !== declared.name) {
      diagnostics.push(
        error(
          'IDENTITY_MISMATCH',
          'SKILL name must match its declared directory name',
          source,
        ),
      );
      continue;
    }
    const filePaths = new Set(packageFiles.map((entry) => entry.path));
    for (const file of packageFiles) {
      const location = { ...source, path: `${declared.path}/${file.path}` };
      if (file.path.toLowerCase() === 'agents/openai.yaml')
        diagnostics.push(
          error(
            'SKILL_CONTROL_UNSUPPORTED',
            'Native skill sidecars are unsupported in this release; controls cannot be dropped',
            location,
          ),
        );
      if (!/\.(?:md|markdown)$/iu.test(file.path)) continue;
      const markdown =
        file.path === 'SKILL.md'
          ? document
          : parseMarkdown(file, location, false);
      if (!markdown.ok) {
        diagnostics.push(...markdown.diagnostics);
        continue;
      }
      diagnostics.push(
        ...validateReferences(
          markdown.value.tree,
          file.path,
          filePaths,
          location,
        ),
      );
    }
    skills.push({
      name: declared.name,
      description: frontmatter.value.description,
      source,
      files: packageFiles,
      ...(declared.targets ? { targets: declared.targets } : {}),
    });
  }
  const orderedDiagnostics = sortDiagnostics(diagnostics);
  return orderedDiagnostics.some(
    (diagnostic) => diagnostic.severity === 'error',
  )
    ? failure(orderedDiagnostics)
    : success(
        { rules, skills, diagnostics: orderedDiagnostics },
        orderedDiagnostics,
      );
}
