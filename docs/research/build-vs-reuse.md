# Build versus reuse: bounded TASK-001 comparison

Status: executed comparison complete; recommendation ready for the lead's DEC-002 gate. Recommend keeping the standalone compiler baseline. Exact observed versions are Rulesync 29.0.0 and Ruler 0.3.44. Their supported public entrypoints perform filesystem effects; the tested generation behavior also differs from Veritas's scope and ownership contracts. Both packages are MIT-licensed, so license compatibility is not the deciding barrier.

## Decision packet

Question: can either existing engine replace Veritas's implementation, or supply a stable pure renderer without bypassing its normalization, combined-target analysis and exclusive writer? The lead owns DEC-002. This matters before TASK-003 freezes shared contracts. Scope was one bounded pass per tool plus targeted retests in disposable repositories, with a 30-minute reassessment cap. No competitor generated into this checkout; no install hooks or imported skill scripts ran. No commits, global configuration, publication or external messaging occurred.

Criteria: preserve activation and consumer restrictions; emit deterministic artifacts without unmanaged adoption or overwrite; expose losses; provide a supported no-I/O renderer interface; allow immutable source snapshots and Veritas-owned recovery. Stop after representative always/files/skill, repeat, unmanaged and edited-output probes. Catalogue other cases for later Veritas acceptance rather than expand the kickoff into exhaustive research.

## Method and retained evidence

Environment: macOS arm64, Node 24.18.0, npm 11.16.0. Execution occurred October 10 UTC / October 9 Toronto. See [tool pins](../../tests/fixtures/compatibility/tool-pins.json), [inputs and runners](../../tests/fixtures/compatibility/README.md), [initial probe logs/hashes](../../tests/fixtures/compatibility/results.json), [targeted retests](../../tests/fixtures/compatibility/retests.json), and [intent catalogue](../../tests/fixtures/compatibility/catalogue.json).

Initial sandbox npm metadata lookup failed `ENOTFOUND`; a permitted public-network invocation succeeded. Install used `--ignore-scripts --no-audit --no-fund --save-exact`, a temporary cache and prefix, and exact versions. Ruler's published gitHead is `658d1bc168e3496015aa5c262361cce818fabcf9`; Rulesync's registry metadata did not provide gitHead, so its published version and integrity pin are authoritative here. No floating executable was used after resolution.

The common skill contains a SKILL document, relative reference, binary asset and executable companion script. The latter writes a marker if executed; no marker appeared. The first source pass starts with unmanaged root AGENTS and CLAUDE files. A second pass repeats generation. A third appends `EDITED_BY_USER` to CLAUDE and repeats. Ruler's conditional intent was supplied as native Claude `paths` frontmatter in a separate source Markdown file; this translation tests whether it interprets or merely concatenates that field.

Exact generation commands, with the observed Node binary preceding each entrypoint:

```sh
node /private/tmp/veritas-task001/tools/node_modules/rulesync/dist/cli/index.js generate --targets codexcli,claudecode,kiro-ide --features rules,skills
node /private/tmp/veritas-task001/tools/node_modules/@intellectronica/ruler/dist/cli/index.js apply --agents codex,claude,kiro --no-mcp --no-gitignore --local-only --skills
```

Both representative commands returned 0 on all three runs. Retests used `codexcli` alone, Rulesync target order `kiro-ide,claudecode,codexcli`, and an empty-output Ruler repository. Full argv, working directories, stdout and stderr are in the JSON evidence.

## Findings

| Criterion | Rulesync 29.0.0 observation | Ruler 0.3.44 observation |
| --- | --- | --- |
| Always guidance | Root AGENTS and CLAUDE generated; Kiro consumes shared AGENTS output | Root AGENTS, CLAUDE and Kiro native combined steering generated |
| File activation | Claude `paths` and Kiro `fileMatch` emitted; Codex-only generation folded file body into always-on AGENTS without diagnostic | Supplied `paths` remained embedded in combined Markdown bodies; no separate native conditional rule was emitted |
| Shared target composition | Original target order emitted a collision warning and Kiro output won AGENTS; reversing target order selected Codex's folded body | Shared AGENTS plus Kiro native combined instructions emitted; runtime effective loading was not measured |
| Complete skills | All four files copied to three native directories; binary/reference/script hashes and executable mode preserved; SKILL whitespace changed | All four files copied to Codex/Claude, unchanged package bytes; Kiro skipped with explicit warning |
| Unmanaged baseline | Existing CLAUDE content overwritten, exit 0 | Existing CLAUDE overwritten with backup, exit 0; existing root AGENTS incorporated into first combined output |
| Edited CLAUDE | User edit overwritten, exit 0 | User edit overwritten with backup, exit 0 |
| Repetition | Original and reversed orders produced identical final byte inventories on repeat; reversed order still rewrote shared AGENTS twice | Clean-output repetition stable excluding newly created backups; initial unmanaged-root pass changed on repeat because root content was then recognized as generated and excluded |

