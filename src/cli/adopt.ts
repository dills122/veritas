import { lstat } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import { isMap, isSeq, parse, parseDocument, stringify } from 'yaml';
import { identifierSchema, manifestSchema } from '../config/schemas.js';
import { error } from '../diagnostics/index.js';
import { PROFILES } from '../adapters/profiles/index.js';
import { LIMITS, TARGET_IDS } from '../model/types.js';
import type { Diagnostic } from '../model/types.js';
import { parseLibrary } from '../parsing/library.js';
import { readSourceTree } from '../sources/snapshot.js';
import { createFiles, rewriteFile } from '../sync/authoring.js';
import type { NewFile, Rollback } from '../sync/authoring.js';
import { readObservedFile } from '../sync/observe.js';
import { createLocalSnapshot } from '../sources/local.js';
import { CommandError, readConfig, sourceSelection } from './pipeline.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

export type AdoptOptions = {
  path: string;
  id?: string;
  description?: string;
  targets?: string;
};
export type AdoptResult = {
  data: Record<string, unknown>;
  human: readonly string[];
  diagnostics: readonly Diagnostic[];
};

/** Paths an existing valid ownership manifest already owns; unreadable or corrupt manifests own nothing. */
export async function manifestOwnedPaths(
  project: string,
): Promise<Set<string>> {
  try {
    const read = await readObservedFile(project, '.veritas/manifest.json');
    if (read.state.kind !== 'file' || !read.bytes) return new Set();
    const parsed = manifestSchema.safeParse(
      JSON.parse(decoder.decode(read.bytes)),
    );
    return parsed.success
      ? new Set(parsed.data.artifacts.map((artifact) => artifact.path))
      : new Set();
  } catch {
    return new Set();
  }
}

function fail(
  exitCode: 2 | 3,
  code: string,
  message: string,
  remediation?: string,
): CommandError {
  return new CommandError(exitCode, [
    { ...error(code, message), ...(remediation ? { remediation } : {}) },
  ]);
}

function kebab(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64);
}

type Activation =
  | { mode: 'always' | 'manual' | 'auto' }
  | { mode: 'files'; patterns: string[] };

/** Splits on commas outside braces, so `a/*.{ts,tsx},b` is two patterns. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0,
    current = '';
  for (const char of text) {
    if (char === '{') depth++;
    if (char === '}') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}
/** Veritas patterns have no braces; `*.{ts,tsx}` expands to the equivalent pair of patterns. */
export function expandBraces(pattern: string): string[] {
  const match = /\{([^{}]*)\}/u.exec(pattern);
  if (!match) return [pattern];
  return (match[1] ?? '')
    .split(',')
    .flatMap((alternative) =>
      expandBraces(
        pattern.slice(0, match.index) +
          alternative +
          pattern.slice(match.index + match[0].length),
      ),
    );
}
function patternList(value: unknown): string[] | undefined {
  const items = typeof value === 'string' ? splitTopLevel(value) : value;
  if (!Array.isArray(items)) return undefined;
  const list = items
    .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  if (list.length !== items.length || !list.length) return undefined;
  const expanded = [...new Set(list.flatMap(expandBraces))];
  return expanded.length <= 100 ? expanded : undefined;
}

