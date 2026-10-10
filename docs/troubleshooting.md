# Troubleshooting Veritas

Every diagnostic prints a stable code, a location when one exists, and usually a fix hint:

```text
error OUTPUT_CONFLICT AGENTS.md: Existing output is unmanaged; ...
  Copy wanted content into your library or local additions, then ...
```

Find the code below. Exit codes: `0` success, `1` `check` found drift, `2` invalid input or configuration, `3` conflict, `4` operational failure, `5` busy or incomplete transaction. Add `--json` for machine-readable diagnostics. New to the terms (library, profile, manifest)? See the [glossary](glossary.md). Veritas never writes anything when a command fails, except an interrupted write that `veritas recover` can finish or roll back.

**Safety model in one paragraph.** Veritas only changes files it can prove it generated. If a path already exists and Veritas did not create it, or it was edited after Veritas created it, Veritas stops and tells you. There is deliberately no `--force`. The fix is always to move the content you care about into your library (or local additions) so Veritas generates it, then let Veritas own the path.

## Setup and project selection

### PROJECT_NOT_FOUND

`--project` points to a directory that does not exist. Without `--project`, Veritas uses the current Git root, then the current directory. Run from inside the repository or pass an existing directory.

### CONTROL_MISSING

`veritas.yaml` or `veritas.lock.json` is missing. Run `veritas init` first. If you deleted the lock by accident, restore it from Git. Re-running `init` is refused while either file exists (`INIT_CONFLICT`).

### INIT_CONFLICT

`init` only creates a new project. To change an existing project, edit `veritas.yaml` and run `veritas update`. To start over, delete `veritas.yaml` and `veritas.lock.json` yourself, then run `init`; generated files stay tracked through `.veritas/manifest.json`.

### RUNTIME_NOT_IGNORED

A warning. `.veritas/runtime/` holds the snapshot cache, locks and recovery state. It is machine-local and should not be committed:

```sh
echo '.veritas/runtime/' >> .gitignore
```

Do commit `veritas.yaml`, `veritas.lock.json`, `.veritas/manifest.json` and the generated files. Fresh clones rebuild the cache with `veritas update --restore`.

## Sources

### SOURCE_READ_FAILED

The local library directory could not be read. The message says whether it does not exist, is not a directory, or is unreadable. A relative `--source` resolves from the project directory (or the directory holding `veritas.yaml`), not from your shell's current directory. The directory must contain `veritas.library.yaml`.

### SOURCE_ROOT_CONTAINS_PROJECT

The library directory equals or contains the consuming project, so Veritas would snapshot its own cache. Use a sibling directory, or a dedicated child directory such as `agent-library/` that does not contain the project root.

### SOURCE_REF_REQUIRED / SOURCE_REF_INVALID

Git sources must pin an explicit `--ref` (branch, tag or commit): `--source https://github.com/acme/agent-library.git --ref v1.2.0`. `--ref` is invalid for local sources.

### GIT_FAILED, GIT_TIMEOUT, GIT_UNAVAILABLE

Veritas runs Git non-interactively and never prints raw Git output, because it can contain credentials. The hint under the error classifies the failure:

| Hint | Meaning and fix |
| --- | --- |
| Authentication failed | Veritas never prompts for a password. Configure a Git credential helper or an SSH agent. Check with `git ls-remote <url>` in your shell. |
| The remote is unreachable | DNS, VPN, proxy or network problem. Retry once the host resolves. |
| Repository was not found | Typo in the URL, or no access. Check with `git ls-remote <url>`. |
| Ref could not be fetched | `--ref` does not name an existing branch, tag or commit. |
| `GIT_UNAVAILABLE` | Git is not installed or not on `PATH`. |

Only HTTPS and SSH URLs are accepted. `file://` and `ext::` are rejected on purpose.

### LOCK_MISMATCH

`veritas.yaml` no longer matches `veritas.lock.json`, typically because you changed a source, profile or target. This is intended: routine commands never silently re-resolve. Run `veritas update`, then `plan` and `sync`. To abandon the edit, restore `veritas.yaml` from Git.

### CACHE_MISSING

The pinned snapshot is not in `.veritas/runtime/cache/`. This is expected in a fresh clone or CI job because the cache is machine-local. Run `veritas update --restore`; it rebuilds the cache from the pinned source and leaves `veritas.lock.json` unchanged. For Git sources it needs network access and credentials.

### RESTORE_MISMATCH

`veritas update --restore` found that the source no longer matches the pinned snapshot. Run `veritas update` to accept the new content, or point the source at the original version.

## Output conflicts

### OUTPUT_CONFLICT

A path Veritas wants to write is not in the state it expects. Nothing was written. Which case applies is in the message:

**"Existing output is unmanaged"** - the file existed before Veritas, typically a hand-written `AGENTS.md`, `CLAUDE.md` or skill. Identical bytes still count: Veritas will not adopt a file implicitly. To migrate:

