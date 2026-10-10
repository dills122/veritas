import { renderCodex } from '../adapters/codex/index.js';
import { renderClaude } from '../adapters/claude/index.js';
import { renderKiro } from '../adapters/kiro/index.js';
import { PROFILES } from '../adapters/profiles/index.js';
import {
  adaptationsSchema,
  digestSchema,
  qualifiedIdSchema,
  targetSelectionsSchema,
} from '../config/schemas.js';
import { error, sortDiagnostics } from '../diagnostics/index.js';
import { canonicalJson, compareOrdinal, sha256 } from '../model/hash.js';
import { isManagedPath, pathsProblem } from '../model/paths.js';
import type {
  AdapterInput,
  Artifact,
  CanonicalRule,
  CompileInput,
  CompileResult,
  Diagnostic,
  LoadingEdge,
  RuleTargetResult,
  TargetId,
} from '../model/types.js';

export function compile(input: CompileInput): CompileResult {
  const diagnostics: Diagnostic[] = [],
    compatibility: RuleTargetResult[] = [],
    loading: LoadingEdge[] = [];
  const targets = [...input.targets].sort((a, b) => compareOrdinal(a.id, b.id));
  const rules = [...input.rules].sort((a, b) => compareOrdinal(a.id, b.id));
  const skills = [...input.skills].sort((a, b) =>
    compareOrdinal(a.name, b.name),
  );
  const adaptations = [...input.adaptations].sort(
    (a, b) =>
      compareOrdinal(a.rule, b.rule) || compareOrdinal(a.target, b.target),
  );
  const finish = (artifacts: readonly Artifact[]): CompileResult => ({
    artifacts,
    diagnostics: sortDiagnostics(diagnostics),
    compatibility,
    loading,
    inputDigest: input.inputDigest,
    adaptations,
    profiles: targets,
  });
  if (
    !targetSelectionsSchema.safeParse(targets).success ||
    !adaptationsSchema.safeParse(adaptations).success ||
    !digestSchema.safeParse(input.inputDigest).success
  ) {
    diagnostics.push(
      error(
        'COMPILE_INPUT_INVALID',
        'Invalid target profiles, adaptations or input identity',
      ),
    );
    return finish([]);
  }
  if (
    new Set(rules.map((rule) => rule.id)).size !== rules.length ||
    new Set(skills.map((skill) => skill.name)).size !== skills.length
  )
    diagnostics.push(
      error(
        'IDENTITY_COLLISION',
        'Selected rule IDs and skill names must be unique',
      ),
    );
  if (
    rules.some((rule) => !qualifiedIdSchema.safeParse(rule.id).success) ||
    skills.some(
      (skill) => !qualifiedIdSchema.safeParse(skill.source.id).success,
    )
  )
    diagnostics.push(
      error(
        'IDENTITY_INVALID',
        'Canonical source identities must be qualified',
      ),
    );
  const intended = (
    rule: { targets?: readonly TargetId[] },
    target: TargetId,
  ) => !rule.targets || rule.targets.includes(target);
  for (const adaptation of adaptations) {
    const rule = rules.find((rule) => rule.id === adaptation.rule);
    if (
      !rule ||
      rule.activation.mode !== 'files' ||
      !intended(rule, adaptation.target) ||
      !targets.some((target) => target.id === adaptation.target)
    )
      diagnostics.push({
        ...error(
          'ADAPTATION_INVALID',
          `Adaptation does not apply to selected file rule ${adaptation.rule}`,
        ),
        target: adaptation.target,
      });
  }
  if (diagnostics.some((item) => item.severity === 'error')) return finish([]);
  const effective = new Map<TargetId, CanonicalRule[]>();
  for (const target of targets) {
    const selected: CanonicalRule[] = [];
    for (const rule of rules.filter((rule) => intended(rule, target.id))) {
      const adapted = adaptations.some(
        (adaptation) =>
          adaptation.rule === rule.id && adaptation.target === target.id,
      );
      const status = adapted
        ? 'adapted'
        : PROFILES[target.id].nativeActivation.includes(rule.activation.mode)
          ? 'native'
          : 'unsupported';
      compatibility.push({
        rule: rule.id,
        target: target.id,
        status,
        activation: rule.activation.mode,
      });
      if (status === 'unsupported')
        diagnostics.push({
          ...error(
            'ACTIVATION_UNSUPPORTED',
            `${target.id} cannot preserve ${rule.activation.mode} steering`,
            rule.source,
          ),
          target: target.id,
        });
      else {
        selected.push(
          adapted ? { ...rule, activation: { mode: 'always' } } : rule,
        );
        if (adapted)
          diagnostics.push({
            code: 'ACTIVATION_ADAPTED',
            severity: 'warning',
            message: `Explicitly broadened ${rule.id} from files to always`,
            source: rule.source,
            target: target.id,
          });
      }
    }
    effective.set(target.id, selected);
  }
  for (const rule of rules)
    if (!targets.some((target) => intended(rule, target.id)))
      diagnostics.push({
        code: 'NO_CONSUMERS',
        severity: 'warning',
        message: `Selected rule ${rule.id} has no selected consumer`,
        source: rule.source,
      });
  const shared = (effective.get('codex') ?? []).filter(
    (rule) => rule.activation.mode === 'always',
  );
  for (const rule of shared)
    for (const target of targets)
      if (
        !effective
          .get(target.id)
          ?.some(
            (candidate) =>
              candidate.id === rule.id &&
              candidate.activation.mode === 'always',
          )
      )
        diagnostics.push({
          ...error(
            'SHARED_SCOPE_LEAK',
            `AGENTS.md would expose ${rule.id} unconditionally to ${target.id}`,
            rule.source,
          ),
          target: target.id,
        });
  if (diagnostics.some((item) => item.severity === 'error')) return finish([]);
  const artifacts: Artifact[] = [];
  for (const target of targets) {
    const adapterInput: AdapterInput = {
      target: target.id,
      rules: effective.get(target.id) ?? [],
      skills,
      sharedRuleIds: shared.map((rule) => rule.id),
      sharedConsumers: shared.length ? targets.map((target) => target.id) : [],
    };
    const result =
      target.id === 'codex'
        ? renderCodex(adapterInput)
        : target.id === 'claude'
          ? renderClaude(adapterInput)
          : renderKiro(adapterInput);
    artifacts.push(...result.artifacts);
    loading.push(...result.loading);
    diagnostics.push(...result.diagnostics);
    if (shared.length && (target.id === 'kiro-ide' || target.id === 'kiro-cli'))
      loading.push({
        consumer: target.id,
        artifactPath: 'AGENTS.md',
        ruleIds: shared.map((rule) => rule.id),
      });
  }
  const merged = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    const prior = merged.get(artifact.path);
    if (!isManagedPath(artifact.path)) {
      diagnostics.push(
        error('OUTPUT_PATH_UNSAFE', `Unsafe generated path ${artifact.path}`),
      );
      continue;
    }
    if (!prior) {
      merged.set(artifact.path, {
        ...artifact,
        sourceIds: [...artifact.sourceIds].sort(compareOrdinal),
        consumers: [...artifact.consumers].sort(compareOrdinal),
      });
      continue;
    }
    const coalescible =
      artifact.path.startsWith('.kiro/') &&
      !prior.consumers.some((consumer) =>
        artifact.consumers.includes(consumer),
      ) &&
      prior.executable === artifact.executable &&
      sha256(prior.bytes) === sha256(artifact.bytes) &&
      canonicalJson(prior.sourceIds) ===
        canonicalJson([...artifact.sourceIds].sort(compareOrdinal));
    if (!coalescible)
      diagnostics.push(
        error(
          'OUTPUT_COLLISION',
          `Multiple outputs collide at ${artifact.path}`,
        ),
      );
    else
      merged.set(artifact.path, {
        ...prior,
        consumers: [
          ...new Set([...prior.consumers, ...artifact.consumers]),
        ].sort(compareOrdinal),
      });
  }
  const desired = [...merged.values()].sort((a, b) =>
    compareOrdinal(a.path, b.path),
  );
  const pathIssue = pathsProblem(desired.map((artifact) => artifact.path));
  if (pathIssue) diagnostics.push(error('OUTPUT_PATH_UNSAFE', pathIssue));
  const kiroConsumers = targets
    .filter((target) => target.id.startsWith('kiro-'))
    .map((target) => target.id);
  for (const artifact of desired.filter((artifact) =>
    artifact.path.startsWith('.kiro/'),
  ))
    if (
      kiroConsumers.some((consumer) => !artifact.consumers.includes(consumer))
    )
      diagnostics.push(
        error(
          'SHARED_SCOPE_LEAK',
          `${artifact.path} is also loaded by an excluded Kiro consumer`,
        ),
      );
  // Count effective routes from target roots, following explicit imports only.
  for (const target of targets) {
    const roots = loading.filter((edge) => edge.consumer === target.id);
    const imported = new Set(roots.flatMap((edge) => edge.imports ?? []));
    const counts = new Map<string, number>();
    const walk = (path: string, chain: readonly string[]) => {
      if (chain.includes(path)) {
        diagnostics.push(
          error('LOADING_CYCLE', `Instruction import cycle at ${path}`),
        );
        return;
      }
      const artifact = merged.get(path);
      if (!artifact || !artifact.consumers.includes(target.id)) {
        diagnostics.push(
          error('LOADING_INVALID', `Missing or excluded loading path ${path}`),
        );
        return;
      }
      const directRuleIds =
        roots.find((edge) => edge.artifactPath === path)?.ruleIds ??
        artifact.sourceIds;
      for (const id of directRuleIds)
        if (rules.some((rule) => rule.id === id))
          counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const edge of roots.filter((edge) => edge.artifactPath === path))
        for (const importedPath of edge.imports ?? [])
          walk(importedPath, [...chain, path]);
    };
    for (const edge of roots.filter((edge) => !imported.has(edge.artifactPath)))
      walk(edge.artifactPath, []);
    for (const rule of rules) {
      const expected = intended(rule, target.id) ? 1 : 0;
      if ((counts.get(rule.id) ?? 0) !== expected)
        diagnostics.push({
          ...error(
            'LOADING_INVALID',
            `Expected ${expected} route for ${rule.id}, found ${counts.get(rule.id) ?? 0}`,
            rule.source,
          ),
          target: target.id,
        });
    }
  }
  loading.sort(
    (a, b) =>
      compareOrdinal(a.consumer, b.consumer) ||
      compareOrdinal(a.artifactPath, b.artifactPath),
  );
  return finish(
    diagnostics.some((item) => item.severity === 'error') ? [] : desired,
  );
}
