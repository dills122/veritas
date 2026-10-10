# TASK-011: recoverable synchronization and control transactions

Implemented project-local exclusive mutation leases, complete-state journaled synchronization, tagged init/update control writes, and restartable validated rollback/cleanup. No automatic abandoned-lock removal or `--unlock` option is implemented.

Owned files: `src/sync/lock.ts`, `src/sync/journal.ts`, `src/sync/apply.ts`, `src/sync/recover.ts`, `src/sync/control.ts`, `tests/integration/sync/transactions.test.ts`.

## Stable integration API

- `apply(project, buildPlan, options?)` returns the applied `WritePlan`; the callback executes under the exclusive lock. Any conflict/error blocks the entire plan.
- `recover(project, options?)` returns `{action: 'none' | 'rollback' | 'cleanup', kind?}`.
- `writeControls(project, kind, controls, options?)` takes init/update plus fixed control paths, bytes and caller-captured `expectedBefore` observations. Init requires both absent controls and commits the lock last; update requires the existing lock and writes only that lock.
- `TransactionOptions.preconditions` carries additional config/lock observations for source-resolution guards without expanding write authority. For update, pass the pre-resolution config observation here as well as the lock observation on its control entry.
- `acquireLock`, `withProjectLock` and read-only `assertNoIncompleteTransaction` support CLI integration. Absent runtime directories stay absent when checked read-only.
- `TransactionOptions.fault(point, context)` is an injected testing dependency. Source configuration cannot enable it.

## Safety behavior

Locks use exclusive no-follow creation, random nonce and process identity. Release removes only the exact lease payload; another owner's replacement remains. All normal exceptions after acquisition release this invocation's owned lock.

Every desired and prior owned artifact, including unchanged paths, participates in transaction preconditions. Stage files and before-state backups use index-derived paths under an exclusive UUID directory. Files are completed, normalized to 0644/0755 intent and fsynced before strict journal publication. Staged bytes are revalidated before atomic destination renames. Preconditions are rechecked before each write and the complete applied set is rechecked before the final manifest commit. Journals themselves have replacement/cleanup preconditions.

The schema-validated tagged journal cannot expand sync authority into Git/control files or control authority into generated outputs. Resource limits bound entry count, individual bytes and aggregate staging/backup inventories. The manifest or source lock commits last. Unchanged output/manifest bytes are not rewritten. Transaction cleanup removes only its runtime directory and journal.

Recovery validates the journal, complete current before/after inventory, and all necessary existing backups before any output restoration. External destination edits or invalid backups preserve evidence and fail with conflict. Backups are copied into validated restoration stages rather than consumed, permitting repeated rollback interruption. Cleanup can resume after backup deletion when the complete output inventory already matches committed or restored state. Equal before/after manifest hashes use the whole output inventory to choose cleanup versus rollback.

## Executed verification

macOS; Node 24.18.0. Commands used `PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH`.

- Initial `npx vitest run --config vitest.integration.config.ts tests/integration/sync`: failed because implementation modules did not exist, before code was written.
- Incremental direct integration runs: 21, then 25 cases passed as invariants were added.
- Final `npm run test:integration -- tests/integration/sync`: build passed and 28 tests passed in one suite. This was executed before the lead reserved distribution builds to avoid parallel clean-build races. Subsequent worker verification must use direct Vitest; lead owns final builds.
- `npm run typecheck`: passed.
- `npx eslint src/sync/lock.ts src/sync/journal.ts src/sync/apply.ts src/sync/recover.ts src/sync/control.ts tests/integration/sync`: passed.
- `npx prettier --check src/sync/lock.ts src/sync/journal.ts src/sync/apply.ts src/sync/recover.ts src/sync/control.ts tests/integration/sync`: passed.

Tests cover overlapping mutators, nonce-safe release, read-only incomplete-state detection, planning under lock, second-sync output/manifest mtimes and modes, refusing a conflicted whole plan, before/after artifact faults, before/after commit faults, partial cleanup faults, changed preconditions, unchanged-file edits before commit, complete prevalidation, repeated rollback/cleanup, equal-hash recreation, tampered staging/backups, forged journal path authority, executable restoration, init between files, existing config preservation, and update lock/config resolution guards.

## Limits and operational follow-up

Handled injected faults release the lease and leave a recoverable journal. Actual process death can leave a lock. The repository owner must inspect its nonce/process identity and establish that the owning process is abandoned before manually removing that exact lock; the RC never automatically steals a stale or unverifiable lock. Removing a lock does not authorize overriding recovery conflicts.

File fsync and supported directory fsync boundaries are used. Unsupported directory fsync errors are tolerated explicitly; this is not certification of power-loss durability across operating systems/filesystems. These tests exercise deterministic exceptions on macOS, not process-kill, power-loss, adversarial ancestor-replacement or Windows process-reuse permutations. Empty output parent directories may remain after rollback/deletion; no broad directory pruning occurs. Runtime cache population remains a separate explicit source-resolution action. Live harness loading and other-platform certification remain follow-up work.

No commits, shared contracts, CLI/source modules, package configuration or ledger were changed by this task.

## Lead integration correction: lease around source resolution

The CLI must hold the project lease around the entire explicit init/update/restore source-resolution and cache-population operation, rather than acquiring it only for the final control commit. Added `TransactionOptions.lease?: LockLease`; `writeControls` verifies and reuses that caller-held lease without releasing it. The CLI caller releases it in `finally`. The default control API still acquires and releases its own lease.

`assertNoIncompleteTransaction(project, lease?)` accepts only the exact current project-local nonce/process payload for a provided lease, and always rejects an existing journal. `assertLockLease` exposes that verification. Nonce matching is an explicit bearer capability; PID equality alone never proves ownership. The `LockLease` export remains `{nonce: string, release: () => Promise<boolean>}`.

Additional direct verification after this correction:

- `npx vitest run --config vitest.integration.config.ts tests/integration/sync`: passed 31 tests.
- `npm run typecheck`: passed.
- `npx eslint src/sync/lock.ts src/sync/journal.ts src/sync/control.ts tests/integration/sync`: passed.

New tests exercise source/cache work and control commit under the same retained caller lease, competing mutator rejection throughout, forged nonce rejection before any control writes, and refusal to bypass incomplete journals with a valid owner lease. No distribution build was invoked for this correction.
