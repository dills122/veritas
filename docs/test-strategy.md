# Veritas acceptance and verification strategy

Tests establish compiler behavior and file safety from observable contracts. A snapshot is useful only with semantic assertions about consumers, capabilities, hashes, and ownership. Runtime compatibility has a separate evidence standard. The original planning snapshot had no product test execution; live evidence now follows the task ledger. The accepted RC timebox uses representative safety cases and macOS Node 24; exhaustive permutations and external certification are follow-up.

## Implemented scripts

| Command | Intended contract |
| --- | --- |
| npm ci | Reproduce exact dependencies from package-lock.json |
| npm run lint | ESLint on retained TypeScript and scripts in scope |
| npm run format:check | Prettier check on owned supported files; exclude preserved original design and machine links |
| npm run typecheck | Strict compile without emission |
| npm test | Vitest unit/fixture suites; forwards test path filters |
| npm run test:integration | Temporary-repository integration tests; forwards path filters |
| npm run build | Emit executable ESM CLI and core declarations |
| npm run test:package | Pack and install into a clean temp consumer; check CLI/core independently of source tree |
| npm run verify | lint, format:check, typecheck, unit/integration suites and build; fail on required suite failures |

Package tests follow build. Do not treat no tests found or swallowed CLI failures as success. Optional live harness suites must report visible skip reasons and stay outside mandatory offline suite results. Any path filter named in a task refers to the meaningful suite that task must create.

## Requirement traceability

| Requirement | Implementing tasks | Verification family | Evidence status |
| --- | --- | --- | --- |
| REQ-001 | TASK-003, TASK-004, TASK-009, TASK-012 | Strict config/library selection, identity conflicts, local profile unions | Executed: TASK-003/004/009/012 |
| REQ-002 | TASK-005, TASK-012, TASK-013 | Fixed local snapshots, Git object pinning, moved refs, verified offline cache | Executed: TASK-005/012/013; live transport unverified |
| REQ-003 | TASK-004, TASK-006, TASK-007, TASK-008 | Standard package validation, byte assets, executable modes, references | Executed: TASK-004/006/007/008 |
| REQ-004 | TASK-001, TASK-003, TASK-006, TASK-007, TASK-008, TASK-009, TASK-016 | Capability/adaptation controls and native metadata fixtures | Executed: TASK-001/003/006/007/008/009/016; harness certification deferred |
| REQ-005 | TASK-001, TASK-009, TASK-010, TASK-016 | All target family subsets, restricted consumers, shadow and duplicate routes | Executed: TASK-001/009/010/016 |
| REQ-006 | TASK-003, TASK-004, TASK-005, TASK-009, TASK-010 | Randomized order, stable bytes/modes/hashes/JSON and manifest | Executed: TASK-003/005/009/010 |
| REQ-007 | TASK-010, TASK-011, TASK-012 | Ownership truth table, user edits, identical unmanaged files, malformed manifest | Executed: TASK-010/011/012 |
| REQ-008 | TASK-011, TASK-012 | Cooperative concurrency, representative interruptions, restartable rollback and cleanup | Executed: TASK-011/012; exhaustive crash permutations deferred |
| REQ-009 | TASK-005, TASK-010, TASK-012, TASK-013 | Read-only observation, no source/cache creation | Executed: TASK-005/010/012/013 |
| REQ-010 | TASK-005, TASK-012, TASK-013 | Update changes lock only; restore preserves pin; source/profile mismatch | Executed: TASK-005/012/013 |
| REQ-011 | TASK-003, TASK-010, TASK-012, TASK-015 | JSON schema, stderr discipline, precise codes/locations and exit precedence | Executed: TASK-003/010/012/015; [audit follow-up](evidence/end-user-audit-fixes.md) verifies help, human summaries and refused-plan diagnostics |
| REQ-012 | TASK-003, TASK-004, TASK-005, TASK-010, TASK-011, TASK-013 | Path/symlink/hardlink/control attacks, forged journals, resource limits, execution canaries | Executed: TASK-003/004/005/010/011/013 |
| REQ-013 | TASK-002, TASK-014 | Clean package consumer, Node 24 macOS; CI recipe retained | Executed: TASK-002; TASK-014 completed; [audit follow-up](evidence/end-user-audit-fixes.md) verifies installed documentation and public declarations |
| REQ-014 | TASK-001, TASK-008, TASK-016 | Versioned profile records and qualified loading gaps | Executed: TASK-001/008/016; all live harnesses unverified |
| REQ-015 | TASK-012, TASK-015 | Runnable docs/examples, collision inventory, local edit/update/recovery workflow | Executed: TASK-012/015; [audit follow-up](evidence/end-user-audit-fixes.md) verifies packaged examples and baseline-first adaptation setup |

