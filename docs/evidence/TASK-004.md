# TASK-004 parser and package validation evidence

Status: delivered for lead integration. Implements the pure `parseLibrary(snapshot, namespace, profile): Result<NormalizedLibrary>` contract without filesystem/network effects or package execution. Frozen shared model, schemas, profile contracts and the ledger were preserved.

## Scope and behavior

Owned files: `src/parsing/library.ts`, `src/parsing/markdown.ts`, `src/validation/packages.ts`, focused tests under `tests/unit/parsing/` and `tests/unit/validation/`, and the retained portable library under `tests/fixtures/packages/`.

- Strict manifest declarations and every profile reference are validated; all declared steering and SKILL paths must exist. Selected bodies alone are parsed. Identities are qualified by namespace and include one-based diagnostic locations.
- Frontmatter must be a closed YAML block at the first line. Code-fenced apparent frontmatter is not metadata. Duplicate keys, unsupported YAML structures and unknown rule/skill controls fail through the frozen schemas. The lead accepted explicit UTF-8 BOM rejection in YAML/selected Markdown; invalid UTF-8 is never replaced silently.
- Steering bodies retain their original source slice with CRLF normalized to LF. Complete skill files, including README/license, binary assets and executable intent, are copied without Markdown rewriting or script execution. Copies detach Buffer-backed bytes from the immutable source snapshot.
- Snapshot validation rejects unsafe portable paths, ancestor/leaf overlap, duplicate/case-colliding names including directory spellings, and fixed depth/entry/file/tree limits. Steering/SKILL are capped at 1 MiB; supporting assets, including Markdown, retain the 10 MiB asset budget.
- Parsed links/images/definitions resolve inside each package after one percent decode; fragments/query strings do not alter existence checks. Missing paths, traversal, malformed escapes and unsupported absolute/protocol paths fail. HTTPS/mail references are never fetched. Code-literal links are excluded.
- File-like native `@path` and Kiro imports in ordinary steering prose/HTML are rejected, while fenced/inline code is preserved. Locations use original source spans, including preceding Markdown escapes.
- Advanced SKILL frontmatter is rejected rather than stripped. Known `agents/openai.yaml` sidecars (including case variants on case-insensitive consumers) are conservatively rejected as unsupported for this RC, preserving their source files and reporting an explicit diagnostic.

## Verification and TDD evidence

Runtime selected with `export PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH` (Node 24.18.0).

- Initial `npm test -- tests/unit/parsing/library.test.ts`: red, missing parser module. First implementation made 14 tests pass.
- `npm test -- tests/unit/parsing tests/unit/validation`: red for native imports inside HTML comments; corrected scanner made all 44 tests pass.
- Additional tests reproduced decoded-Markdown source-column loss and an overly strict supporting-Markdown size limit. Source-span matching and distinct document/asset budgets resolved both (46 tests).
- Retained package fixture added license/README/reference/binary/executable coverage (47 tests).
- A Buffer-backed source isolation regression demonstrated mutation leaking through `Buffer.slice`; replacing it with `new Uint8Array(entry.bytes)` resolved it. The fixture assertion was adjusted to compare matching Uint8Array representations rather than Buffer object identity.
- Final `npm test -- tests/unit/parsing tests/unit/validation`: exit 0, 48 tests across two files.
- `node node_modules/eslint/bin/eslint.js src/parsing src/validation tests/unit/parsing tests/unit/validation`: exit 0.
- `node node_modules/prettier/bin/prettier.cjs --check src/parsing src/validation tests/unit/parsing tests/unit/validation tests/fixtures/packages`: exit 0.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.build.json`: exit 0; application source compilation validates shared contracts.
- `npm run typecheck` passed after initial owned optional-property/type-default corrections; a later full run at 04:30 UTC failed solely on concurrent writer tests importing not-yet-created apply/recover/control/lock modules and their callback type. No owned-code type errors remained. The lead must rerun the global gate after writer integration.

## Navigation and boundaries

Codebase-memory `list_projects`, `search_graph(parseLibrary.*)` and coverage checks used generation `2026-10-10T03:29:55Z`; new shared sources were not tracked, requiring exact source fallback. Serena successfully returned symbols for config parsing and the new parser/validation modules; no empty-LSP claim applies to these observed calls.

Unmatched activation warnings require target-project file inventory absent from this pure parser API. The lead accepted placing those warnings at CLI/compiler inventory integration; matching against library source paths would give incorrect activation evidence. Files/manual/auto metadata remains explicit in normalized rules and is capability-checked by compilation. Cross-library skill-name collisions remain compiler-owned. Filesystem symlink/hardlink/kind validation remains source/output-boundary-owned because Snapshot entries contain ordinary file bytes and executable intent.

No harness runtime certification, global config changes, commits or publication occurred. The fixture companion script is inert validation data and was never executed.

## Closure review correction

Review instance2 found the package validator counted filenames toward the documented16-directory limit. Lead corrected only that boundary and diagnostic, aligning it with local/Git/cache source validation. Complete selected skill/binary-reference regressions at15/16/17directory levels demonstrated the16case failing beforefix, then passing afterfix while17remains rejected. Focused parser/validation/source suites passed62tests; full closure verification passed167unit/81integration/2consumer tests plus declarations. Current source/archive identities and final review are in TASK-017.
