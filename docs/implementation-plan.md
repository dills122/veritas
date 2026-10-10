# Veritas implementation plan

Implement the product in independently verifiable slices, with shared contracts frozen before parallel writers begin. The outcome is a safe local release candidate with honest compatibility evidence. Publishing and external deployment are separate actions. The accepted 4–6-hour RC boundary is in [Orchestration schedule](orchestration-plan.md).

The task ledger is [work-items.json](work-items.json). The initial planning snapshot had every item pending; execution now follows the live ledger and the bounded RC schedule. P0 establishes semantic correctness and write safety; P1 completes portability, user workflows, and evidence required for a release candidate. Sizes are relative complexity estimates: M is bounded, L crosses interfaces, and XL needs substantial failure-state coverage. They are not elapsed-time promises.

## Execution waves

- Wave 0: run TASK-001 research and TASK-002 scaffold independently. TASK-001 confirms or revises the standalone decision; scaffold work must remain reusable if that decision changes.
- Wave 1: the lead owns TASK-003 and freezes schemas, model, profile records, adapter contract, and fixture interfaces.
- Wave 2: parsing, local sources, the three adapter owners, and ownership planning are independent lanes. With four agent slots, the lead dispatches at most three writers at once; queue other ready items. There is no requirement to finish every wave-2 item before starting an independently ready descendant.
- Wave 3: compiler composition and journaled sync run independently after their own prerequisites. The writer is the critical risk and receives failure injection before CLI integration.
- Wave 4: local CLI integration and Git transport can run in parallel because the Git owner does not own CLI files. The lead wires Git into the integrated CLI after both are verified.
- Wave 5: the lead owns packaging/CI; examples and user docs can proceed in another lane.
- Wave 6: audit documentation and fixture compatibility labels; live harness certification is follow-up.
- Wave 7: reconcile the integrated implementation, conduct fresh-context review, and close requirements with evidence.

The main dependency path is contracts -> ownership planner -> recoverable writer -> CLI -> portability/docs -> compatibility evidence -> review. Compiler/parsing work is another prerequisite to CLI, so the lead must watch both paths. Advance ready independent work while a task is blocked; never ignore a failed dependency.

## Task index

<!-- task-index:start -->
| Task | Priority | Wave | Dependencies | Delivery unit | Size | Status |
| --- | --- | --- | --- | --- | --- | --- |
| TASK-001 Compatibility fixtures and build versus reuse decision | P0 | 0 | None | research | M | completed |
| TASK-002 Package scaffold and real verification commands | P0 | 0 | None | internal-subagent | M | completed |
| TASK-003 Freeze schemas normalized model and profile contracts | P0 | 1 | TASK-001, TASK-002 | lead | L | completed |
| TASK-004 Parse and validate canonical steering and complete skill packages | P0 | 2 | TASK-003 | internal-subagent | L | completed |
| TASK-005 Local immutable snapshots and verified source cache | P0 | 2 | TASK-003 | internal-subagent | M | completed |
| TASK-006 Codex pure adapter | P0 | 2 | TASK-003 | internal-subagent | M | completed |
| TASK-007 Claude pure adapter | P0 | 2 | TASK-003 | internal-subagent | M | completed |
| TASK-008 Kiro IDE and CLI pure adapter profiles | P0 | 2 | TASK-003 | internal-subagent | M | completed |
| TASK-009 Compiler selection and combined target loading analysis | P0 | 3 | TASK-004, TASK-005, TASK-006, TASK-007, TASK-008 | internal-subagent | L | completed |
| TASK-010 Ownership observation drift comparison and full write planning | P0 | 2 | TASK-003 | internal-subagent | L | completed |
| TASK-011 Lock journal writer and restartable recovery | P0 | 3 | TASK-010 | internal-subagent | L | completed |
| TASK-012 Local CLI vertical slice and JSON exit contracts | P0 | 4 | TASK-009, TASK-011 | lead | L | completed |
| TASK-013 Git pinning offline restore and intentional update | P0 | 4 | TASK-005 | internal-subagent | L | completed |
| TASK-014 Package and verify the initial macOS release candidate | P1 | 5 | TASK-012, TASK-013 | lead | M | completed |
| TASK-015 Examples authoring adoption and operator documentation | P1 | 5 | TASK-012, TASK-013 | internal-subagent | M | completed |
| TASK-016 Audit documentation-based compatibility labels | P1 | 6 | TASK-014, TASK-015 | internal-subagent | M | completed |
| TASK-017 Integrated review traceability and release candidate closure | P1 | 7 | TASK-014, TASK-015, TASK-016 | lead | L | completed |
<!-- task-index:end -->

