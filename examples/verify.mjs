import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  compile,
  createLocalSnapshot,
  parseLibrary,
  parseProjectConfig,
  sha256,
} from '../dist/index.js';

const root = new URL('./', import.meta.url);
const upstream = await createLocalSnapshot(
  fileURLToPath(new URL('company-library/', root)),
);
const local = await createLocalSnapshot(
  fileURLToPath(new URL('local-overlay/', root)),
);

function library(snapshot, namespace, profile) {
  const result = parseLibrary(snapshot, namespace, profile);
  assert.equal(result.ok, true, canonicalJson(result.diagnostics));
  return result.value;
}
async function config(name) {
  const text = await readFile(new URL(`project/${name}`, root), 'utf8');
  const result = parseProjectConfig(text);
  assert.equal(result.ok, true, canonicalJson(result.diagnostics));
  return result.value;
}
function input(parsed, selection, additional) {
  return {
    rules: [...parsed.rules, ...(additional?.rules ?? [])],
    skills: [...parsed.skills, ...(additional?.skills ?? [])],
    targets: selection.targets,
    adaptations: selection.compatibility.adaptations,
    inputDigest: sha256(
      canonicalJson({
        upstream: upstream.treeDigest,
        local: additional ? local.treeDigest : null,
        profile: selection.profile,
        targets: selection.targets,
        adaptations: selection.compatibility.adaptations,
      }),
    ),
  };
}
function successful(result) {
  assert.equal(
    result.diagnostics.some((item) => item.severity === 'error'),
    false,
    canonicalJson(result.diagnostics),
  );
  return result;
}
function artifactInventory(result) {
  return result.artifacts.map((artifact) => ({
    path: artifact.path,
    sha256: sha256(artifact.bytes),
    executable: artifact.executable,
    sourceIds: artifact.sourceIds,
    consumers: artifact.consumers,
  }));
}

const baselineConfig = await config('veritas.yaml');
const baseline = library(upstream, 'company', 'baseline');
const baselineInput = input(baseline, baselineConfig);
const rendered = successful(compile(baselineInput));
assert.deepEqual(
  artifactInventory(rendered),
  artifactInventory(compile(baselineInput)),
);
assert.ok(rendered.artifacts.some((artifact) => artifact.path === 'AGENTS.md'));
assert.ok(rendered.artifacts.some((artifact) => artifact.path === 'CLAUDE.md'));
const sourceBinary = baseline.skills[0].files.find(
  (entry) => entry.path === 'assets/bytes.bin',
);
assert.ok(sourceBinary);
for (const destination of ['.agents', '.claude', '.kiro']) {
  const asset = rendered.artifacts.find(
    (entry) =>
      entry.path === `${destination}/skills/review-repository/assets/bytes.bin`,
  );
  const companion = rendered.artifacts.find(
    (entry) =>
      entry.path === `${destination}/skills/review-repository/scripts/inert.sh`,
  );
  assert.ok(asset);
  assert.equal(sha256(asset.bytes), sha256(sourceBinary.bytes));
  assert.equal(companion?.executable, true);
}

const nativeConfig = await config('native-typescript.yaml');
const native = successful(
  compile(
    input(library(upstream, 'company', 'native-typescript'), nativeConfig),
  ),
);
assert.ok(
  native.artifacts.some(
    (entry) => entry.path === '.claude/rules/company--typescript-native.md',
  ),
);
assert.ok(
  native.artifacts.some(
    (entry) => entry.path === '.kiro/steering/company--typescript-native.md',
  ),
);
assert.equal(
  native.compatibility.some(
    (entry) =>
      entry.rule === 'company/typescript-native' && entry.target === 'codex',
  ),
  false,
);

const conditional = library(upstream, 'company', 'typescript');
const unsupported = compile(
  input(conditional, { ...baselineConfig, profile: 'company/typescript' }),
);
assert.ok(
  unsupported.diagnostics.some(
    (item) => item.code === 'ACTIVATION_UNSUPPORTED',
  ),
);
assert.deepEqual(unsupported.artifacts, []);

const adaptationConfig = await config('codex-adaptation.yaml');
const adapted = successful(compile(input(conditional, adaptationConfig)));
assert.ok(
  adapted.diagnostics.some((item) => item.code === 'ACTIVATION_ADAPTED'),
);
const leaked = compile(
  input(conditional, {
    ...baselineConfig,
    profile: 'company/typescript',
    compatibility: adaptationConfig.compatibility,
  }),
);
assert.ok(leaked.diagnostics.some((item) => item.code === 'SHARED_SCOPE_LEAK'));
assert.deepEqual(leaked.artifacts, []);

const overlay = library(local, 'local', 'project');
const withLocal = successful(compile(input(baseline, baselineConfig, overlay)));
assert.ok(
  withLocal.artifacts
    .find((entry) => entry.path === 'AGENTS.md')
    ?.sourceIds.includes('local/project-context'),
);
console.log(
  JSON.stringify(
    {
      examples: 'passed',
      checks: [
        'baseline',
        'repeat-determinism',
        'complete-skill-assets',
        'native-conditional-selection',
        'unsupported-codex-files',
        'explicit-adaptation',
        'shared-scope-leak',
        'local-overlay',
      ],
      artifacts: artifactInventory(rendered),
    },
    null,
    2,
  ),
);