/** Maps Kiro steering and Claude rule frontmatter to a Veritas activation; unknown frontmatter is refused. */
function activationFor(
  path: string,
  frontmatter: Record<string, unknown> | undefined,
): { activation: Activation; description?: string } {
  if (!frontmatter) return { activation: { mode: 'always' } };
  const description =
    typeof frontmatter.description === 'string'
      ? frontmatter.description
      : undefined;
  const base = description ? { description } : {};
  if (path.startsWith('.kiro/steering/')) {
    const inclusion = frontmatter.inclusion ?? 'always';
    if (
      inclusion === 'always' ||
      inclusion === 'manual' ||
      inclusion === 'auto'
    )
      return { activation: { mode: inclusion }, ...base };
    if (inclusion === 'fileMatch') {
      const patterns = patternList(frontmatter.fileMatchPattern);
      if (patterns) return { activation: { mode: 'files', patterns }, ...base };
    }
    throw fail(
      2,
      'ADOPT_FRONTMATTER_UNSUPPORTED',
      `Cannot map Kiro inclusion ${JSON.stringify(inclusion)} in ${path}`,
      'Use inclusion always, fileMatch (with fileMatchPattern), manual or auto, or write the library entry by hand.',
    );
  }
  if (path.startsWith('.claude/rules/')) {
    if (frontmatter.paths === undefined)
      return { activation: { mode: 'always' }, ...base };
    const patterns = patternList(frontmatter.paths);
    if (patterns) return { activation: { mode: 'files', patterns }, ...base };
  }
  throw fail(
    2,
    'ADOPT_FRONTMATTER_UNSUPPORTED',
    `${path} has frontmatter Veritas cannot interpret`,
    'Remove the frontmatter from a copy and adopt that, or write the library entry by hand (see docs/user-guide.md).',
  );
}