## Work item packets

### TASK-001 Compatibility fixtures and build versus reuse decision

A versioned fixture catalogue and one bounded empirical comparison of pinned Rulesync and Ruler versions; confirmed or revised DEC-002.

Requirements: REQ-004, REQ-005, REQ-014. Decisions: DEC-002, DEC-005, DEC-010. Task budget: 30 minutes before reassessment.

Owned paths: `tests/fixtures/compatibility/`, `docs/research/build-vs-reuse.md`. Preserve other owners' work.

Acceptance:

- Represent always/files/manual/auto rules, complete skills, restricted controls, shared loading, unmanaged and edited files.
- Within 30 minutes, record exact revisions, representative always/files/skill commands, deterministic deltas and edited-file behavior in disposable repos. Catalog other cases without indefinite investigation.
- Compare deterministic pure API reuse and licensing against ownership/pinning/recovery needs. Never infer absence from README features.
- Confirm standalone baseline or revise contracts and tasks before TASK-003; record unavailable network/tool execution as a decision limitation.

Verification: Recorded competitor commands and output hashes in docs/research/build-vs-reuse.md; `python3 scripts/check-planning.py`.

Gate: DEC-002 must be explicitly resolved before broad compiler implementation.

### TASK-002 Package scaffold and real verification commands

A strict ESM npm package with clean build/test/lint/typecheck scripts and an executable version/help skeleton.

Requirements: REQ-013. Decisions: DEC-001. Task budget: 40 minutes before reassessment.

Owned paths: `package.json`, `package-lock.json`, `tsconfig*.json`, `eslint.config.*`, `.prettier*`, `vitest.config.*`, `src/bin.ts`, `src/index.ts`, `tests/package/`, `scripts/`. Preserve other owners' work.

Acceptance:

- Select Node 24, inspect current dependency APIs, pin compatible versions and retain a reproducible npm lock.
- Define all planned scripts, including verify and test:package; a core import has no CLI/FS side effects.
- Run a clean npm ci/build and install the packed CLI into a temporary consumer; verify help/version and declaration exports.
- Reject a vacuous green suite: record that only scaffold/package behavior is implemented; keep product requirements pending.

Verification: `npm ci`; `npm run verify`; `npm run test:package`.

### TASK-003 Freeze schemas normalized model and profile contracts

Strict version-1 schemas, normalized unions, adapter interface, deterministic serialization and hashes, profile capability records.

Requirements: REQ-001, REQ-004, REQ-006, REQ-011, REQ-012. Decisions: DEC-003, DEC-005, DEC-006, DEC-008, DEC-011. Task budget: 40 minutes before reassessment.

Owned paths: `src/model/`, `src/config/`, `src/adapters/profiles/`, `src/diagnostics/`, `tests/unit/config/`, `tests/unit/model/`, `docs/technical-design.md`, `docs/decisions.md`. Preserve other owners' work.

Acceptance:

- Model config/library/frontmatter/lock/manifest/journal tagged unions and command outcome envelopes; reject unknown fields and YAML alias/duplicate-key forms.
- Define source positions, outputVersion, consumers, executable intent, and exact adaptation validation.
- Test namespace/profile selection, duplicate IDs/skill names, path portability, bounded sizes and version mismatch.
- Publish contract fixtures for parallel owners; lead alone changes shared contracts afterward.

