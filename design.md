**I’d build Veritas as a versioned compiler and synchronizer for agent guidance—not merely a shared folder that copies Markdown into several places.**

That distinction matters because the difficult part is not generating `CLAUDE.md` instead of `AGENTS.md`. It is preserving—or explicitly accounting for—**when instructions load, where they apply, how skills are discovered, and what happens when a harness cannot represent a feature.**

For v0.1.0, my recommendation is **TypeScript on Node.js, a Git-backed central library, ordinary Markdown authoring, and three built-in harness adapters.** Go is also a legitimate choice; its library ecosystem is not a blocker. I would favor TypeScript for this particular first release, for reasons outlined below.

# 1. Define the product’s promise carefully

I would refine the goal to:

> **Veritas lets organizations maintain one reviewed library of steering and skills, then reproducibly generate and verify the native artifacts required by each supported AI harness.**

The important word is **reproducibly**.

A developer using Claude and a developer using Kiro should be able to identify the same underlying company guidance, at the same revision, even when their generated files differ.

Veritas should provide three guarantees:

| Guarantee                  | Meaning                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Source consistency**     | Generated guidance comes from an identifiable, versioned source rather than independently edited copies.                                  |
| **Explicit compatibility** | Veritas reports unsupported features and changes to loading behavior instead of silently discarding metadata.                             |
| **Drift detection**        | Veritas can determine whether generated files are missing, stale, modified, or inconsistent with the project’s selected library revision. |

It should **not** promise identical model behavior or identical generated code. That is outside what a configuration compiler can establish. Linters, tests, architecture checks, and code review remain the enforcement mechanisms.

This also fits the direction you have been pursuing: **small permanent steering, reusable procedural skills, and deeper documentation that is loaded only when needed.**

# 2. The current harness differences shape the architecture

The documentation currently describes these primary repository-local surfaces:

| Harness         | Steering/instruction files                                | Skills                           | Important distinction                                                                                                              |
| --------------- | --------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Codex**       | `AGENTS.md`, including its documented directory hierarchy | `.agents/skills/<name>/SKILL.md` | Instruction discovery follows repository-root-to-working-directory ancestry; that is not a general glob-triggered steering system. |
| **Claude Code** | `CLAUDE.md` and `.claude/rules/**/*.md`                   | `.claude/skills/<name>/SKILL.md` | Rule frontmatter supports `paths` for file-scoped loading.                                                                         |
| **Kiro**        | `.kiro/steering/*.md`, plus `AGENTS.md` support           | `.kiro/skills/<name>/SKILL.md`   | Steering supports `always`, `fileMatch`, `manual`, and `auto` inclusion modes.                                                     |

