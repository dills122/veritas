export const OUTPUT_VERSION = 1;
export const TARGET_IDS = ['codex', 'claude', 'kiro-ide', 'kiro-cli'] as const;
export type TargetId = (typeof TARGET_IDS)[number];
export type SourceLocation = {
  id: string;
  path: string;
  line?: number;
  column?: number;
};
export type Diagnostic = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source?: SourceLocation;
  target?: TargetId;
  remediation?: string;
};
export type Result<T> =
  | { ok: true; value: T; diagnostics: readonly Diagnostic[] }
  | { ok: false; diagnostics: readonly Diagnostic[] };
export type Activation =
  | { mode: 'always' }
  | { mode: 'files'; patterns: readonly string[] }
  | { mode: 'manual' }
  | { mode: 'auto' };
export type FileEntry = {
  path: string;
  bytes: Uint8Array;
  executable: boolean;
};
export type Snapshot = { treeDigest: string; files: readonly FileEntry[] };
export type CanonicalRule = {
  id: string;
  description: string;
  activation: Activation;
  body: string;
  source: SourceLocation;
  targets?: readonly TargetId[];
};
export type SkillPackage = {
  name: string;
  description: string;
  source: SourceLocation;
  files: readonly FileEntry[];
  targets?: readonly TargetId[];
};
export type NormalizedLibrary = {
  rules: readonly CanonicalRule[];
  skills: readonly SkillPackage[];
  diagnostics: readonly Diagnostic[];
};
export type Adaptation = {
  rule: string;
  target: TargetId;
  kind: 'files-to-always';
};
export type TargetSelection = { id: TargetId; profile: string };
export type Artifact = FileEntry & {
  sourceIds: readonly string[];
  consumers: readonly TargetId[];
};
export type Compatibility = 'native' | 'adapted' | 'unsupported';
export type RuleTargetResult = {
  rule: string;
  target: TargetId;
  status: Compatibility;
  activation: Activation['mode'];
  reason?: string;
};
export type LoadingEdge = {
  consumer: TargetId;
  artifactPath: string;
  ruleIds: readonly string[];
  imports?: readonly string[];
};
export type AdapterInput = {
  target: TargetId;
  rules: readonly CanonicalRule[];
  skills: readonly SkillPackage[];
  sharedRuleIds: readonly string[];
  sharedConsumers: readonly TargetId[];
};
export type AdapterResult = {
  artifacts: readonly Artifact[];
  diagnostics: readonly Diagnostic[];
  loading: readonly LoadingEdge[];
};
export type CompileInput = {
  rules: readonly CanonicalRule[];
  skills: readonly SkillPackage[];
  targets: readonly TargetSelection[];
  adaptations: readonly Adaptation[];
  inputDigest: string;
};
export type CompileResult = {
  artifacts: readonly Artifact[];
  diagnostics: readonly Diagnostic[];
  compatibility: readonly RuleTargetResult[];
  loading: readonly LoadingEdge[];
  inputDigest: string;
  adaptations: readonly Adaptation[];
  profiles: readonly TargetSelection[];
};
export type ObservedFileState =
  | { kind: 'missing' }
  | { kind: 'file'; sha256: string; executable: boolean }
  | { kind: 'unsafe'; reason: string };
export type Operation = {
  kind: 'create' | 'replace' | 'delete' | 'unchanged' | 'conflict';
  path: string;
  expectedBefore: ObservedFileState;
  after?: Artifact;
};
export type ManifestEntry = {
  path: string;
  sha256: string;
  executable: boolean;
  sourceIds: readonly string[];
  consumers: readonly TargetId[];
};
export type Manifest = {
  schemaVersion: 1;
  outputVersion: number;
  profiles: readonly TargetSelection[];
  inputDigest: string;
  adaptations: readonly Adaptation[];
  artifacts: readonly ManifestEntry[];
};
export type WritePlan = {
  operations: readonly Operation[];
  diagnostics: readonly Diagnostic[];
  manifest: Manifest;
  manifestBytes: Uint8Array;
  expectedManifest: ObservedFileState;
  manifestChanged: boolean;
  hasDrift: boolean;
  hasConflicts: boolean;
};
export type LockedSource = {
  namespace: string;
  kind: 'local' | 'git';
  requestedRef?: string;
  resolvedCommit?: string;
  treeDigest: string;
};
export type SourceLock = {
  schemaVersion: 1;
  source: LockedSource;
  sourceDescriptorDigest: string;
  compiler: { outputVersion: number };
  profiles: readonly TargetSelection[];
};
export type JournalEntry = {
  path: string;
  before: ObservedFileState;
  after: ObservedFileState;
};
export type Journal = {
  schemaVersion: 1;
  kind: 'sync' | 'init' | 'update';
  id: string;
  phase: 'prepared' | 'applying' | 'committed';
  commitPath: '.veritas/manifest.json' | 'veritas.lock.json';
  entries: readonly JournalEntry[];
};
export type CommandEnvelope = {
  schemaVersion: 1;
  command: string;
  outcome:
    'success' | 'drift' | 'invalid' | 'conflict' | 'operational' | 'busy';
  diagnostics: readonly Diagnostic[];
  data: unknown;
};
export const LIMITS = {
  configBytes: 1_048_576,
  documentBytes: 1_048_576,
  assetBytes: 10_485_760,
  snapshotBytes: 104_857_600,
  entries: 10_000,
  depth: 16,
  rules: 1_000,
  skills: 1_000,
} as const;