**Observation:** Rulesync's Codex-only AGENTS SHA-256 was `12338d1e7e91cbf99bb21b61e87ecf9c41e2aa2b5ff94f2caab6f033c1aa9e94`; it contained both baseline and file-scoped bodies as plain text. This is explicit evidence of a loss relative to Veritas's required default rejection, not a claim that every Rulesync mapping loses scope.

**Observation:** Ruler's initial CLAUDE digest changed from `d6eb53dd014111bda3719e974ce622325a8de56d6d930632b189ec6cd287f28b` (271 bytes) to `6dfbfb79b8a4486cdc1e52186cfcce8ae97933d5227105aacf7f969076fb419e` (195 bytes) on repeat. The clean-output retest produced the latter digest consistently. Therefore the discrepancy is initial unmanaged-content adoption, not evidence of general nondeterministic rendering.

**Observation:** both tools copied the binary asset with SHA-256 `896a425d1fade64e368ccca61003182138e59b7050bca9a7ec8f4ca99646f9fb`, and retained companion script mode 0755 in their supported destinations. Rulesync normalized SKILL whitespace; Ruler retained original SKILL bytes. No companion script executed.

**Documented/package fact:** Rulesync's package root exports `generate`, `importFromTool`, `convertFromTool` and option/result types. Inspected `dist/index.d.ts` takes input/output roots and reports generated paths/counts, dry-run/check and effects; it does not expose the normalized in-memory artifact renderer Veritas needs. Its package export map exposes the root entrypoint. [Published package](https://www.npmjs.com/package/rulesync/v/29.0.0), [public API documentation](https://rulesync.dyoshikawa.com/api/programmatic-api).

**Documented/package fact:** Ruler's package main `dist/lib.js` exports `applyAllAgentConfigs` and `allAgents`. Its inspected `dist/lib.d.ts` returns `Promise<void>` for the apply operation; the agent interface's `applyRulerConfig` takes a project root and returns `Promise<void>`. The inspected implementation loads configuration and propagates files. `getDefaultOutputPath` is available metadata, not a pure full renderer. [Published package](https://www.npmjs.com/package/@intellectronica/ruler/v/0.3.44), [pinned upstream revision](https://github.com/intellectronica/ruler/tree/658d1bc168e3496015aa5c262361cce818fabcf9).

**Inference:** wrapping either tested public generation API would require temporary filesystem round-tripping and replacing its source selection, scope analysis and write semantics. Deep-importing/forking internal renderers would create another versioned compatibility surface for little demonstrated RC benefit. This is based on inspected published entrypoints and probes, not an absence claim inferred from README features.

## Options and recommendation

| Option | Benefit | Contract cost | Recommendation |
| --- | --- | --- | --- |
| Standalone small pure compiler | Direct ownership of compatibility, deterministic artifacts and writer boundary | Implement three focused adapters; ongoing vendor profile upkeep | Proceed |
| Public engine API wrapper | Broad current target knowledge and ready generation CLI | Disk-based generation, adoption/overwrite semantics and target composition must be isolated/replaced | Reject for this RC |
| Pure renderer extraction/fork | Possible reuse of conversion details | No suitable supported renderer established in bounded review; internal extraction and conformance campaign remain work | Revisit only with a documented pure entrypoint and material measured savings |

The lead should resolve DEC-002 to standalone and continue TASK-003. Retain the tools as comparative research references, not runtime dependencies. Implement local schemas, conservative profiles and one exclusive safe writer. Use the catalogue for focused regression tests; REQ-005/014 safety requires Veritas tests after implementation, not this competitor report.

Confidence is high for the observed contract mismatch and overwrite behavior, moderate for API-reuse assessment limited to published entrypoints. No crash recovery, source pinning, advanced invocation restrictions, manual/auto conversion, exhaustive pattern equivalence, Kiro CLI surface, or full engine internals audit was attempted. Their absence is not asserted. No live Codex/Claude/Kiro harness was run; outputs alone do not certify loading. Reopen reuse only if a supported pure artifact API demonstrates equivalent normalization/composition plus a significant implementation-time reduction.
