# Veritas design review

The original proposal has the right product boundary: reproducible compilation and safe synchronization of agent guidance, with explicit compatibility reporting. The highest implementation risk is the interaction between harness loading, managed-file ownership, and interrupted filesystem changes. Establish those contracts before building the CLI surface.

## High level assessment

| Area | Assessment | Required refinement |
| --- | --- | --- |
| Product promise | Clear and differentiated | Measure artifact reproducibility and loss reporting; avoid promising identical model behavior |
| MVP scope | Appropriately small | Keep one upstream plus local additions; exclude migration automation and Codex overrides from v0.1 |
| Compiler architecture | Sound separation of pure adapters and effects | Add a combined-target loading graph and typed ownership plan |
| Skills portability | Correct use of the standard package format | Define asset paths, reference validation, executable bits, and target-specific restrictions |
| Source pinning | Correct lockfile direction | Define local-source snapshots, cache integrity, offline misses, and compiler-profile mismatch |
| Sync safety | Necessary MVP capability | Specify journal recovery, missing-file policy, concurrency, and corrupt manifest behavior |
| Adoption | Existing files identified as a risk | Use explicit conflicts and manual migration; no identical-content takeover |
| Release sequence | Fixture-first is appropriate | Move locking and safe sync earlier; defer broad harness certification until compiler contracts stabilize |
| Existing tools | Correctly flags overlap | Compare fixed tool versions against the same adversarial fixtures before broad implementation |

## Decisions added by the deep review

1. Treat native compatibility as a versioned artifact/loading contract. Keep actual model behavior outside the guarantee.
2. Do not emit a shared AGENTS baseline containing target-restricted text. Model every selected consumer of each artifact before choosing its location.
3. Use exact source IDs in profiles rather than an inheritance or glob-selection language in v0.1. File scanning is deterministic and separate from activation patterns.
4. Pin an upstream local directory by content snapshot, just as a Git source is pinned by commit. Local project additions remain live, with their digest included in the effective input identity.
5. A missing managed file can be recreated, but a file scheduled for deletion or replacement must either be missing or match its recorded bytes and mode. Unexpected content remains a conflict.
6. A write plan uses observed preconditions, and sync rebuilds it under a repository-local lock. Saved human plan output does not authorize blindly replaying stale writes.
7. Use a recoverable journal with backups and a manifest commit point. Individual renames are atomic on supported filesystems; the batch is not a transaction.
8. Reject unknown schemas, malformed metadata, target-incompatible restrictions, unsafe paths, and profile/version mismatches before writing.
9. Repeated sync must be a true no-op for managed files and manifest. Runtime caches and journal cleanup are separate machine state.
10. Public release requires clean package-consumer tests and truthful certification labels, rather than only compiler snapshots.

## Deliberate changes to the proposal

The proposed isolated `AGENTS.override.md` adaptation is deferred. It increases same-checkout complexity and makes loss acceptance harder to explain. v0.1 permits only a per-rule, per-target explicit always-on adaptation of file-scoped guidance, where all selected consumers can safely receive it. Manual or automatic steering is not silently converted into skills.

The generic `compatibility.onLossy` policy is refined into strict defaults plus exact adaptation declarations. A blanket warning mode would make unintended scope changes too easy. Restrictions affecting tool execution remain hard errors on targets without equivalent controls.

Raw target file passthrough, automatic imports, managed blocks, and implicit source execution remain outside scope. Typed skill extensions may be supported only for documented controls with fixtures; unknown or unimplemented controls fail clearly.

The first comparison is a bounded build-versus-reuse gate, not an open-ended investigation. A standalone compiler is the planning baseline. TASK-001 must record observed capabilities before confirming that baseline or revising it.

## Remaining release questions

Exact harness versions and surfaces must be captured by TASK-001 and TASK-013. Kiro IDE and CLI are separate profile identities even if fixture outputs coincide. Installed credentials, paid harness availability, package-name ownership, and publication permission are external release inputs; their absence must not stop local compiler and synchronization work.

Deployment assumes an ordinary local repository filesystem, no adversarial concurrent process replacing ancestors during system calls, and no network-share durability guarantee. Veritas protects against unsafe content and cooperative concurrency; JavaScript filesystem precondition checks are not a security sandbox.

## Main delivery risks

| Risk | Priority | Owning work | Resolution |
| --- | --- | --- | --- |
| Baseline leaks or loads twice | P0 | TASK-009 | Whole-target loading graph and family-subset fixtures |
| Interrupted writes erase later edits | P0 | TASK-011 | Before/after preconditions, backups, equal-manifest recovery and failure injection |
| Source movement silently changes output | P0 | TASK-005, TASK-013 | Verified snapshots, fixed pins, explicit update/restore |
| Target controls are ignored | P0 | TASK-004, TASK-006, TASK-007, TASK-008 | Typed controls; incapable consumers fail or are explicitly excluded |
| Platform semantics differ | P1 | TASK-014 | Real platform checks, portable paths and logical mode semantics |
| Certification access is unavailable | P1 | TASK-016 | Continue offline validation and retain qualified evidence labels |
| Existing engine already fits | P0 | TASK-001 | Bounded empirical reuse gate before broad implementation |
