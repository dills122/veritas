# Veritas glossary

A quick reference for the words Veritas uses. New here? Read [The big picture](#the-big-picture), then skim the tables.

## The big picture

A **library** holds your steering and skills. Each **consumer** repo points at a library from `veritas.yaml`, pins it in `veritas.lock.json`, and runs `plan` / `sync` to generate the files each agent harness reads.

```text
library (steering + skills)  ──pinned by lock──▶  consumer repo  ──sync──▶  AGENTS.md, CLAUDE.md, skills/…
```

## Content (what you write)

| Term | Meaning |
| --- | --- |
| **Library** | A plain directory of steering and skills with a `veritas.library.yaml`. Not an npm package or workspace library. Can be a Git repo, a sibling folder, or a folder inside the consumer. |
| **Library manifest** | `veritas.library.yaml`. Declares the steering, skills and profiles a library contains. |
| **Steering** (rule) | A Markdown file of agent instructions with frontmatter: `id`, `description`, `activation`. |
| **Skill** | A directory with `SKILL.md` and any supporting files. Copied whole; never executed. |
| **Activation mode** | When steering applies: `always`, `files` (globs), `manual` or `auto`. Not every target supports every mode. |
| **Library profile** | A named bundle of steering and skills in the library manifest, e.g. `baseline`. Profiles do not inherit. |
| **Local additions** (overlay) | A project-owned second library layered on the upstream one with `--local`. |

## Project (what a consumer has)

| Term | Meaning |
| --- | --- |
| **Consumer** | A repo that runs Veritas against a library. |
| **Project config** | `veritas.yaml`. Picks the source, library profile, targets and adaptations. |
| **Source** | Where the library comes from: a local path, or a Git URL with `--ref`. Exactly one is required. |
| **Namespace** | The source's name in `veritas.yaml`. In `company/baseline`, `company` is the namespace and `baseline` the library profile. |
| **Target** | A harness to generate for: `codex`, `claude`, `kiro-ide`, `kiro-cli`. |
| **Target profile** | Veritas's compatibility definition for a target, e.g. `codex-repo-v1`. Written by `init`. |
| **Adaptation** | An explicit opt-in to change a rule's behavior for one target (e.g. `files-to-always`). Never applied silently. |

## State and ownership

| Term | Meaning |
| --- | --- |
| **Snapshot** | An immutable copy of the library, identified by a content hash. |
| **Lock** | `veritas.lock.json`. Pins the project to one snapshot. Only `init` and `update` change it. |
| **Runtime / cache** | `.veritas/runtime/`. Machine-local snapshots, locks and recovery state. Add it to `.gitignore`. |
| **Ownership manifest** | `.veritas/manifest.json`. Records every generated file and its hash. Commit it. |
| **Managed** | A file Veritas generated and recorded. Safe to replace while unedited. |
| **Unmanaged** | A file Veritas did not create. Never overwritten. |
| **Drift** | Generated files differ from what `sync` would write. `check` exits 1. |
| **Conflict** | A path is unmanaged or a managed file was hand-edited. Nothing is written; exit 3. |
| **Diagnostic** | A coded message such as `OUTPUT_CONFLICT`, with a fix hint. See [troubleshooting](troubleshooting.md). |

## Commands

| Command | Does |
| --- | --- |
| `init` | Creates `veritas.yaml` and the lock. Generates no guidance. |
| `validate` | Checks content and target compatibility. Writes nothing. |
| `plan` | Previews every create, replace and delete. Writes nothing. |
| `sync` | Applies a complete, conflict-free plan, or changes nothing. |
| `check` | Read-only drift check for CI. |
| `update` | Re-resolves the source and moves the lock. `--restore` rebuilds a missing cache. |
| `recover` | Finishes or rolls back an interrupted write. |
| `adopt` | Copies existing guidance into the project library as new files. Never touches the original. |
| `init --scaffold` | Creates a starter library for the project and initializes it in one step. |
| `plan --diff` / `check --diff` | Adds a unified diff for replaced and conflicting files. |

## Easy to confuse

- **Manifest** is two files: the *library manifest* (`veritas.library.yaml`) and the *ownership manifest* (`.veritas/manifest.json`).
- **Profile** is two things: a *library profile* (a bundle) and a *target profile* (harness compatibility).
- **Local** is two things: a *local-path source* and *local additions*.
