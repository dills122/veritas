# Independent review 2

Review instance: 2 of 3. Read-only working-tree review of the unborn `feature/veritas-v01` branch, independently initiated without author history. The three source/CLI remediations and their surrounding contracts are the bounded target. The bootstrap was read first. This instance resumed after an intentional interruption; its blind pass was retained.

## Preliminary review recorded before author explanation

The canonical specification, technical design, decisions, implementation plan, ledger, steering, source/CLI/planner code and regression tests were inspected before review-1 or author-explanation. Source-root containment, canonical executable configuration rejection and init inventory appear implemented. Reviewer verification passes: typecheck, 164 unit tests, 81 integration tests. All 109 entries in rc-source-inventory.json match actual source bytes and executable intent.

One P2 concern is independently reproduced: `src/validation/packages.ts:46` counts the file name as a directory level. A safe file at 16 directory levels is accepted by local/Git/cache source logic but rejected by parseLibrary with LIMIT_EXCEEDED. The governing design allows 16 directory levels. No P0/P1 defect was identified in the bounded remediation pass. A final verdict follows author-claim reconciliation below.

## Findings

**P2 — Count directory levels consistently at the package-validation boundary.**

Evidence: `src/validation/packages.ts:45–50` rejects `segments.length > LIMITS.depth`; `docs/technical-design.md:65` allows **16 directory levels**. `src/sources/snapshot.ts:197` and `:277`, and `src/sources/git.ts:173` correctly subtract the filename for ordinary files. `tests/unit/sources/local/local.test.ts:150` explicitly accepts a file at the maximum directory depth, whereas `tests/unit/validation/packages.test.ts:99–116` codifies a total-segment limit.

Failing scenario: a valid library contains an ordinary asset at `d0/d1/d2/d3/d4/d5/d6/d7/d8/d9/d10/d11/d12/d13/d14/d15/data.bin`. Source snapshot creation accepts it, but `parseLibrary` immediately fails `LIMIT_EXCEEDED`, message `Path exceeds 16 segments`, even if that file is not selected. This contradicts the documented resource boundary and means a library accepted by the source API cannot complete init/validate. REQ-003/012 and TASK-004/005 are affected. This is a bounded off-by-one behavior defect, not data loss or a scope expansion.

Smallest correction: measure `segments.length - 1` for snapshot files, change the diagnostic to directory levels, and make the validator regression accept 16 directories and reject 17. Keep local, Git, cache, and parser definitions aligned. No new feature or architectural pivot is needed.

Reproduction executed with Node 24 against the existing built core: construct a valid `veritas.library.yaml` and always-on `baseline.md`, append the path above with ordinary bytes/executable false, calculate `treeDigest(files)`, then call `parseLibrary({files, treeDigest}, 'company', 'baseline')`. Result: `ok:false` with the exact diagnostic above. Existing local-source boundary test independently passed in the reviewer unit run. No product files were changed.

The three previously reported P2 defects are resolved:

- Contained upstreams reject in `resolveSource` before source snapshot/cache/control writes. CLI regressions cover both `.` and `..`; sibling library and live-overlay workflows continue to pass. The local overlay `.` case is rejected by strict relative-path schema before controls are committed.
- Canonical executable manifest rejection is shared through `isExecutableConfiguration` in traversal and supplied-snapshot validation. The local, cache, and Git regression paths all pass; executable skill assets remain supported.
- Init performs a separate inventory with an empty ownership set, so desired unmanaged guidance appears as well as additional guidance. It returns full generation preview conflicts and shadow severities while writing only controls/cache. The regression observes existing root, override, and nested guidance; later sync returns exit 3 and user bytes remain intact.

No other actionable P0/P1/P2 finding was identified in this bounded remediation review. This statement is not an exhaustive security or platform audit.

## Plan Review

The specification, technical design, decisions and TASK-001–017 graph remain coherent for the accepted macOS local RC. The source/parser/compiler/adapters/planner/writer ownership boundaries match the inspected implementation. Compilation precedes managed output planning; source resolution is explicit; read-only commands use immutable snapshots; unsupported controls and combined-target exposure fail. Transaction recovery retains before/after state and validates backups before restoration. These properties have meaningful assertions in the retained suites rather than only snapshot-count checks.

The remaining depth defect is within the existing resource-limit contract and needs no plan pivot. TASK-017 correctly remains incomplete pending independent review disposition. Final ledger, test-strategy, release checklist and stop-checkpoint narrative need the lead's authorized closure update after remediation; these concurrently finalized documents are not counted as completed here. Original six-hour stop remains historical; the initiating task records explicit user authorization to finish bounded review/remediation/closure.

Accepted exclusions remain explicit: live harness loading, live remote HTTPS/SSH authentication, Linux/Windows, automatic stale-lock removal, exhaustive process-death/power-loss/hostile-race testing and registry/Git publication. They do not conceal the depth-contract defect.

## Author-Claim Reconciliation