TASK-017 integrates and reviews evidence for all requirements. The ledger's evidence paths reference exact results, rather than duplicating pass/fail claims in several narrative files. Update this table's evidence status only after recorded execution.

## Semantic fixtures

Create a small valid library and project, then vary one dimension per fixture: activation mode; target subset; restricted consumer; accepted/stale adaptation; package identity; binary asset; mode; local addition; unsafe path; and malformed metadata. Expected output lists contain exact paths, bytes, consumers, compatibility result and diagnostics. Test repeated compilation under shuffled discovery order. Negative fixtures must assert both the diagnostic and absence of output writes.

Snapshot updates are not self-approval: owners explain which governing contract changed, and the lead checks loading assertions. All fifteen nonempty subsets of the four selected target profiles have compiler route fixtures. Edge patterns must have matching and nonmatching examples, including dotfiles, root versus nested files, and case variants. A documentation-supported mapping without equivalent fixture semantics remains unsupported for that case.

## Filesystem failure matrix

The extended hardening campaign should exercise interruption before and after: lock creation, staging, backups, journal persistence, each output creation/replacement/deletion, manifest rename, journal cleanup, and lock release. Add init config/lock and update lock boundaries. Recover once, recover again, and inject interruption during recovery. Confirm original files are restored before the commit point; after commit, only validated cleanup occurs. Hash every managed and unmanaged file before/after, including executable intent.

Test an external edit after interruption, an ancestor changed to symlink, a stale lock with an unverifiable process, a malformed journal, a malicious path in an otherwise valid manifest, and an unlisted file under a stale skill directory. These cases must preserve owner data and leave actionable diagnostics. For follow-up, add actual concurrent child-process contention; the RC uses concurrent lease/API invocations plus a spawned CLI denied by an existing lease. use deterministic injected hooks for interruption, not timing races or sleeps. Do not claim protection against arbitrary malicious processes racing all filesystem system calls.

## Source and execution isolation

Use local bare Git repositories for most source tests, avoiding network credentials. Move a branch and a tag after locking and prove normal check/sync never move pins. Corrupt one cached byte and require an integrity error. Restore a locked commit and prove lock bytes remain identical. Test missing Git, transport failure, unsupported submodules/LFS pointers, invalid tree modes and option-like refs using injected argv capture where appropriate.

Put canary scripts and hooks in selected packages/source repositories; validation and generation must not execute them. Read-only tests compare the entire project tree before/after and assert no transport or cache mutation calls. The root of this development checkout is never a generated output fixture.

## Certification and release

The initial RC must be verified on macOS Node 24. Retain a CI recipe for later Linux/macOS/Windows runs, but Linux/Windows runtime certification is follow-up. POSIX tests enforce 0644/0755 behavior; Windows tests assert logical executable intent without inventing chmod capability. Symlink privileges or unavailable harnesses are recorded explicitly; mandatory path safety coverage cannot vanish through an unexplained skip.

Live harness evidence records exact versions/settings and inspection/log results for loaded artifacts, rather than simply asking the model to summarize instructions. No script in a skill is executed during discovery certification. Missing access keeps that profile documentation-based, with a visible release limitation.

Before a local release candidate is complete, execute clean install, full verify, package-consumer tests, runnable docs/examples, and integrated failure recovery. Record CI outcomes or an explicit external CI limitation. Obtain fresh-context review of retained code and the plan, fix actionable findings, and rerun only affected checks before the final integration gate.

## Evidence record format

Each `docs/evidence/TASK-NNN.md` includes retained code identity (commit SHA or clearly described uncommitted diff), requirements, environment/tool versions, exact commands, exit results, semantic findings, review status, skipped/unavailable checks, and next action. A log path alone is insufficient if it will not survive the handoff; retain a compact meaningful excerpt or stable CI URL. Secrets and credentials never enter evidence.

## Accepted candidate closure

All 15 requirements are accepted within the specification's bounded local macOS RC scope, backed by completed TASK-001–017 evidence and the final independent Ready verdict. Original candidate verification passed 167 unit and 81 integration tests plus installed consumer/declaration checks, 42 CLI walkthrough commands and 8 core example checks; its source/archive identities remain in [TASK-017](evidence/TASK-017.md). The subsequent [audit follow-up](evidence/end-user-audit-fixes.md) passed 167 unit and 84 integration tests, installed consumer/declaration checks, 47 CLI walkthrough commands and 54 additional installed-consumer checks against a separate local archive. Live harness/platform and exhaustive hardening items remain explicit follow-up, not certified acceptance claims.
