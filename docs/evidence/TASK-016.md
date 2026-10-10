# TASK-016 compatibility record evidence

Status: compatibility matrix and label audit complete for lead integration. All four bundled profile evidence values remain `documentation-based`; all live harness runtime certification is explicitly unverified. No harness was installed or invoked for this task.

## Owned artifact and audit

`docs/compatibility.md` records exact profile IDs, native activation mappings, skill roots, primary documentation references, combined-target limits, portable pattern subset, unsupported invocation controls, fixture paths and a bounded follow-up certification checklist. README/user-guide now link the current matrix while preserving the historical source research.

Source audit used `src/adapters/profiles/index.ts`, all three renderers, `src/compiler/index.ts`, `src/model/paths.ts`, package-parser tests and CLI loading/pattern inventory. Codebase graph coverage does not include newly created application source, so exact source reads were used. Existing research is the authority for vendor URLs/documentation review dates; no new vendor runtime behavior is inferred from generated files.

- `codex-repo-v1`: native always only, `.agents/skills`.
- `claude-repo-v1`: native always/files, `.claude/skills`.
- `kiro-ide-repo-v1` and `kiro-cli-repo-v1`: native always/files/manual/auto, shared `.kiro/skills` destination with separate identities. CLI profile intends V3; legacy/custom-agent configurations remain unsupported.
- Claude shared import, native paths metadata and Kiro inclusion/fileMatch/auto metadata match renderer tests. All labels describe mappings, not verified harness enforcement.
- Unknown/advanced frontmatter controls and `agents/openai.yaml` are rejected, not stripped. Exact adaptations retain diagnostics; stale or shared-scope-incompatible adaptations fail.
- Fifteen target subsets cover all seven family subsets plus separate/both Kiro surfaces. Identical Kiro bytes coalesce; incompatible restrictions fail. Nested/global settings and pattern equivalence remain certification qualifications.

## Executed verification

On macOS, Node 24.18.0, npm 11.16.0, Vitest 5.0.3:

```sh
export PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH
npm test -- tests/unit/compiler tests/unit/adapters
```

Exit 0: four test files, **31 tests passed**. Compiler cases include all 15 target subsets, shared baseline scope, restricted rules/skills, exact and stale adaptations, duplicate skill rejection, deterministic permutations and both-Kiro composition. Renderer cases include full skill bytes/modes, unsupported modes, Claude paths/import metadata and all Kiro mode metadata with identical IDE/CLI bytes.

[TASK-004](TASK-004.md) retains parser/validation evidence for controls, references and binary/mode preservation. [TASK-015](TASK-015.md), [core inventory](../../examples/verification.json) and [installed command record](../../examples/cli-verification.json) establish generated-tree and local CLI evidence. They do not establish harness loading. Competitor execution belongs to [TASK-001](TASK-001.md); no competitor was applied to this checkout.

Final formatting, JavaScript syntax, planning consistency and relative Markdown links are checked alongside TASK-015. No shared ledger, profile implementation, release/bootstrap records, dist output or vendor settings were edited.

## Explicit gaps

No exact installed Codex/Claude/Kiro version, settings or native loaded-path log is available. Baseline/skills discovery, matching/nonmatching native glob behavior, dotfiles/case semantics, manual/auto activation and shadow behavior remain live-runtime unverified. Linux/Windows and actual process-death/PID-reuse/power-loss recovery are unverified. The follow-up checklist requires reproducible native observations before profile labels can change; an LLM claim is insufficient.
