/* eslint-disable no-control-regex -- Input validation intentionally rejects control bytes. */
import { z } from 'zod';
import { PROFILES } from '../adapters/profiles/index.js';
import {
  isManagedPath,
  pathProblem,
  pathsProblem,
  patternProblem,
} from '../model/paths.js';
import { LIMITS, OUTPUT_VERSION, TARGET_IDS } from '../model/types.js';

export const identifierSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
export const qualifiedIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u);
export const targetIdSchema = z.enum(TARGET_IDS);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const relativePathSchema = z
  .string()
  .refine((path) => !pathProblem(path), 'Unsafe portable path');
export const managedPathSchema = relativePathSchema.refine(
  isManagedPath,
  'Outside generated output allowlist',
);
const uniqueStrings = (items: readonly string[]) =>
  new Set(items).size === items.length;
export const targetsSchema = z
  .array(targetIdSchema)
  .min(1)
  .max(4)
  .refine(uniqueStrings, 'Duplicate target');
export const targetSelectionSchema = z
  .strictObject({ id: targetIdSchema, profile: z.string() })
  .refine(
    (value) => value.profile === PROFILES[value.id].id,
    'Unknown or mismatched capability profile',
  );
export const targetSelectionsSchema = z
  .array(targetSelectionSchema)
  .min(1)
  .max(4)
  .refine(
    (items) => uniqueStrings(items.map((item) => item.id)),
    'Duplicate target selection',
  );
export const adaptationSchema = z.strictObject({
  rule: qualifiedIdSchema,
  target: targetIdSchema,
  kind: z.literal('files-to-always'),
});
export const adaptationsSchema = z
  .array(adaptationSchema)
  .max(LIMITS.rules)
  .refine(
    (items) =>
      uniqueStrings(items.map((item) => `${item.rule}:${item.target}`)),
    'Duplicate adaptation',
  );
export function gitLocatorProblem(locator: string): string | undefined {
  if (/^[A-Za-z]:[\\/]/u.test(locator))
    return 'Windows drive paths are not Git locators';
  if (
    !locator ||
    /^[-/]/u.test(locator) ||
    /[\u0000-\u0020\u007f]/u.test(locator)
  )
    return 'Unsafe Git locator';
  if (/^https:\/\//u.test(locator) || /^ssh:\/\//u.test(locator)) {
    try {
      const url = new URL(locator);
      if (
        !url.hostname ||
        url.password ||
        (url.protocol === 'https:' && url.username) ||
        url.search ||
        url.hash
      )
        return 'Git locator contains credentials or unsupported URL fields';
      return undefined;
    } catch {
      return 'Invalid Git URL';
    }
  }
  if (locator.includes('://')) return 'Unsupported Git URL scheme';
  if (/^(?:[a-zA-Z0-9._-]+@)?[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+$/u.test(locator))
    return undefined;
  return 'Only HTTPS, SSH and validated scp-style Git locators are supported';
}
const localSourcePath = z
  .string()
  .min(1)
  .refine(
    (path) => !path.startsWith('/') && !/[\\:\u0000-\u001f]/u.test(path),
    'Local source uses a relative path',
  );
export const sourceDescriptorSchema = z.union([
  z.strictObject({ path: localSourcePath }),
  z.strictObject({
    git: z
      .string()
      .refine((value) => !gitLocatorProblem(value), 'Unsafe Git locator'),
    ref: z
      .string()
      .min(1)
      .max(1024)
      .refine(
        (ref) => !ref.startsWith('-') && !/[\u0000-\u0020\u007f]/u.test(ref),
        'Unsafe Git ref',
      ),
  }),
]);
export const projectConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    sources: z
      .record(
        identifierSchema.refine((id) => id !== 'local', 'Reserved namespace'),
        sourceDescriptorSchema,
      )
      .refine(
        (value) => Object.keys(value).length === 1,
        'Exactly one source required',
      ),
    profile: qualifiedIdSchema,
    targets: targetSelectionsSchema,
    local: z
      .strictObject({ path: relativePathSchema, profile: identifierSchema })
      .optional(),
    compatibility: z
      .strictObject({ adaptations: adaptationsSchema.default([]) })
      .default({ adaptations: [] }),
  })
  .superRefine((config, ctx) => {
    if (!Object.hasOwn(config.sources, config.profile.split('/')[0] ?? ''))
      ctx.addIssue({
        code: 'custom',
        path: ['profile'],
        message: 'Profile namespace is not configured',
      });
    for (const adaptation of config.compatibility.adaptations)
      if (!config.targets.some((target) => target.id === adaptation.target))
        ctx.addIssue({
          code: 'custom',
          path: ['compatibility'],
          message: 'Adaptation target is not selected',
        });
  });
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type SourceDescriptor = z.infer<typeof sourceDescriptorSchema>;
const selections = z
  .array(identifierSchema)
  .refine(uniqueStrings, 'Duplicate profile selection');