| Author claim | Evidence inspected | Status | Review consequence |
| --- | --- | --- | --- |
| Local upstream equal to/ancestor of consumer now rejects before cache/control writes | `src/cli/pipeline.ts:201–229`; containment CLI regressions | Confirmed | Review-1 containment finding resolved; prevents runtime self-snapshot in supported physical paths |
| Project-root overlay already schema-rejected, now covered | `src/config/schemas.ts:130–132`; CLI overlay regression | Confirmed | No implicit project-root overlay snapshot |
| Shared executable predicate covers canonical local/cache/Git manifest | `src/sources/snapshot.ts:237–244`, `:285`; `git.ts:428`; three source regressions | Confirmed | Review-1 executable-config finding resolved; normal script intent preserved |
| Init inventories all guidance and exposes preview conflicts without guidance writes | `src/cli/run.ts:170–215`; `src/sync/plan.ts:35–137`; init inventory regression | Confirmed | Review-1 inventory finding resolved; successful control init accurately reports blocked generation |
| Routine regeneration is pinned and read-only; update/restore is explicit | `loadCompilation`, cache loader, `update`; cache/CLI/Git tests | Confirmed | Immutable/offline behavior retained |
| Full file ownership and safe representative recovery | Planner ownership table implementation, apply/recover and transaction assertions | Confirmed within bounded suite | No implicit adoption or external-edit rollback observed; exhaustive hostile races remain excluded |
| Complete resource-limit validation and usable package processing | Source/package boundary checks and reviewer reproduction | Contradicted at maximum depth | One actionable P2 correction remains |
| Current integrated package and 42-command installed walkthrough pass | Retained TASK-017, TASK-014 and example verification records | Recorded evidence inspected; not reviewer-reexecuted | No new build/package run was attempted; lead results remain distinct from reviewer checks |
| Harness support is documentation/fixture evidence, not live certification | Profiles, specification, decisions, test strategy and author gaps | Confirmed | No runtime-certified claim inferred |

The author packet's earlier 156/52 counts describe preparation-time results. They do not contradict the later reviewer-observed 164/81 results. The packet is treated as testimony, not approval.

## Verification Performed

Environment: Node 24.18.0 selected explicitly with `PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH`. Serena initial instructions read; project already activated. Codebase-memory project/index readiness checked before structural exploration; graph generation `2026-10-10T07:09:04Z`. Relevant cited-path coverage reports had no recorded issue and metadata matches; graph results remain best-effort. Direct source reads supplied the truncated compiler tail and all material boundary decisions. No completeness claim relies on graph absence.

Reviewer-executed commands:

- `PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck`: exit 0.
- `PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH npm test`: exit 0; 11 test files, 164 tests passed.
- `PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH npx vitest run --config vitest.integration.config.ts`: exit 0; 6 test files, 81 tests passed. This direct command used current dist and did not build it.
- `python3 scripts/check-planning.py`: exit 0; 15 requirements, 12 decisions, 17 acyclic work items, ownership/traceability/index/local links verified.
- Node 24 source-inventory verification: all 109 frozen entries match actual SHA-256 bytes and executable intent, zero changed entries.
- Node 24 in-memory depth reproduction against `dist/index.js`: successfully executed, observing `parseLibrary` reject a valid 16-directory-level file with LIMIT_EXCEEDED.
- Git status/base inspection: unborn `feature/veritas-v01`; retained files untracked; HEAD does not exist, as declared by bootstrap.

No clean build, package installation, source edit, staging, commit, publication, additional stream or review instance was performed. The only repository write by this reviewer is this exclusively owned report.

## Open Questions And Residual Risks

The P2 maximum-depth rejection is the only concrete unresolved implementation finding. Final task/evidence status must be reconciled after its disposition. Live authentication/harness/platform and exhaustive failure exclusions remain unverified exactly as declared; this review provides no additional certification for them. The scope is an uncommitted working tree with frozen inventory rather than a commit diff.

## Verdict

**Not ready** for final requirement closure until the single bounded P2 depth-contract defect is corrected and affected checks pass. The three review-1 remediations are accepted. No architectural pivot is warranted. This verdict preserves a small failing documented acceptance boundary despite green existing suites; it does not request expanding the RC exclusions.

## Recommended Next Actions

1. Lead accepts or disputes the depth finding with concrete evidence. Correct the directory-count boundary and regression if accepted.
2. Rerun affected package/source unit tests and typecheck; refresh source inventory and package evidence if retained bytes change.
3. Reconcile TASK-017, requirement evidence, release checklist and final handoff. A material parser-boundary correction may receive the final bounded independent pass, instance 3 of 3; this reviewer starts no new instance.

## Lead Disposition At Report Return

The lead accepted the P2 finding and reported a new skill-boundary regression: linked binary assets at 15/16/17 directory levels; 15 passes, 16 fails before the correction, and 17 rejects. That regression was added after this review's frozen-inventory verification. Product source remained unchanged when this report was returned; therefore the 109-file inventory match above refers to the reviewed frozen boundary before the new regression, not a claim that the newly edited test still matches the old inventory. The lead owns the bounded correction and final instance 3 of 3. This report's verdict remains **Not ready** pending that correction and affected verification.
