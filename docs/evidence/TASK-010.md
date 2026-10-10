# TASK-010: ownership observation and planning

Implemented the frozen `createManifest(CompileResult)` and `plan(project, CompileResult)` contracts. Planning reads the complete desired/prior owned path union, records before-state preconditions and after artifacts, and never creates directories, runtime state, caches or control files. Manifest provenance and executable intent contribute to drift.

Files: `src/sync/observe.ts`, `src/sync/manifest.ts`, `src/sync/plan.ts`, `tests/unit/sync/plan/plan.test.ts`.

Observation helpers exported for the writer: `observe`, `readObservedFile`, `equalState`, `assertSafeAncestors`. Reads reject unsafe relative paths, case-colliding existing spelling, symbolic ancestors/files, special kinds/modes, hardlinks and nested Git roots. Bounded no-follow file handles verify identity and observation consistency. Callers separately enforce their transaction write allowlists.

The ownership matrix protects identical unmanaged content, modified managed bytes or executable semantics, stale modified files, corrupt/unsupported manifests, and unsafe outputs. Missing owned outputs can be recreated even if the manifest digest stays equal. Already missing stale outputs leave through manifest-only drift. Unlisted skill assets remain untouched. Root shadow guidance yields hard conflicts for affected consumers; extra native/nested or symbolic guidance yields deterministic qualification warnings. Inventory does not follow symbolic directories or cross nested repositories.

## Executed verification

macOS, Node 24.18.0; commands used `PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH`.

- Initial `npm test -- tests/unit/sync/plan`: failed because the new implementation modules did not exist, before implementation.
- Final `npm test -- tests/unit/sync/plan`: passed 29 tests in one suite. Covers every ownership table row, mode protection, malformed and duplicate-key manifest rejection, manifest-only drift, missing recreation with equal manifest digest, no write effects, path allowlist, case collisions, symbolic ancestors, hardlinks, nested Git boundaries, guidance shadow/warning behavior, binary hash identity and output resource limits.
- `npx eslint src/sync/observe.ts src/sync/manifest.ts src/sync/plan.ts tests/unit/sync/plan`: passed.
- `npx prettier --check src/sync/observe.ts src/sync/manifest.ts src/sync/plan.ts tests/unit/sync/plan/plan.test.ts`: passed before the final formatted symbolic-inventory refinement.
- `npm run typecheck`: attempted; blocked by concurrently incomplete parsing/cache modules and validation types outside this task. No errors referenced the owned planner files.
- `npx tsc --ignoreConfig --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --verbatimModuleSyntax --types node src/sync/observe.ts src/sync/manifest.ts src/sync/plan.ts tests/unit/sync/plan/plan.test.ts`: passed for this task and its imported dependencies. An earlier scoped attempt without TypeScript 6's `--ignoreConfig` failed with TS5112; corrected command above passed.

## Tooling and limits

Serena instructions read and active project verified. Codebase-memory project `veritas` was ready at generation `2026-10-10T03:29:55Z`; targeted graph lookup had no new model/schema symbols. Exact-path coverage reported those new files untracked, so source fallback was used. Graph absence was not used as evidence of missing application functionality.

Safety is for ordinary trusted repository filesystems, with no claim of sandbox protection against malicious ancestor replacement races. Files are compared by bytes and normalized executable intent, as represented by the shared manifest contract. Inventory is bounded to the shared entry/depth limits and reports qualification warnings on truncation; dependencies, runtime cache/state, canonical local library and nested repositories are outside native guidance traversal. No global harness settings or live loading certification were inspected. The full integrated typecheck remains the lead's acceptance gate after parallel owners finish.
