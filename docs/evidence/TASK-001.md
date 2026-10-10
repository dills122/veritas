# TASK-001 evidence

Status: bounded research delivered for lead verification and DEC-002 resolution. No product implementation acceptance is claimed.

Owned outputs: `tests/fixtures/compatibility/`, `docs/research/build-vs-reuse.md`, this evidence file. Canonical decisions, ledger, package and shared schemas were preserved for the lead.

## Commands and outcomes

- `npm view rulesync version license gitHead dist.integrity --json --fetch-retries=0 --fetch-timeout=12000`: initial sandbox failure `ENOTFOUND`; permitted public-network invocation succeeded. Rulesync 29.0.0, MIT; gitHead not supplied.
- Equivalent view of `@intellectronica/ruler`: succeeded; 0.3.44, MIT, gitHead `658d1bc168e3496015aa5c262361cce818fabcf9`. Integrity strings retained in tool-pins.json.
- `/Users/dsteele/.nvm/versions/node/v24.18.0/bin/node /Users/dsteele/.nvm/versions/node/v24.18.0/lib/node_modules/npm/bin/npm-cli.js install --prefix /private/tmp/veritas-task001/tools --cache /private/tmp/veritas-task001/npm-cache --ignore-scripts --no-audit --no-fund --save-exact rulesync@29.0.0 @intellectronica/ruler@0.3.44`: exit 0, 278 packages. Deprecated transitive koa-router warning; no install scripts ran.
- An initial help invocation used incorrect `dist/cli.js` paths and returned MODULE_NOT_FOUND. Reading the installed package bin declarations corrected the entrypoints to `dist/cli/index.js`; both generate/apply help commands then returned 0. This was an invocation correction, not a candidate-tool failure.
- `python3 /private/tmp/veritas-task001/run-probes.py`: exit 0; both tools' three generation calls returned 0. Complete argv/stdout/stderr and inventories retained in results.json. Both overwrote unmanaged/edited CLAUDE; neither executed the fixture script.
- `python3 /private/tmp/veritas-task001/retests.py`: exit 0; all six targeted generation calls returned 0. Clean Ruler byte repetition stable excluding backups. Rulesync Codex-only flattened conditional intent; reversed shared-target order altered final shared selection while preserving repeat-run bytes.
- Package declarations and MIT licenses inspected without invoking package scripts. Published entrypoint hashes recorded in tool-pins.json.

## Acceptance coverage

- Always/files/manual/auto inputs, complete portable skill, advanced controls, target restrictions, shared loading, ownership and shadow/pattern cases retained in versioned catalogue. Catalogue-only cases are explicit future acceptance work.
- Representative always/files/skill generation, unmanaged/edited outcomes and deterministic deltas executed at exact pinned versions in isolated repositories.
- Public API and licensing assessed against normalization/writer/composition boundaries. No absence claims from README feature lists.
- Standalone recommendation delivered; only the lead may record DEC-002 resolution and ledger completion.

Limitations: no live harness loading, platform matrix, competitor crash-recovery or source-pinning campaign. Reported output semantics are the tested fixtures' behavior, not universal statements about every feature. See the research report for exact hashes, inference distinctions and criteria to reopen reuse.

## Retained artifact verification

- `python3 scripts/check-planning.py`: exit 0; 15 requirements, 12 decisions, 17 acyclic work items; ownership, traceability, task index and local links passed.
- `python3 -m py_compile tests/fixtures/compatibility/run-probes.py tests/fixtures/compatibility/retests.py`: exit 0.
- Both retained runners executed again with tools prefix `/private/tmp/veritas-task001/tools` and fresh root `/private/tmp/veritas-task001/retained-run-check`: exit 0; same representative outcomes reproduced.

The first retained-runner smoke check exposed a missing fresh-root directory creation, corrected locally; a misplaced insertion briefly caused an IndentationError, also corrected before successful rerun. These reproduction-runner defects did not affect the original competitor observations.