export const libraryManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    steering: z
      .array(z.strictObject({ id: identifierSchema, path: relativePathSchema }))
      .max(LIMITS.rules)
      .default([]),
    skills: z
      .array(
        z.strictObject({
          name: identifierSchema,
          path: relativePathSchema,
          targets: targetsSchema.optional(),
        }),
      )
      .max(LIMITS.skills)
      .default([]),
    profiles: z.record(
      identifierSchema,
      z.strictObject({
        steering: selections.default([]),
        skills: selections.default([]),
      }),
    ),
  })
  .superRefine((library, ctx) => {
    const ruleIds = library.steering.map((rule) => rule.id),
      skillIds = library.skills.map((skill) => skill.name);
    if (!uniqueStrings(ruleIds) || !uniqueStrings(skillIds))
      ctx.addIssue({ code: 'custom', message: 'Duplicate declared identity' });
    const overlap = pathsProblem([
      ...library.steering.map((rule) => rule.path),
      ...library.skills.map((skill) => skill.path),
    ]);
    if (overlap) ctx.addIssue({ code: 'custom', message: overlap });
    for (const [id, profile] of Object.entries(library.profiles))
      if (
        profile.steering.some((rule) => !ruleIds.includes(rule)) ||
        profile.skills.some((skill) => !skillIds.includes(skill))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['profiles', id],
          message: 'Unknown profile reference',
        });
  });
export type LibraryManifest = z.infer<typeof libraryManifestSchema>;
export const activationSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('always') }),
  z.strictObject({
    mode: z.literal('files'),
    patterns: z
      .array(
        z
          .string()
          .max(1024)
          .refine(
            (pattern) => !patternProblem(pattern),
            'Unsupported activation pattern',
          ),
      )
      .min(1)
      .max(100)
      .refine(uniqueStrings, 'Duplicate pattern'),
  }),
  z.strictObject({ mode: z.literal('manual') }),
  z.strictObject({ mode: z.literal('auto') }),
]);
export const ruleFrontmatterSchema = z.strictObject({
  id: identifierSchema,
  description: z.string().trim().min(1).max(4096),
  activation: activationSchema,
  targets: targetsSchema.optional(),
  extensions: z.never().optional(),
});
export const skillFrontmatterSchema = z.strictObject({
  name: identifierSchema,
  description: z.string().trim().min(1).max(1024),
  license: z.string().max(4096).optional(),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});
export const observedFileSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('missing') }),
  z.strictObject({
    kind: z.literal('file'),
    sha256: digestSchema,
    executable: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('unsafe'), reason: z.string().min(1) }),
]);
const safeFileStateSchema = z.union([
  z.strictObject({ kind: z.literal('missing') }),
  z.strictObject({
    kind: z.literal('file'),
    sha256: digestSchema,
    executable: z.boolean(),
  }),
]);
export const manifestEntrySchema = z.strictObject({
  path: managedPathSchema,
  sha256: digestSchema,
  executable: z.boolean(),
  sourceIds: z.array(qualifiedIdSchema).refine(uniqueStrings),
  consumers: targetsSchema,
});
export const manifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    outputVersion: z.literal(OUTPUT_VERSION),
    profiles: targetSelectionsSchema,
    inputDigest: digestSchema,
    adaptations: adaptationsSchema,
    artifacts: z.array(manifestEntrySchema).max(LIMITS.entries),
  })
  .superRefine((manifest, ctx) => {
    const problem = pathsProblem(manifest.artifacts.map((file) => file.path));
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
    if (
      manifest.artifacts.some((file) =>
        file.consumers.some(
          (consumer) =>
            !manifest.profiles.some((profile) => profile.id === consumer),
        ),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Artifact consumer is not a selected profile',
      });
  });
export const lockSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.discriminatedUnion('kind', [
    z.strictObject({
      namespace: identifierSchema,
      kind: z.literal('local'),
      treeDigest: digestSchema,
    }),
    z.strictObject({
      namespace: identifierSchema,
      kind: z.literal('git'),
      requestedRef: z.string().min(1),
      resolvedCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
      treeDigest: digestSchema,
    }),
  ]),
  sourceDescriptorDigest: digestSchema,
  compiler: z.strictObject({ outputVersion: z.literal(OUTPUT_VERSION) }),
  profiles: targetSelectionsSchema,
});
const journalBase = {
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-f0-9-]{36}$/u),
  phase: z.enum(['prepared', 'applying', 'committed']),
  entries: z
    .array(
      z.strictObject({
        path: relativePathSchema,
        before: safeFileStateSchema,
        after: safeFileStateSchema,
      }),
    )
    .min(1)
    .max(LIMITS.entries + 2),
};
export const journalSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...journalBase,
      kind: z.literal('sync'),
      commitPath: z.literal('.veritas/manifest.json'),
    }),
    z.strictObject({
      ...journalBase,
      kind: z.literal('init'),
      commitPath: z.literal('veritas.lock.json'),
    }),
    z.strictObject({
      ...journalBase,
      kind: z.literal('update'),
      commitPath: z.literal('veritas.lock.json'),
    }),
  ])
  .superRefine((journal, ctx) => {
    if (
      !uniqueStrings(journal.entries.map((entry) => entry.path)) ||
      !journal.entries.some((entry) => entry.path === journal.commitPath)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Journal requires distinct paths and a commit entry',
      });
    for (const entry of journal.entries) {
      const allowed =
        journal.kind === 'sync'
          ? isManagedPath(entry.path) || entry.path === '.veritas/manifest.json'
          : entry.path === 'veritas.lock.json' ||
            (journal.kind === 'init' && entry.path === 'veritas.yaml');
      if (!allowed)
        ctx.addIssue({
          code: 'custom',
          message: 'Journal entry exceeds transaction authority',
        });
      if (journal.kind === 'init' && entry.before.kind !== 'missing')
        ctx.addIssue({
          code: 'custom',
          message: 'Init cannot replace existing controls',
        });
    }
  });
