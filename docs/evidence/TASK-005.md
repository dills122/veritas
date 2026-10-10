# TASK-005 local snapshot and cache evidence

Implemented on macOS with Node v24.18.0, verified through 2026-10-10 04:30 UTC. Work is uncommitted on `feature/veritas-v01`. No control files, CLI files, shared contracts, Git transport or generated guidance were changed.

## Delivered interfaces

- `createLocalSnapshot(root: string): Promise<Snapshot>` in `src/sources/local.ts`.
- `storeSnapshot(project: string, snapshot: Snapshot): Promise<void>` and `loadSnapshot(project: string, treeDigest: string): Promise<Snapshot>` in `src/sources/cache.ts`.
- Source-only filesystem safety and snapshot validation helpers in `src/sources/snapshot.ts`.

Traversal uses bounded directory enumeration, ordinal portable paths, fixed-size file reads and shared hashes/limits. It rejects links, hardlinks, special entries, privileged modes, executable known configuration, reserved/non-NFC names, case collisions, and excessive depth/entries/individual or total bytes. Source files are checked before opening, through file-handle identity, after reading and again by path; directory identity is checked after traversal. Binary bytes and normalized executable intent remain intact. Root `.git` metadata is excluded without following links; nested `.git` entries are rejected. No other library files or dotfiles are silently excluded. The same reader provides live overlay snapshots; subsequent edits change its digest while prior snapshot bytes stay independent.

The cache lives under `.veritas/runtime/cache/<digest>`, with strict canonical `inventory.json` and source payloads under `files/`. Loading verifies the inventory schema/encoding, complete file inventory, hashes, executable intent, normalized file modes, directory inventory and tree digest. Extra empty directories also fail. It rejects unsafe ancestors, missing/corrupted snapshots, links and forged inventories. Loading performs no writes and never falls back to the upstream directory.

Explicit storage validates and copies the supplied snapshot before writes, stages a complete tree privately, verifies the staged inventory and then renames it into the content-addressed cache. Existing snapshots are verified rather than overwritten; concurrent identical publication is handled by verifying the winner and removing the unused staging tree. Invalid supplied snapshots fail before creating cache directories. No imported content is executed.

## Executed verification

Commands used `PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH`.

| Command | Outcome |
| --- | --- |
| `npm test -- tests/unit/sources/local` before implementation | Expected failure: local snapshot module absent |
| `node_modules/.bin/vitest run --config vitest.integration.config.ts tests/integration/local-source` before cache implementation | Expected failure: cache module absent |
| `npm test -- tests/unit/sources/local` final run | Exit 0; 10 tests passed |
| `node_modules/.bin/vitest run --config vitest.integration.config.ts tests/integration/local-source` | Exit 0; 19 tests passed |
| `node_modules/.bin/eslint src/sources tests/unit/sources tests/integration/local-source` | Exit 0, no warnings |
| `node_modules/.bin/prettier --check src/sources/local.ts src/sources/snapshot.ts src/sources/cache.ts tests/unit/sources/local/local.test.ts tests/integration/local-source/cache.test.ts` | Exit 0 |
| `npm run typecheck` | Exit 0 after parser's initial type fix; later parallel edits temporarily blocked shared builds |
| `npm run test:integration -- tests/integration/local-source` | Shared build blocked by unrelated parser edits; direct focused integration run above passed |

An initial unit fixture using setuid/setgid could not reproduce those modes because this host stripped the bits. The fixture was changed to an observable sticky-file mode; the implementation rejects all three privileged mode bits. The failed first scoped integration command incorrectly used the unit-only config; it was corrected to the separate integration config. No tests were skipped and no no-tests-found bypass was used.

Focused tests cover stable sorting/digest, binary assets, executable intent, permission normalization, independent prior bytes, upstream edit detection, root Git exclusion, preserved dotfiles, nested metadata rejection, symlinks/hardlinks/unsafe ancestors, reserved names, executable configuration, privileged modes, asset/depth limits and maximum valid depth. Cache tests cover pinned bytes, explicit exact-byte restoration, read-only cache misses/loads, existing-cache verification, changed bytes/modes, missing/extra entries and empty directories, symlinks/hardlinks, malformed or forged inventories, traversal, unknown/duplicate keys, incorrect hashes/digests, unsafe ancestors, case-folded collisions/overlap and concurrent identical stores.

## Integration notes and limits

Callers must explicitly compare a newly resolved source digest with the locked digest before accepting a `--restore` operation; cache storage cannot infer the caller's selected lock. Changed live upstream bytes produce a different digest and never satisfy a locked read. Current local overlays can use `createLocalSnapshot` directly without repinning an upstream.

Filesystem roots must use physical paths; ancestor checks reject symlink aliases, including macOS `/var` aliases. Tests canonicalize the OS temporary-directory prefix with `realpath`, preserving rejection of source-root and source-ancestor links. This does not claim complete protection against a hostile process racing directory replacement; Node has no portable descriptor-relative directory traversal API. Ordinary concurrent source changes are detected by identity/time/size checks.

Resource defaults and shared `Snapshot`/hash contracts were preserved. Linux/Windows runtime certification, an exhaustive source-mutation race campaign and complete product acceptance remain follow-up/integration work. The lead owns requirement completion and CLI wiring.
## Independent review correction — executable canonical manifest

On 2026-10-10 at 04:50 UTC, review finding 2 identified that both executable
configuration checks omitted the canonical `veritas.library.yaml` filename.
The two checks now share one private predicate including that filename. Added
regressions for an actual executable local manifest and a caller-supplied
executable manifest offered to the cache; both failed before the fix and pass
after it. Cache rejection occurs before creating any cache directories.

Commands used Node 24 via
`PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH`:

- `npx vitest run --config vitest.config.ts tests/unit/sources` — 11 passed.
- `npx vitest run --config vitest.integration.config.ts tests/integration/local-source tests/integration/git-source`
  — 36 passed across three files, including the Git boundary regression.
- `npx eslint src/sources/snapshot.ts tests/unit/sources tests/integration/local-source tests/integration/git-source`
  — passed.
- `npm run typecheck` — passed.

No dist build, ledger change, shared contract change, or commit was performed.
