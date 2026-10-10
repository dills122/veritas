# Veritas architecture decisions

These decisions define the implementation baseline. Change a decision before changing dependent contracts and tasks. An autonomous lead may resolve routine details within this baseline; changes to scope, ownership safety, or compatibility guarantees must remain explicit and reviewable.

| ID | Decision and status | Reason and consequence |
| --- | --- | --- |
| DEC-001 | TypeScript ESM, Node 24, npm; accepted planning baseline | Matches the schema/compiler workload and existing .nvmrc; one package and lockfile; standalone binary distribution deferred |
| DEC-002 | Standalone core; accepted after TASK-001 | Pure compatibility model and ownership contracts are central; reuse an existing renderer only if it is deterministic, non-writing, and passes the same fixtures |
| DEC-003 | One upstream plus explicit local profile; accepted | Avoid dependency resolution and implicit precedence; exact IDs rather than inheritance or profile globs |
| DEC-004 | Full-file ownership and no adoption/force option; accepted | Existing files are protected even if identical; manual migration keeps authorship and replacement intentional |
| DEC-005 | Combined-target compiler owns shared baseline; accepted | Shared filenames expose content to multiple consumers; adapters cannot decide independently |
| DEC-006 | Immutable upstream snapshots and compiler profiles; accepted | Moving tags and edited source directories cannot silently change routine regeneration; local overlay digest remains live |
| DEC-007 | Recoverable journal with manifest commit point; accepted | Multi-file replacement is not atomic; preserve backups and fail safely on unexpected state |
| DEC-008 | Strict loss policy with exact file-to-always opt-in; accepted | Broad warning mode could hide scope changes; restrictions stay hard errors; manual/auto-to-skill conversion deferred |
| DEC-009 | No arbitrary native files or templates; accepted | Typed supported extensions have bounded behavior; source processing never executes code |
| DEC-010 | Fixture certification plus optional live evidence; accepted | Compiler correctness can be tested offline; runtime loading certification requires exact versions/settings and observable evidence |
| DEC-011 | Content/mode hashing and portable paths; accepted | Executable assets and case-insensitive filesystems require more than string-content hashes |
| DEC-012 | Source-independent filesystem writer; accepted | Sources, adapters, and CLI cannot bypass synchronization checks; shared control writes use the same safe primitives |

## Stack selections

Use `yaml` for YAML documents; `unified`, `remark-parse`, and `remark-frontmatter` for Markdown boundaries and source positions without reformatting bodies; `zod` for strict runtime schemas; `commander` for the CLI; bounded sorted `node:fs` traversal for package discovery; `picomatch` for the documented subset of source/reference matching. `remark-frontmatter` identifies syntax; YAML parsing remains a separate step. [YAML documentation](https://eemeli.org/yaml/), [remark frontmatter](https://github.com/remarkjs/remark-frontmatter).

Use TypeScript, ESLint, Prettier, and Vitest as development tooling. TASK-002 verifies current APIs and selects exact compatible versions, commits package-lock.json, and records rationale for dependency changes. Do not invent version pins in the planning documents or add overlapping parser/glob stacks. TASK-002 removes unused fast-glob after npm audit identifies an unpatched braces dependency advisory; filesystem traversal needs no glob engine.

Node 24 is the project baseline, consistent with `lts/krypton`. [Node release status](https://nodejs.org/en/about/previous-releases) lists Node 24 as LTS at the review date. The shell currently defaults to Node 22, while Node 24.18.0 is installed locally; implementation must select the intended runtime before validation.

## Build versus reuse gate

TASK-001 executed pinned Rulesync 29.0.0 and Ruler 0.3.44 probes. Both public generation APIs perform filesystem effects and overwrite unmanaged/edited instructions in the tested case. The lead accepts the standalone core decision; see [comparison](research/build-vs-reuse.md). The evidence does not claim general engine feature absence or live harness certification.

TASK-001 compares pinned Rulesync and Ruler revisions in disposable repositories, with identical representative source intent. Capture exact invocations, tool versions, outputs, diagnostics, ownership effects, repeated application, and limitations. Unsupported translations count as a valid outcome if they are explicit. Use the comparison to judge semantic loss, composition, provenance, output ownership, crash recoverability, and deterministic non-writing APIs.

Continue standalone if neither engine can satisfy the guarantees without bypassing core boundaries. Use a thin renderer dependency only if its API is pure, version-pinned, license-compatible, and covered by Veritas fixtures. If reuse changes architecture materially, revise this decision, the technical design, and the task graph before executing dependent tasks. Stop the comparison after one documented pass per tool plus targeted retests of ambiguous outcomes; do not let it become an indefinite prerequisite.

## Bounded RC execution decision

The accepted kickoff budget is 4–6 active hours with at most three internal workers and one lead. Freeze feature additions at hour four; prioritize core safety tests, package consumption and independent review. macOS Node 24 is the initial verified environment. Broad certification and advanced typed controls are follow-up, with unsupported controls rejected. The timebox changes evidence breadth, not ownership/compatibility safety.