Verification: `npm test -- tests/unit/config tests/unit/model`; `npm run typecheck`; `npm run lint`.

### TASK-004 Parse and validate canonical steering and complete skill packages

Canonical packages with precise errors, preserved bodies/assets, safe references and validated selection.

Requirements: REQ-001, REQ-003, REQ-006, REQ-012. Decisions: DEC-003, DEC-009, DEC-011. Task budget: 60 minutes before reassessment.

Owned paths: `src/parsing/`, `src/validation/`, `tests/unit/parsing/`, `tests/unit/validation/`, `tests/fixtures/packages/`. Preserve other owners' work.

Acceptance:

- Test frontmatter boundaries, code fences/BOM policy, CRLF normalization, UTF-8 errors and duplicate metadata.
- Validate standard skill name/directory identity, licenses, parsed relative links, binary assets and executable intent.
- Reject unsafe package entries, reserved native imports in canonical steering, unknown controls, traversal and size/depth excess.
- Separate activation-pattern semantics from source discovery; unmatched future-file patterns remain visible warnings.

Verification: `npm test -- tests/unit/parsing tests/unit/validation`; `npm run typecheck`.

### TASK-005 Local immutable snapshots and verified source cache

Content-addressed local upstream snapshots and a live project-overlay reader with integrity checks.

Requirements: REQ-002, REQ-006, REQ-009, REQ-010, REQ-012. Decisions: DEC-006, DEC-011, DEC-012. Task budget: 45 minutes before reassessment.

Owned paths: `src/sources/local.ts`, `src/sources/cache.ts`, `src/sources/snapshot.ts`, `tests/unit/sources/local/`, `tests/integration/local-source/`. Preserve other owners' work.

Acceptance:

- Pin local upstream bytes independently of subsequent directory edits; overlay edits change effective input digest without repinning upstream.
- Tree digest is stable across traversal order and extraction umask; reject symlinks/hardlinks and unsafe file types.
- Cache corruption/miss fails read-only commands, which perform no writes or source refresh.
- Exact local restore succeeds only for the locked digest; changed local source requires intentional update.

Verification: `npm test -- tests/unit/sources/local`; `npm run test:integration -- tests/integration/local-source`.

### TASK-006 Codex pure adapter

Pure rendering of a compiler-selected AGENTS baseline and .agents skill packages.

Requirements: REQ-003, REQ-004, REQ-006. Decisions: DEC-005, DEC-008, DEC-009. Task budget: 35 minutes before reassessment.

Owned paths: `src/adapters/codex/`, `tests/unit/adapters/codex/`, `tests/fixtures/adapters/codex/`. Preserve other owners' work.

Acceptance:

- Render exact stable baseline bytes with provenance; preserve package assets and supported sidecars.
- Unsupported steering modes and unmapped restrictions yield structured errors; exact files-to-always adaptation remains labeled adapted.
- No nested AGENTS, override, implicit fetch, filesystem read/write or baseline selection inside the adapter.

Verification: `npm test -- tests/unit/adapters/codex`; `npm run typecheck`.

### TASK-007 Claude pure adapter

Pure CLAUDE import, native rules and skill rendering for the tested profile.

Requirements: REQ-003, REQ-004, REQ-006. Decisions: DEC-005, DEC-008, DEC-009. Task budget: 35 minutes before reassessment.

Owned paths: `src/adapters/claude/`, `tests/unit/adapters/claude/`, `tests/fixtures/adapters/claude/`. Preserve other owners' work.

Acceptance:

- Shared baseline is imported once; native rules exclude duplicate shared text.
- Paths metadata round-trips for supported patterns; malformed/unsupported metadata never becomes unconditional content.
- Manual/auto steering and unsupported skill restrictions fail; supported typed native controls have explicit fixtures.

Verification: `npm test -- tests/unit/adapters/claude`; `npm run typecheck`.

### TASK-008 Kiro IDE and CLI pure adapter profiles