1. Copy the content you want to keep into a steering file in your library, or into local additions (`veritas init --local .veritas/local`; see the [user guide](user-guide.md#add-project-specific-guidance)).
2. Rename or delete the original (`git mv AGENTS.md AGENTS.old.md`).
3. Run `veritas plan`, then `veritas sync`. Veritas now creates and owns the file.

**"Managed output was modified outside Veritas"** - someone edited a generated file. See what changed with `git diff -- <path>`. Then either:

- the edit is wanted: move it into your library or local additions, then delete the generated file (or `git checkout -- <path>`) and run `sync`; or
- the edit is not wanted: `git checkout -- <path>` and run `sync`.

Generated files are overwritten by the next sync of their source, so edits made directly to them are never durable.

**A link or special file** - a symbolic link, hard link or non-regular file sits at a generated path. Replace it with an ordinary file or remove it.

**Fastest way to migrate:** `veritas adopt <path>` copies the file into your library (see the [user guide](user-guide.md#adopt-existing-guidance)); then delete or rename the original. Use `veritas plan --diff` to see exactly how an existing file differs from what Veritas would write.

### SHARED_SCOPE_LEAK

`AGENTS.md` is read by every Codex-style consumer, so a rule that is conditional for Claude or Kiro cannot be shared with Codex without widening it. Choose one: restrict the rule to native targets (`targets: [claude, kiro-ide]` in its frontmatter), select Codex only, or adapt every selected consumer. See [conditional compatibility](user-guide.md#choose-conditional-compatibility-deliberately).

### ACTIVATION_UNSUPPORTED

A rule uses an activation mode (such as file globs) that a selected target cannot honor, and no explicit adaptation was configured. Veritas will not broaden a rule silently. Restrict the rule to targets that support it, drop the target, or opt in:

```yaml
compatibility:
  adaptations:
    - rule: company/typescript
      target: codex
      kind: files-to-always
```


## Scaffold, adopt and stale sources

| Code | Cause and fix |
| --- | --- |
| `SCAFFOLD_EXISTS` | `init --scaffold` found the directory already there and created nothing. To use it, `init --source <dir> --profile <ns>/<profile>`. |
| `SCAFFOLD_PATH_INVALID` | The `--scaffold` directory must be a dedicated relative directory, not `.`, `.veritas` or the runtime directory. |
| `ADOPT_NO_LIBRARY` | There is no writable project library: the source is a Git repository, or the library is outside the project. Add a `local` additions library or run `init --scaffold` in a new project. |
| `ADOPT_ALREADY_MANAGED` | The path is generated by Veritas. Edit the library source; generated files are overwritten. |
| `ADOPT_PATH_INVALID` | Missing path, symlink, non-UTF-8 or oversized file, a skill directory without `SKILL.md`, or a path inside the library or `.veritas/runtime`. |
| `ADOPT_ID_EXISTS` / `ADOPT_ID_INVALID` | Name collision or invalid characters. Pass `--id`. |
| `ADOPT_FRONTMATTER_UNSUPPORTED` | The file has frontmatter Veritas cannot map. Adopt a copy without it, or write the library entry by hand. |
| `ADOPT_TARGETS_INVALID` | `--targets` must list `codex`, `claude`, `kiro-ide` or `kiro-cli`. |
| `SOURCE_STALE` | A warning. A local-path source changed after it was locked, so results use the old snapshot. Run `veritas update`. |

Adopt validates before finishing; validation errors such as `NATIVE_IMPORT_UNSUPPORTED` leave your library exactly as it was.

## Library authoring errors

Errors point at `file:line:column`. Common ones:

| Code | Cause |
| --- | --- |
| `SCHEMA_INVALID` | Unknown or mistyped key, or a wrong value. The message names the key path. Unknown keys are rejected, so typos surface early. |
| `YAML_INVALID`, `YAML_UNSUPPORTED` | Syntax error. Aliases, merge keys, custom tags and duplicate keys are not allowed. Fix the first reported error; later ones are often follow-ons. |
| `PACKAGE_MISSING` | A declared skill directory has no `SKILL.md`, or the directory name does not match the declaration. |
| `IDENTITY_MISMATCH` | Steering frontmatter `id` differs from its `veritas.library.yaml` declaration. |
| `YAML_EMPTY` | The file exists but is empty. Restore it, or for a library manifest declare `schemaVersion: 1` with steering, skills and profiles. |
| `LIBRARY_MANIFEST_MISSING` | The source root has no `veritas.library.yaml`. For Git sources the repository root is the library root; subdirectories cannot be sources. |
| `PROFILE_UNKNOWN` | `--profile` names a profile the library does not declare. Use `namespace/profile` where the namespace is the source name in `veritas.yaml`. |
| `NATIVE_IMPORT_UNSUPPORTED` | Steering contains a harness-native import such as `@file`. Use ordinary Markdown links, or put the text in a code block. |
| `REFERENCE_MISSING`, `REFERENCE_UNSAFE` | A skill links to a file that does not exist or escapes the skill directory. |
| `SKILL_CONTROL_UNSUPPORTED` | A skill uses invocation or tool restrictions this release cannot translate faithfully. It fails explicitly rather than dropping the restriction. |
| `LIMIT_EXCEEDED` | A file or snapshot is over the documented size or count limits. |

## Interrupted or concurrent runs

### Exit 5 / incomplete transaction / lock held

Another Veritas process is writing, or a previous run was killed mid-write. First make sure no other `veritas` process is running, then:

```sh
veritas recover
```

Recovery validates every affected file and either finishes or rolls back the write. If recovery refuses because a file changed externally, resolve that file first; do not delete the ownership manifest (`.veritas/manifest.json`) or the journal. A lock that remains after recovery needs manual owner investigation; see [recover interrupted writes](user-guide.md#recover-interrupted-writes).

## Using Veritas in CI

```sh
veritas check --project .
```

Exit `0` means generated files match the lock and ownership manifest. Exit `1` means drift: run `veritas sync` locally and commit the result. Exit `3` means someone hand-edited a generated file. `check` never fetches or changes pins.

A fresh CI checkout has no cache, so restore it first:

```sh
veritas update --restore && veritas check
```

Local libraries need no credentials. A Git source needs network access and credentials for the restore step only.

## Still stuck?

Run the failing command with `--json` and include the diagnostics, your Node version (`node --version`; Node 24 is required), and `veritas --version` in an issue.