function splitFrontmatter(text: string): {
  frontmatter?: Record<string, unknown>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(text);
  if (!match) return { body: text };
  let value: unknown;
  try {
    value = parse(match[1] ?? '', { maxAliasCount: 0 });
  } catch {
    throw fail(
      2,
      'ADOPT_FRONTMATTER_UNSUPPORTED',
      'Frontmatter is not valid YAML',
    );
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw fail(
      2,
      'ADOPT_FRONTMATTER_UNSUPPORTED',
      'Frontmatter must be a mapping',
    );
  return {
    frontmatter: value as Record<string, unknown>,
    body: text.slice(match[0].length),
  };
}

function blockSeq<T>(node: T): T {
  if (isSeq(node)) node.flow = false;
  return node;
}

function derive(path: string): string {
  const stem = basename(path)
    .replace(/\.md$/iu, '')
    .replace(/\.instructions$/iu, '');
  if (/^agents(\.override)?$/iu.test(stem)) return 'agents-guidance';
  if (/^claude$/iu.test(stem)) return 'claude-guidance';
  return kebab(stem);
}

/** Copies existing guidance into the project library as new files. The original is never touched. */
export async function adopt(
  project: string,
  options: AdoptOptions,
): Promise<AdoptResult> {
  const { config } = await readConfig(project);
  let libraryPath: string,
    profile: string,
    namespace: string,
    needsUpdate: boolean;
  if (config.local) {
    libraryPath = config.local.path;
    profile = config.local.profile;
    namespace = 'local';
    needsUpdate = false;
  } else {
    const selected = sourceSelection(config);
    if (!('path' in selected.descriptor))
      throw fail(
        2,
        'ADOPT_NO_LIBRARY',
        'This project has no writable library: its source is a Git repository',
        'Add a local library to veritas.yaml (`local: {path: .veritas/local, profile: project}`) and create veritas.library.yaml there, then retry. See docs/user-guide.md.',
      );
    libraryPath = selected.descriptor.path;
    profile = selected.profile;
    namespace = selected.namespace;
    needsUpdate = true;
  }
  const root = resolve(project);
  const libraryAbsolute = resolve(root, libraryPath);
  const libraryRel = relative(root, libraryAbsolute).split(sep).join('/');
  if (!libraryRel || libraryRel.startsWith('..'))
    throw fail(
      2,
      'ADOPT_NO_LIBRARY',
      `The library at ${libraryPath} is outside this project, so Veritas will not write to it`,
      'Edit that library directly, or add a project-local library.',
    );

  // Like any CLI path argument, this is relative to the shell's directory, not the project root.
  const inputAbsolute = resolve(options.path);
  const inputRel = relative(root, inputAbsolute).split(sep).join('/');
  if (
    !inputRel ||
    inputRel.startsWith('..') ||
    inputRel === '.git' ||
    inputRel.startsWith('.git/') ||
    inputRel === '.veritas' ||
    inputRel.startsWith('.veritas/') ||
    inputRel === 'veritas.yaml' ||
    inputRel === 'veritas.lock.json' ||
    inputRel === libraryRel ||
    inputRel.startsWith(`${libraryRel}/`)
  )
    throw fail(
      2,
      'ADOPT_PATH_INVALID',
      `Cannot adopt ${options.path}`,
      'Pass an existing guidance file or skill directory inside the project, outside the library and .veritas/runtime.',
    );
  const owned = await manifestOwnedPaths(project);
  if (
    [...owned].some(
      (path) => path === inputRel || path.startsWith(`${inputRel}/`),
    )
  )
    throw fail(
      2,
      'ADOPT_ALREADY_MANAGED',
      `${inputRel} is already generated by Veritas`,
      'Edit the library source instead; generated files are overwritten on sync.',
    );
  let entry;
  try {
    entry = await lstat(inputAbsolute);
  } catch {
    throw fail(2, 'ADOPT_PATH_INVALID', `${inputRel} does not exist`);
  }
  if (entry.isSymbolicLink() || !(entry.isFile() || entry.isDirectory()))
    throw fail(
      2,
      'ADOPT_PATH_INVALID',
      `${inputRel} must be an ordinary file or directory`,
    );

  const manifestPath = `${libraryRel}/veritas.library.yaml`;
  const manifestRead = await readObservedFile(project, manifestPath);
  if (manifestRead.state.kind !== 'file' || !manifestRead.bytes)
    throw fail(2, 'ADOPT_NO_LIBRARY', `${manifestPath} was not found`);
  const document = parseDocument(decoder.decode(manifestRead.bytes));
  const profiles = document.get('profiles');
  const profileNode = isMap(profiles) ? profiles.get(profile, true) : undefined;
  if (!isMap(profileNode))
    throw fail(
      2,
      'ADOPT_PROFILE_MISSING',
      `Profile '${profile}' is not declared in ${manifestPath}`,
    );

  const files: NewFile[] = [];
  let kind: 'steering' | 'skill', id: string, mode: string;
  let targetNote: string | undefined;
  if (entry.isFile()) {
    kind = 'steering';
    const read = await readObservedFile(project, inputRel);
    if (read.state.kind !== 'file' || !read.bytes)
      throw fail(
        2,
        'ADOPT_PATH_INVALID',
        `${inputRel} is not a safe ordinary file`,
      );
    if (read.bytes.byteLength > LIMITS.configBytes)
      throw fail(
        2,
        'ADOPT_PATH_INVALID',
        `${inputRel} exceeds the 1 MiB steering limit`,
      );
    let text: string;
    try {
      text = decoder.decode(read.bytes);
    } catch {
      throw fail(2, 'ADOPT_PATH_INVALID', `${inputRel} is not valid UTF-8`);
    }
    const { frontmatter, body } = splitFrontmatter(
      text.replace(/\r\n/gu, '\n'),
    );
    const mapped = activationFor(inputRel, frontmatter);
    id = options.id ?? derive(inputRel);
    if (!identifierSchema.safeParse(id).success)
      throw fail(
        2,
        'ADOPT_ID_INVALID',
        id
          ? `'${id}' is not a valid id (lowercase letters, digits and single hyphens)`
          : `Could not derive a name from ${inputRel}`,
        'Pass a valid name with --id.',
      );
    const heading = /^#\s+(.+)$/mu.exec(body)?.[1]?.trim();
    const description = (
      options.description ??
      mapped.description ??
      heading ??
      `Adopted from ${inputRel}`
    ).trim();
    mode = mapped.activation.mode;
    const requested = options.targets
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (
      requested?.some(
        (item) => !(TARGET_IDS as readonly string[]).includes(item),
      )
    )
      throw fail(
        2,
        'ADOPT_TARGETS_INVALID',
        `--targets must list ${TARGET_IDS.join(', ')}`,
      );
    const capable = TARGET_IDS.filter((target) =>
      (PROFILES[target].nativeActivation as readonly string[]).includes(mode),
    );
    const restricted = requested?.length ? requested : capable;
    if (restricted.length < TARGET_IDS.length)
      targetNote = `Restricted to ${restricted.join(', ')}${
        requested?.length
          ? ''
          : `: ${TARGET_IDS.filter((target) => !capable.includes(target)).join(', ')} cannot represent ${mode} activation natively`
      }. Edit 'targets' in the new file, or adapt explicitly (docs/user-guide.md), to widen it.`;
    const header = stringify(
      {
        id,
        description,
        activation: mapped.activation,
        ...(restricted.length < TARGET_IDS.length
          ? { targets: restricted }
          : {}),
      },
      { lineWidth: 0 },
    );
    files.push({
      path: `${libraryRel}/steering/${id}.md`,
      bytes: encoder.encode(`---\n${header}---\n${body.replace(/^\n+/u, '')}`),
    });
    const steering = document.get('steering', true);
    if (isSeq(steering)) {
      for (const item of steering.items)
        if (isMap(item) && item.get('id') === id)
          throw fail(
            3,
            'ADOPT_ID_EXISTS',
            `The library already declares steering '${id}'`,
            'Choose another name with --id.',
          );
      steering.add(document.createNode({ id, path: `steering/${id}.md` }));
    } else
      document.set(
        'steering',
        blockSeq(document.createNode([{ id, path: `steering/${id}.md` }])),
      );
  } else {
    kind = 'skill';
    mode = 'skill';
    id = options.id ?? basename(inputRel);
    if (!identifierSchema.safeParse(id).success)
      throw fail(
        2,
        'ADOPT_ID_INVALID',
        `'${id}' is not a valid skill name`,
        'Pass a valid name with --id.',
      );
    const tree = await readSourceTree(inputAbsolute);
    if (!tree.files.some((file) => file.path === 'SKILL.md'))
      throw fail(2, 'ADOPT_PATH_INVALID', `${inputRel} has no SKILL.md`);
    for (const file of tree.files)
      files.push({
        path: `${libraryRel}/skills/${id}/${file.path}`,
        bytes: file.bytes,
        executable: file.executable,
      });
    const skills = document.get('skills', true);
    if (isSeq(skills)) {
      for (const item of skills.items)
        if (isMap(item) && item.get('name') === id)
          throw fail(
            3,
            'ADOPT_ID_EXISTS',
            `The library already declares skill '${id}'`,
            'Choose another name with --id.',
          );
      skills.add(document.createNode({ name: id, path: `skills/${id}` }));
    } else
      document.set(
        'skills',
        blockSeq(document.createNode([{ name: id, path: `skills/${id}` }])),
      );
  }
  const key = kind === 'steering' ? 'steering' : 'skills';
  const selection = profileNode.get(key, true);
  if (isSeq(selection)) selection.add(document.createNode(id));
  else profileNode.set(key, document.createNode([id]));

  const rollbacks: Rollback[] = [];
  const undo = async () => {
    for (const rollback of rollbacks.reverse())
      await rollback().catch(() => undefined);
  };
  try {
    rollbacks.push(await createFiles(project, files));
    rollbacks.push(
      await rewriteFile(
        project,
        manifestPath,
        manifestRead.bytes,
        encoder.encode(String(document)),
      ),
    );
    const parsed = parseLibrary(
      await createLocalSnapshot(libraryAbsolute),
      namespace,
      profile,
    );
    if (!parsed.ok)
      throw new CommandError(
        2,
        parsed.diagnostics.map((item) => ({
          ...item,
          remediation:
            item.remediation ??
            'Nothing was written. Fix the reported problem in a copy of the original and adopt that, or write the library entry by hand (see docs/user-guide.md).',
        })),
      );
  } catch (cause) {
    await undo();
    throw cause;
  }
  return {
    data: {
      adopted: inputRel,
      kind,
      id,
      mode,
      library: libraryRel,
      files: files.map((file) => file.path),
      libraryUpdateRequired: needsUpdate,
    },
    human: [
      `Adopted ${inputRel} as ${kind} '${id}'${kind === 'steering' ? ` (${mode})` : ''} in ${libraryRel}.`,
      `Written: ${files.map((file) => file.path).join(', ')}`,
      ...(targetNote ? [targetNote] : []),
      `${inputRel} was not changed or removed.`,
      `Next: review the new file, then delete or rename ${inputRel}${needsUpdate ? ', run `veritas update`' : ''}, and run plan and sync.`,
    ],
    diagnostics: [],
  };
}
