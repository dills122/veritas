# Veritas product specification

Veritas v0.1 lets a team maintain one reviewed library of steering and skills, pin its source, and reproducibly generate repository-local guidance for Codex, Claude Code, and Kiro. Generated artifacts have explicit ownership and compatibility evidence. Veritas does not guarantee identical model behavior or enforcement of prose instructions.

## Users and successful workflows

A library maintainer authors declarative Markdown and complete skill directories. A repository maintainer selects a library profile and supported target profiles, previews the result, and commits the source pin with generated artifacts. CI checks drift without changing output. An existing-file owner sees conflicts and can manually migrate content into local canonical sources before generation.

The first useful slice is a local library with one always-on rule and one skill: init, validate, plan, sync, check, and a second sync that changes no managed bytes. Git sources and additional steering modes extend the same core contracts.

## Scope

Include one local or Git upstream library, one selected upstream profile, an optional local project library/profile, four canonical steering activation modes, portable skill packages, three adapter families with separate Kiro surface profiles, explicit compatibility diagnostics, deterministic plans, safe materialization, ownership manifests, source update, offline cached regeneration, and CI checks.

Defer hosted service, frontend, global/home-directory output, background monitoring, marketplaces, dynamic plugins, multiple upstreams/transitive dependencies, inheritance, automatic bidirectional merging, nested AGENTS generation, AGENTS overrides, hooks, MCP/permission-policy configuration, subagent synchronization, arbitrary native file passthrough, and automatic migration/adoption. Repository tool bootstrap is infrastructure for developing Veritas, not a product feature to implement.

## Requirements

| ID | Contract | Observable acceptance |
| --- | --- | --- |
| REQ-001 | Declarative configuration and selection | Versioned strict schemas; one upstream profile plus optional local profile; duplicate/unknown IDs fail before writes |
| REQ-002 | Locked provenance | Git pins resolve to an immutable commit and tree digest; local upstreams resolve to a content snapshot; routine commands never move pins |
| REQ-003 | Valid content packages | Canonical rule metadata and standard skill identity validate; complete assets preserve bytes, references, and normalized executable semantics |
| REQ-004 | Honest compatibility | Every selected rule/target has native, adapted, or unsupported status; unaccepted loss and unmapped restrictions fail |
| REQ-005 | Combined target safety | Selected consumers of every artifact are modeled; restricted guidance does not leak into a shared baseline; loading/path collisions fail |
| REQ-006 | Deterministic compilation | Same effective inputs and compiler profile yield identical artifact bytes, hashes, stable modes, diagnostics, and manifest |
| REQ-007 | Ownership protection | Unmanaged outputs, edited managed files, unsafe ancestors, and invalid manifests cannot be overwritten or implicitly adopted |
| REQ-008 | Recoverable synchronization | Lock, preconditions, staging, journal, backups, manifest commit, and recovery handle interruption without erasing later external edits |
| REQ-009 | Read only planning and CI | validate/plan/check do not mutate project control files or outputs, fetch network sources, or create a source snapshot; check reports all managed drift |
| REQ-010 | Intentional source update | init/update resolve explicit source selections; update changes lock only, reports old/new provenance, and leaves outputs for separate review |
| REQ-011 | Clear command contracts | Stable exit codes and full JSON envelopes; concise human summaries and discoverable help; refused sync retains conflict codes and locations; no force overwrite option |
| REQ-012 | Safe library processing | No skill/config execution; traversal, symlinks, hardlinked local input files, unsafe modes, case collisions, and resource abuse fail |
| REQ-013 | Initial distribution | One ESM CLI/core package; Node 24 and clean macOS consumer execution; Linux/Windows certification is follow-up |
| REQ-014 | Evidence based compatibility | Versioned adapter profiles carry source URLs and status; release docs distinguish documentation-based output from observed harness loading |
| REQ-015 | Usable adoption and authoring | Packaged guide and example library/project, collision inventory, local-edit workflow, adaptation bootstrap, update review and recovery instructions work from a clean consumer or clone |

## Behavior boundaries

`init` inventories existing guidance and writes new config/lock only if those control paths are absent; it never rewrites existing guidance. Source selection is explicit. `update` resolves the configured requested ref or local upstream tree and replaces the lock safely, without changing generated output. First source resolution may require network access; normal regeneration uses a verified local snapshot.

`validate` checks current config, lock, selected packages, compatibility, and combined output viability. `plan` adds current manifest/output comparison. `sync` takes the same plan under a lock and applies it only if conflict-free. `check` performs the same comparison read-only and returns drift even for mode or manifest/provenance disagreement. The CLI also exposes `recover` to roll back an interrupted write safely; this necessary command is added to the initial proposal.

Project-local additions are edited in place and selected from their own manifest/profile. They do not implicitly override upstream IDs or skill names. Their current digest contributes to compilation identity, so a local edit appears in plan/check and needs a sync to update output. A local upstream source is different: it is pinned and changes only through update.

Generated files, configuration, lockfile, and deterministic ownership manifest are intended for Git review. Source snapshots and runtime locks/journals are worktree-local cache/state. Nothing writes to the user's home directory.

## Priority and completion

P0 covers correctness and content safety: REQ-001 through REQ-012, except the Git extension of REQ-002/010 can follow the initial local vertical slice. P1 covers distribution, honest certification, and clean authoring/adoption: REQ-013 through REQ-015. P2 is the deferred scope above. P0 is not permission to ship without P1; both are required for the v0.1 release candidate.

A requirement is complete only when its task, acceptance tests, exact executed evidence, and integrated review are present in [Test strategy](test-strategy.md). Public publishing and live harness certification need their own external access; missing access is explicitly reported, never simulated as a pass.

## Accepted release candidate boundary

The implementation run targets a usable 0.1.0 local release candidate in 4–6 active hours. Core source pinning, parsing, three pure adapter families, combined-target checks, ownership protection, drift detection and recoverable sync remain required. Prioritize representative observable safety tests over an exhaustive permutation campaign. The candidate is packaged and verified on macOS with Node 24.

Live harness certification, Linux/Windows runtime certification, advanced native invocation/tool controls, exhaustive crash/platform permutations and automatic abandoned-lock removal are follow-up work. All advanced restrictions remain explicit unsupported errors; no control is silently dropped to fit the budget. Keep profiles documentation-based until observed loading evidence exists. A deadline does not convert a failed safety gate into a pass; if required behavior is incomplete at six hours, deliver an explicitly incomplete checkpoint.