Pure always/fileMatch/manual/auto steering and native skills, with separate surface identities.

Requirements: REQ-003, REQ-004, REQ-006, REQ-014. Decisions: DEC-005, DEC-008, DEC-010. Task budget: 35 minutes before reassessment.

Owned paths: `src/adapters/kiro/`, `tests/unit/adapters/kiro/`, `tests/fixtures/adapters/kiro/`. Preserve other owners' work.

Acceptance:

- Auto emits required name/description; fileMatch arrays and manual discovery metadata have fixtures.
- Shared baseline is not duplicated; both surface profiles can coalesce only identical bytes and compatible loading declarations.
- Unsupported release/surface/controls fail honestly; no custom-agent resources or CLI argument templating generated in v0.1.

Verification: `npm test -- tests/unit/adapters/kiro`; `npm run typecheck`.

### TASK-009 Compiler selection and combined target loading analysis

A deterministic compile API with per-rule compatibility and validated loading routes for the whole selected target set.

Requirements: REQ-001, REQ-004, REQ-005, REQ-006. Decisions: DEC-003, DEC-005, DEC-008. Task budget: 50 minutes before reassessment.

Owned paths: `src/compiler/`, `tests/unit/compiler/`, `tests/fixtures/compiler/`. Preserve other owners' work.

Acceptance:

- Test all family subsets plus both Kiro surfaces, restricted consumers, one baseline route, and shadowed root instruction files.
- Codex-only text beside an unintended AGENTS consumer fails before artifact creation.
- Detect case/path/output collisions and stale adaptation declarations; include stable accepted adaptations in identity.
- Repeated compilation yields identical bytes, diagnostics and manifest inputs under randomized input order.

Verification: `npm test -- tests/unit/compiler`; `npm run typecheck`.

### TASK-010 Ownership observation drift comparison and full write planning

A read-only complete operation plan with observed preconditions and deterministic manifest drift.

Requirements: REQ-005, REQ-006, REQ-007, REQ-009, REQ-011, REQ-012. Decisions: DEC-004, DEC-011, DEC-012. Task budget: 50 minutes before reassessment.

Owned paths: `src/sync/observe.ts`, `src/sync/plan.ts`, `src/sync/manifest.ts`, `tests/unit/sync/plan/`. Preserve other owners' work.

Acceptance:

- Cover every row of the ownership table; identical unmanaged files still conflict.
- Protect edited bytes/modes, malformed manifests, unsafe output kinds/ancestors, Git/control paths, and unlisted skill assets.
- Check detects missing outputs and manifest-only provenance drift; plan/check leave repository bytes unchanged.
- Inventory existing guidance with shadow errors versus qualification warnings; no implicit adoption or broad directory deletion.

Verification: `npm test -- tests/unit/sync/plan`; `npm run typecheck`.

### TASK-011 Lock journal writer and restartable recovery

Safe generated-output and config/lock transactions with exclusive locking and interruption recovery.

Requirements: REQ-007, REQ-008, REQ-012. Decisions: DEC-004, DEC-007, DEC-012. Task budget: 80 minutes before reassessment.

Owned paths: `src/sync/lock.ts`, `src/sync/journal.ts`, `src/sync/apply.ts`, `src/sync/recover.ts`, `src/sync/control.ts`, `tests/integration/sync/`. Preserve other owners' work.

Acceptance:

- Replan/recheck preconditions under the lock; never apply a conflict-free subset of a conflicted plan.
- Exercise representative failures before/after replacement, manifest commit and cleanup, plus repeated recovery and external-edit conflicts. Exhaustive permutations follow after RC.
- Concurrent mutators cannot interleave; nonce-safe release preserves another owner. Do not auto-remove stale locks in the RC.
- External edits after interruption block rollback; malformed or forged journals cannot expand allowed writes.
- Second sync preserves managed mtimes/bytes/modes/manifest; test init between config/lock writes and update commit boundaries.

