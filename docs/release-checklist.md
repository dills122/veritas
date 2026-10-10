# Veritas release candidate checklist

This checklist closes the implementation against requirements and retained evidence. The original planning snapshot had every item pending; use the live ledger for current status. The lead fills evidence references during TASK-017; preparing this checklist is not a product release.

- [x] Build-versus-reuse decision resolved and dependent contracts reconciled.
- [x] All required work items have executed acceptance evidence and integrated status.
- [x] Strict schemas, compatibility failures and deterministic compiler fixtures pass.
- [x] Ownership table, read-only behavior, and no-op synchronization pass.
- [x] Representative write/commit/recovery interruption boundaries pass, including equal manifest hashes; exhaustive permutations remain follow-up.
- [x] Pinned local/Git sources, cache corruption, offline regeneration and exact restore pass.
- [x] Clean Node 24 install, full verification and package-consumer tests pass.
- [x] macOS Node 24 evidence is retained; Linux/Windows certification is explicitly deferred.
- [x] Documented examples, adoption, local editing, update and recovery work from temporary clean copies.
- [x] Adapter profile evidence is versioned; certified and documentation-based labels are accurate.
- [x] Fresh-context review is retained, actionable findings resolved and affected checks rerun.
- [x] Requirements, decisions, task ledger, test mapping and retained code identity agree.
- [x] Final handoff lists completed, blocked and deferred work, with parent implications.

Public publishing is separate from local implementation. It requires a reviewed package name/version/license, package contents and registry destination, plus explicit authorization. No task here creates a registry project, remote repository, push, merge, deployment or publication.

Closed: final independent [review 3](evidence/review-3.md) is Ready with no remaining actionable findings. [TASK-017](evidence/TASK-017.md) retains current source/archive identities, 167 unit tests, 81 integration tests, installed package checks and 42 CLI walkthrough commands. All 17 tasks are completed within the accepted local macOS candidate scope; no in-scope blocker remains.