These locations and behaviors are documented by the respective vendors. [OpenAI Developers](https://developers.openai.com/codex/guides/agents-md/)

Two consequences are especially important.

### A glob cannot always be translated faithfully

A rule such as:

```yaml
activation:
  mode: files
  patterns:
    - "**/*.test.ts"
```

has straightforward native representations in Claude and Kiro. Codex’s documented `AGENTS.md` discovery mechanism is different. Generating nested `AGENTS.md` files does not magically reproduce arbitrary file-extension matching. [OpenAI Developers](https://developers.openai.com/codex/guides/agents-md/)

Therefore:

> **“Supported harness” must not mean “every source feature has an equivalent implementation on that harness.”**

Veritas needs a capability model.

### `AGENTS.md` is not exclusively a Codex file

Kiro also discovers `AGENTS.md`, including files in subdirectories, and describes those files as always included. Current Claude Code also documents direct `AGENTS.md` discovery, with behavior affected by existing Claude instruction files and configuration. [Kiro](https://kiro.dev/docs/steering/)

Consequently, three adapters cannot independently dump files into a repository and assume their outputs are isolated.

**Veritas needs to evaluate the combined output of all selected targets.** Otherwise, generating instructions for Codex could accidentally duplicate or broaden the guidance Kiro receives.

# 3. Keep the v0.1.0 boundary narrow

I would define the initial release around **repository-local generation**, with a central library that can serve many repositories.

**Include:** local and Git-backed library sources; named profiles; canonical steering; standard skills with their supporting files; Codex, Claude, and Kiro adapters; compatibility diagnostics; deterministic generation; ownership tracking; and a CI drift check.

**Defer:** a hosted service, graphical interface, marketplace, background daemon, general plugin system, bidirectional synchronization, automatic rewriting of existing guidance, MCP configuration, hooks, subagents, and permission-policy synchronization.

Also defer writing into developers’ home directories. Repository-local output gives the team something reviewable and reproducible without unexpectedly changing every project on someone’s machine.

For Kiro, internally distinguish **IDE and CLI compatibility profiles**, even when their generated artifacts coincide. Its documentation already distinguishes support across surfaces and CLI generations. Do not make an unqualified “all Kiro versions” promise. [kiro.dev](https://kiro.dev/docs/steering/)

# 4. Use a neutral source format—but do not reinvent skills

I would separate three concepts:

**Library:** the central collection of guidance.

**Profile:** a named selection of steering and skills, such as `frontend`, `backend`, or `baseline`.

**Project configuration:** which library revision and profile a particular repository consumes, plus explicitly declared local additions.

A central library could look like this:

```text
company-agent-standards/
├── veritas.library.yaml
├── steering/
│   ├── baseline.md
│   ├── typescript.md
│   └── database-changes.md
├── skills/
│   └── company-code-review/
│       ├── SKILL.md
│       ├── references/
│       │   └── review-checklist.md
│       └── scripts/
│           └── inspect-changes.mjs
└── native/
    ├── claude/
    ├── codex/
    └── kiro/
```

The `native` directory would hold **deliberately target-specific extensions**, not three independently maintained copies of the main instructions.

The formats and commands below are proposed Veritas interfaces, not existing functionality.

## Project configuration

```yaml
schemaVersion: 1

sources:
  company:
    git: ssh://git@git.example.com/platform/agent-standards.git
    ref: v1.2.0

profile: company/frontend

targets:
  - codex
  - claude
  - kiro

local: .veritas/local

compatibility:
  onLossy: error
```

A separate `veritas.lock.json` would resolve `v1.2.0` to an immutable commit and record content integrity information and the selected compiler/adapter profile.

**Routine synchronization should use the lockfile, not re-resolve a moving branch or tag.** Updating the selected library revision should be a separate, reviewable operation.

For v0.1, I would support **one upstream library plus local additions**. Multiple organizations, transitive library dependencies, inheritance chains, and dependency resolution can come later.

## Canonical steering

Steering needs a small Veritas schema because the harnesses use different metadata:

```markdown
---
id: typescript-quality
description: Implementation and testing conventions for TypeScript.
activation:
  mode: files
  patterns:
    - "**/*.ts"
    - "**/*.tsx"
---

# TypeScript quality

Follow the repository's existing module boundaries.

Add or update tests when changing observable behavior.

Do not introduce a new dependency when an existing project utility
already provides the required behavior.
```

I would initially recognize these activation modes:

| Mode     | Author’s intent                                      |
| -------- | ---------------------------------------------------- |
| `always` | Include this guidance as persistent project context. |
| `files`  | Include it when working with matching files.         |
| `manual` | Make it available for explicit selection.            |
| `auto`   | Select it by relevance to a task description.        |

Recognizing a mode does **not** imply every adapter can emit it natively.

Other useful fields are a stable `id`, optional target restrictions, and explicitly declared target extensions. Avoid adding priorities, inheritance, arbitrary conditions, and template expressions before a concrete use case requires them.

### Define identity and conflicts explicitly

Internally, a rule could be identified as:

```text
company/typescript-quality
```

Duplicate IDs should be errors. A local rule should not silently replace a company rule because it happened to be loaded later.

Later, an explicit replacement declaration can express that intention. **File discovery order must never determine policy precedence.**

## Canonical skills

For skills, use the existing **Agent Skills format** rather than inventing `VERITAS_SKILL.md` or a parallel specification.

The standard defines a skill directory containing `SKILL.md`, YAML frontmatter, and optional supporting files. It also defines required metadata and name-to-directory consistency. [Agent Skills](https://agentskills.io/specification)

```markdown
---
name: company-code-review
description: >
  Review code changes against company engineering standards.
  Use when reviewing a pull request or preparing changes for review.
---

# Company code review

Read the review checklist in
[references/review-checklist.md](references/review-checklist.md).

Evaluate correctness, test coverage, maintainability, and security.

Separate confirmed defects from questions and optional suggestions.
```

Veritas should materialize the **whole selected skill package**, not just `SKILL.md`.

Preserve supporting files, relative relationships, licenses, and relevant executable permissions. Keep Veritas-specific configuration outside the portable skill payload.

The central distinction is:

> **Steering needs semantic translation. Standard skills mostly need validation, packaging, placement, and carefully controlled extensions.**

# 5. Make compatibility reporting a core feature

Every rule-to-target compilation should produce one of three results:

| Result          | Meaning                                                                          |
| --------------- | -------------------------------------------------------------------------------- |
| **Native**      | The target provides a documented mechanism suitable for the requested behavior.  |
| **Adapted**     | Veritas can produce something useful, but loading, invocation, or scope changes. |
| **Unsupported** | No supported mapping is available.                                               |

“Native” should not mean that two models will interpret the prose identically. It describes the artifact and loading mechanism.

For the TypeScript rule above, Claude output would contain:

```yaml
---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
```

Kiro output would contain:

```yaml
---
inclusion: fileMatch
fileMatchPattern:
  - "**/*.ts"
  - "**/*.tsx"
---
```

Those metadata structures follow their documented rule formats. [Claude](https://code.claude.com/docs/en/memory)

The proposed plan output should explain the unresolved target rather than hide it:

```text
company/typescript-quality

  claude   NATIVE       File-scoped rule
  kiro     NATIVE       fileMatch steering
  codex    UNSUPPORTED  No equivalent general glob-triggered
                        steering mechanism in this profile
```

### Do not silently “fix” unsupported behavior

These are adaptations, not equivalent translations:

- Turning a file-scoped rule into always-loaded text.
- Turning manual steering into an automatically discoverable skill.
- Replacing a native file import with a sentence telling the model to read another file.

They may be reasonable choices, but the project owner should explicitly accept them in configuration.

For workflows intended to be reusable and on demand, **authoring a skill initially is cleaner than automatically converting steering into one**.

### Keep native extensions typed and contained

Claude skills have additional controls, including invocation settings and subagent execution options. Those should not be assumed to have identical meanings elsewhere. [Claude](https://code.claude.com/docs/en/skills)

I would allow target-specific extensions through validated adapter schemas. Unknown fields should produce diagnostics rather than being sprayed into every generated frontmatter block.

Permission-related metadata deserves particular caution: **never remove a restriction simply to make a skill compile for another target.**

# 6. Design explicitly for all three harnesses in one checkout

My preferred default layout is:

**Shared, portable, always-on guidance goes into a generated root `AGENTS.md`.**

Claude receives a small `CLAUDE.md` importing that file:

```markdown
@AGENTS.md
```

Claude documents this import mechanism. Its target-specific rules can then live under `.claude/rules/`. [Claude](https://code.claude.com/docs/en/memory)

Kiro reads the shared root guidance and receives only its additional native steering under `.kiro/steering/`. **Do not emit another copy of the shared baseline there.**

Skills are installed into the three native skill locations, with the same source identity recorded in the manifest.

### What about Codex-specific adaptations?

The safe default is to reject unsupported mappings.

An **explicitly enabled isolated Codex profile** could use `AGENTS.override.md` for Codex-specific output. However, Codex selects that file instead of the same-directory `AGENTS.md`; it does not automatically combine both. The override must therefore include the compiled shared baseline as well. [OpenAI Developers](https://developers.openai.com/codex/guides/agents-md/)

I would only certify that profile after same-checkout tests establish the intended behavior for the supported Claude and Kiro versions.

Two rules should be non-negotiable:

**Never create an override file silently. Never automatically generate nested `AGENTS.md` files as a supposedly equivalent implementation of arbitrary globs.**

This combined-target planning is one of the most valuable parts of the design.

# 7. The internal architecture can stay small

This does not need a distributed system, database, or large monorepo.

I would start with **one package containing a CLI and a reusable core**:

```text
src/
├── cli/
├── config/
├── sources/
├── parsing/
├── model/
├── validation/
├── compiler/
├── adapters/
│   ├── codex/
│   ├── claude/
│   └── kiro/
└── sync/
```

The processing pipeline:

```text
Configuration + lockfile
          ↓
Resolve source snapshots
          ↓
Discover selected rules and skills
          ↓
Parse and validate
          ↓
Normalize into a common internal model
          ↓
Evaluate target capabilities
          ↓
Render artifacts in memory
          ↓
Check combined-target loading and output collisions
          ↓
Build a filesystem change plan
          ↓
Apply approved changes and update the manifest
```

### Keep adapters pure

An adapter should receive normalized content and return generated artifacts plus diagnostics.

It should not fetch repositories, resolve credentials, walk arbitrary filesystem locations, or immediately write files.

That boundary makes it possible to test:

```text
Given this canonical rule and this target profile,
these exact artifacts and diagnostics must result.
```

It also keeps adapter changes from bypassing write-safety controls.

### Separate the two kinds of glob matching

This is easy to muddle:

**Source discovery globs** select which library files Veritas reads.

**Activation globs** describe when a harness should load guidance.

They may use related syntax, but they are different contracts.

For portable activation patterns, start with a documented subset: relative paths, `/` separators, `*`, `**`, `?`, and multiple positive patterns. Define case sensitivity and dotfile behavior, and test them against supported targets.

Do not initially promise portable negation, extglobs, or every brace-expansion behavior.

**A glob that currently matches no repository files should usually warn, not disappear.** It may be intended for files created later.

# 8. Safe synchronization is part of the MVP

For a company tool, overwrite behavior is not a polishing detail.

## Track ownership

Use a deterministic manifest such as:

```text
.veritas/manifest.json
```

Record each managed artifact’s relative path, content hash, source identity, and target/profile.

Before replacing or deleting a previously generated file, compare its current contents with the last recorded output.

An unexpected modification should be a conflict—not something `sync` quietly erases.

Unmanaged files should remain untouched. Existing `AGENTS.md`, `CLAUDE.md`, skills, and steering should be inventoried during initialization so adoption does not accidentally overwrite local work.

For the first release, full-file ownership is simpler than a sophisticated managed-block editor. Existing content can be migrated into canonical local sources through an explicit, reviewed process.

## Make output deterministic

The same locked inputs and compiler profile should produce the same bytes.

Use stable ordering, fixed serialization conventions, and no generated timestamps or absolute machine paths. Preserve Markdown bodies except for documented transformations; do not parse and reformat all prose unnecessarily.

Keep skill assets byte-preserving wherever transformation is not required.

## Plan before writing

Render and validate the complete change set first. Stage writes, recheck conflicts, replace files individually, and write the manifest last.

Do not describe a collection of file replacements as a fully atomic filesystem transaction. An interrupted update should be detectable and recoverable.

## Treat libraries as content, not executable configuration

Veritas should never execute a skill script while importing, validating, or synchronizing it.

Reject path traversal, output-root escapes, and unsafe symlink behavior. In v0.1, rejecting symlinked package contents is simpler than trying to make every possible layout portable.

Keep configuration declarative: no executable JavaScript configuration, arbitrary template evaluation, or source-defined install hooks.

For Git sources, use the developer’s established Git authentication rather than inventing another credential store. Normal validation and generation should work offline once the locked source snapshot is available.

# 9. Language and library recommendation

## My choice: TypeScript on Node.js

I would choose **TypeScript compiled to ESM**, rather than a collection of plain `.mjs` scripts.

The reason is the shape of the project: schemas, discriminated rule types, adapter contracts, source locations, diagnostics, and many fixture-based transformations. Those are exactly the areas where I would want strong compile-time modeling.

A reasonable dependency set is:

| Responsibility                      | Choice                                          | Intended use                                                                 |
| ----------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| YAML                                | `yaml`                                          | Parse configuration/frontmatter and serialize target metadata.               |
| Markdown and frontmatter boundaries | `unified`, `remark-parse`, `remark-frontmatter` | Identify syntax and source positions without hand-written Markdown parsing.  |
| Source discovery                    | `fast-glob`                                     | Find selected library files.                                                 |
| Pattern matching                    | `picomatch`                                     | Evaluate Veritas’s explicitly configured pattern semantics.                  |
| Runtime schemas                     | `zod`                                           | Validate configuration, canonical metadata, and adapter-specific extensions. |
| CLI                                 | `commander`                                     | Commands, options, help, and argument validation.                            |

These are documented implementations for those responsibilities. Notably, `remark-frontmatter` identifies frontmatter syntax but does **not** parse the YAML inside it; pairing it with `yaml` is intentional. [Eemeli](https://eemeli.org/yaml/?utm_source=chatgpt.com)

One implementation detail worth calling out: `fast-glob` returns results in arbitrary order, so Veritas must explicitly sort discovered files before compilation. [GitHub](https://github.com/mrmlnc/fast-glob)

Do not install several overlapping frontmatter or glob stacks without a reason. One chosen parsing pipeline is easier to test and maintain.

Pin dependency versions, commit the package lockfile, and make dependency review part of releases. “Established library” is a selection criterion, not a permanent security guarantee.

## Go is absolutely viable

Go has credible options here: the YAML organization’s maintained Go YAML fork, Goldmark for Markdown, and Doublestar for glob matching. I would not reject Go on the grounds that you would need to write those components yourself. [GitHub](https://github.com/yaml/go-yaml)

I would favor Go when **shipping a standalone executable without requiring Node is a primary deployment requirement**.

For your first version, I lean TypeScript because it aligns with your existing development workflow and the proposed schema/compiler design. I would not make throughput or startup performance the deciding factor for a tool primarily processing small collections of documents.

**Decision rule: choose TypeScript for implementation ergonomics; choose Go when runtime-free distribution outweighs that advantage.**

# 10. CLI, milestones, and release criteria

I would keep the initial command surface straightforward:

```bash
veritas init

veritas validate

veritas plan

veritas sync

veritas check

veritas update
```

| Command    | Contract                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------- |
| `init`     | Create configuration and report existing-file collisions.                                 |
| `validate` | Check schemas, references, patterns, packages, and target compatibility.                  |
| `plan`     | Show additions, changes, deletions, conflicts, and adaptations without modifying outputs. |
| `sync`     | Materialize the locked configuration safely.                                              |
| `check`    | Fail when the selected configuration and managed outputs disagree.                        |
| `update`   | Explicitly resolve a newer source revision and update the lockfile for review.            |

`check` is what makes this useful beyond an individual developer’s convenience script.

For v0.1, I would recommend committing the project configuration, lockfile, generated files, and deterministic manifest. A fresh clone then contains the approved guidance without requiring a setup command before someone starts their harness.

Keep caches, temporary files, and runtime locks uncommitted and worktree-local.

## Implementation sequence

| Milestone                             | Deliverable                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **1. Compatibility fixtures**         | Small representative rules and skills, expected native outputs, and explicit unsupported cases.              |
| **2. Canonical compiler**             | Parsing, schemas, profiles, normalized model, and deterministic in-memory generation.                        |
| **3. Three adapters**                 | Native steering and skill materialization, with combined-target collision checks.                            |
| **4. Safe synchronization**           | Plans, ownership manifest, conflict handling, stale-output removal, and CI checking.                         |
| **5. Distribution and certification** | Git source locking, offline regeneration, cross-platform tests, and documented harness compatibility ranges. |

The most important release tests are not just snapshots of attractive Markdown.

They should establish that repeated synchronization is a no-op; manually edited outputs are protected; malformed frontmatter fails before writing; unsupported activation produces a clear error; skill references survive installation; removed guidance is safely removed; and **all selected harnesses can coexist in the same checkout without unintended duplicate loading**.

Runtime smoke tests should supplement parser and snapshot tests. Where a harness’s actual loading behavior has not been tested, label the adapter behavior as documentation-based rather than certified.

# 11. Check the existing tools before committing to a standalone implementation

There is substantial overlap with existing projects.

**Rulesync** already describes unified configuration generation and lists rules and skills support for Codex, Claude Code, Kiro CLI, and Kiro IDE. **Ruler** also distributes rules and skills across these tools. [GitHub](https://github.com/dyoshikawa/rulesync)

I have not audited their implementations sufficiently to claim that they lack the guarantees proposed above.

Therefore, the first milestone should include running the same compatibility fixtures through those tools. That will tell us whether Veritas should be a standalone compiler, a thinner organizational layer over an existing engine, or a focused contribution upstream.

**The strongest reason to build Veritas is not “one source generates three folders.” It is “one reviewed, pinned source produces explainable, safely managed artifacts, with honest compatibility guarantees.”**

That is the version of this project I would design toward—and the boundary I would protect throughout v0.1.0.