Verification: `npm run test:integration -- tests/integration/sync`; `npm run typecheck`.

### TASK-012 Local CLI vertical slice and JSON exit contracts

End-to-end init/validate/plan/sync/check/update/recover against local libraries.

Requirements: REQ-001, REQ-002, REQ-004, REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, REQ-015. Decisions: DEC-004, DEC-006, DEC-007, DEC-012. Task budget: 60 minutes before reassessment.

Owned paths: `src/cli/`, `src/bin.ts`, `src/index.ts`, `tests/integration/cli/`. Preserve other owners' work.

Acceptance:

- A clean temp repo gets config/lock, always rule and full skill, then a no-op sync/check.
- Use stable stdout JSON envelopes and documented exit precedence; help/core import has no filesystem side effects.
- Read-only commands neither fetch nor create caches; local update changes lock but not outputs.
- CLI conflicts leave files intact, precise diagnostics identify sources and recovery is explicit.
- Export the reusable compile/plan APIs without importing bin side effects.

Verification: `npm run test:integration -- tests/integration/cli`; `npm run verify`; `npm run test:package`.

Gate: Local vertical slice must pass before claiming product readiness.

### TASK-013 Git pinning offline restore and intentional update

Pinned Git snapshots and exact restore, using injected transport behind the source contract.

Requirements: REQ-002, REQ-009, REQ-010, REQ-012. Decisions: DEC-006, DEC-009, DEC-012. Task budget: 50 minutes before reassessment.

Owned paths: `src/sources/git.ts`, `src/sources/git-runner.ts`, `tests/integration/git-source/`. Preserve other owners' work.

Acceptance:

- Use local bare Git fixtures for branch/tag/commit, moved refs, missing/auth errors, object modes, unsupported submodules/LFS and corrupt trees.
- Routine regeneration remains offline and unchanged after refs move; update reports new provenance without writing outputs.
- Git argv never invokes a shell; imported scripts/hooks/filters are not run by extraction; credential values never appear in diagnostics.
- Restore uses the locked commit/digest and leaves the lock unchanged; ensure cache is worktree-local.
- Lead wires the source provider into CLI after TASK-012 without changing the public command contract.

Verification: `npm run test:integration -- tests/integration/git-source`; `npm run typecheck`.

### TASK-014 Package and verify the initial macOS release candidate

Clean package consumer and Node 24 macOS verification; retain a portable CI recipe without claiming unexecuted OS results.

Requirements: REQ-013. Decisions: DEC-001, DEC-011. Task budget: 30 minutes before reassessment.

Owned paths: `package.json`, `package-lock.json`, `.github/workflows/`, `tests/package/`, `tests/integration/platform/`, `scripts/`. Preserve other owners' work.

Acceptance:

- Packed CLI runs outside the source checkout, imports core declarations, and includes only required runtime files.
- Exercise path collisions, executable mode semantics, locks, renames and Git on macOS; Linux/Windows certification is explicitly deferred.
- npm ci from the committed lock succeeds; real verify and package checks do not hide skipped product suites.
- Do not publish or create a remote/registry project as part of this task.

Verification: `npm ci`; `npm run verify`; `npm run test:package`; Recorded macOS Node 24 results; Linux/Windows follow-up gaps labeled.

### TASK-015 Examples authoring adoption and operator documentation

Runnable example library/project and user docs covering every supported command and conflict/recovery outcome.

Requirements: REQ-015, REQ-011. Decisions: DEC-003, DEC-004, DEC-007. Task budget: 30 minutes before reassessment.

Owned paths: `examples/`, `README.md`, `docs/usage.md`, `docs/recovery.md`, `docs/library-authoring.md`. Preserve other owners' work.

Acceptance:

- Test documented examples in temp copies; never sync into this repo root or its bootstrap guidance.
- Show local overlay editing, Git source updates, cache restore, unsupported steering and exact adaptation.
- Describe manual migration of existing files without auto-adoption/force overwrite and explain ownership manifest.
- Explain recovery after interruption and honest compatibility limits; validate copy-paste commands against built package.

Verification: `node examples/verify.mjs`; installed package walkthrough; `python3 scripts/check-planning.py`.

### TASK-016 Audit documentation-based compatibility labels

Versioned support matrix with compiler fixture evidence; live harness certification is follow-up.

Requirements: REQ-004, REQ-005, REQ-014. Decisions: DEC-005, DEC-010. Task budget: 15 minutes before reassessment.

Owned paths: `docs/research/compatibility.md`, `docs/compatibility.md`, `docs/evidence/harnesses/`, `tests/integration/harnesses/`. Preserve other owners' work.

Acceptance:

- Record profile/source references and fixture evidence for supported family combinations.
- Clearly label all live loading behavior unverified unless actual evidence is available.
- Unsupported or advanced controls fail instead of being stripped; retain follow-up certification checklist.

Verification: `npm test -- tests/unit/compiler tests/unit/adapters`; Review docs/compatibility.md against implemented profiles.

Gate: No runtime-certified claim without observed loading evidence; lack of access does not erase the gap.

### TASK-017 Integrated review traceability and release candidate closure

A reviewed local release candidate with requirement evidence, resolved regressions, and explicit certification/publication limits.

Requirements: REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-015. Decisions: DEC-001, DEC-002, DEC-003, DEC-004, DEC-005, DEC-006, DEC-007, DEC-008, DEC-009, DEC-010, DEC-011, DEC-012. Task budget: 40 minutes before reassessment.

Owned paths: `docs/work-items.json`, `docs/implementation-plan.md`, `docs/test-strategy.md`, `docs/evidence/`, `docs/release-checklist.md`, `docs/decisions.md`. Preserve other owners' work.

Acceptance:

- Fresh-context reviewer assesses retained code and implementation plan; fix actionable findings and rerun affected checks.
- Every requirement has executed test evidence; every task is complete or explicitly blocked/deferred with parent implications.
- Run clean install/full verify/package/examples and fault-recovery suite on integrated state; record exact SHA/diff identity or uncommitted state.
- No publication, push, merge or live certification claims without actual authorization/evidence; final handoff states completed/blocked/deferred accurately.

Verification: `npm ci`; `npm run verify`; `npm run test:package`; `python3 scripts/check-planning.py`; `python3 scripts/verify-bootstrap.py`; serena memories check; Fresh-context review and recorded CI evidence.

## Integration and task completion

Each owner returns changed paths, exact verification and outcomes, requirement/decision links, limitations, blockers, and the integration destination. The lead verifies the retained diff, reconciles contract changes, and updates the ledger plus generated task index. Store task evidence as `docs/evidence/TASK-NNN.md`; status alone is not evidence. After ledger edits, run `python3 scripts/check-planning.py --render-index` to refresh the task table and validate the plan.

Allowed states are pending, in_progress, blocked, completed, and deferred. A completed task requires a nonempty evidence list pointing to existing files. Blocked tasks retain the concrete dependency/access gap and permit unrelated work. Deferred requirements need an explicit scope/decision change, never just a skipped test. The release lead cannot mark the parent complete while required P0/P1 work lacks evidence.

If a task discovers an invalid contract, pause its dependent lane and send the lead a minimal repro and proposed contract change. The lead updates governing docs and shared schemas before resuming. No owner silently broadens scope, drops restrictions, weakens conflict protection, or changes another owner's files.

## Verification gates

The first gate resolves build versus reuse. The contract gate stabilizes schema and fixture interfaces. The vertical-slice gate demonstrates local init through recovery with no-op sync and protected edited files. The Git gate proves fixed pins, explicit update, cache integrity, and offline regeneration. The release gate needs clean package/CI results, documented examples, traceability, fresh review, and truthful harness evidence.

Tests and generation operate in temporary repositories. The bootstrap AGENTS/skills/steering in this checkout are user-owned inputs for development; do not make them a sync destination for tests or demonstrations.
