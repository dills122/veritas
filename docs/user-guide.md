# Veritas user guide

Hitting an error? See the [troubleshooting guide](troubleshooting.md) for every diagnostic code and its fix.

Veritas compiles a complete output set before planning writes. This guide describes `0.1.0-rc.0`. The original locally packed CLI walkthrough passed on macOS with Node 24; [TASK-015 evidence](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/evidence/TASK-015.md) records its commands, outcomes and limits.

## Install a locally packed candidate

Use Node 24 and npm 11. If you already have a candidate tarball, set its absolute path and create a disposable demo directory:

```sh
veritasDemoRoot=$(mktemp -d)
veritasDemoArchive=/absolute/path/to/veritas-0.1.0-rc.0.tgz
```

Alternatively, build and pack from the Veritas checkout. Use the filename printed by `npm pack` if the version changes:

```sh
# Run from the Veritas checkout.
npm ci
npm run build
veritasDemoRoot=$(mktemp -d)
npm pack --ignore-scripts --pack-destination "$veritasDemoRoot"
veritasDemoArchive="$veritasDemoRoot/veritas-0.1.0-rc.0.tgz"
```

Continue from either path. The tarball includes this guide and the example content; dependency installation needs registry access or an existing npm cache.

```sh
npm install --prefix "$veritasDemoRoot/tools" --ignore-scripts --no-audit --no-fund "$veritasDemoArchive"
veritasDemoPackage="$veritasDemoRoot/tools/node_modules/veritas"
cp -R "$veritasDemoPackage/examples/company-library" "$veritasDemoRoot/company-library"
mkdir "$veritasDemoRoot/project"
veritasDemoCli="$veritasDemoRoot/tools/node_modules/.bin/veritas"
"$veritasDemoCli" --version
"$veritasDemoCli" --help
```

The CLI comes from the specified tarball, not an npm package-name lookup. Keep these variables and temporary paths for the remaining walkthrough; no Veritas checkout is needed after installation.

Later examples use `veritas` as shorthand for this installed executable. Use `"$veritasDemoCli"` or put its tools directory on your PATH. The Git URL and `/path/to/consumer` examples are placeholders to replace with your repository and project.

## Initialize, preview and synchronize

```sh
"$veritasDemoCli" init --project "$veritasDemoRoot/project" --source ../company-library --profile company/baseline --targets codex,claude,kiro-ide
"$veritasDemoCli" validate --project "$veritasDemoRoot/project"
"$veritasDemoCli" plan --project "$veritasDemoRoot/project"
"$veritasDemoCli" sync --project "$veritasDemoRoot/project"
"$veritasDemoCli" check --project "$veritasDemoRoot/project"
```

`init` writes new configuration and source lock files and stores a verified immutable snapshot. It does not generate guidance. Its JSON result includes `data.guidance` and `data.generationPreview` with existing guidance, collisions and shadows. Control initialization can succeed while `generationBlocked` is true; resolve those findings before sync. A local source path is relative to the consuming project's configuration directory. Use a dedicated library directory: a source root equal to or containing the consuming project is rejected to keep its runtime/cache out of snapshots. A sibling library or a dedicated child library directory works. The profile is qualified by namespace, such as `company/baseline`. Targets are `codex`, `claude`, `kiro-ide` and `kiro-cli`.

`validate` checks schemas, package references, capabilities and composition. `plan` shows the complete ordered change set and ownership conflicts. `sync` applies only a complete conflict-free plan; explicit invocation authorizes the write. `check` reads drift without writing and is suitable for CI. Normal validate/plan/sync/check commands use locked cached upstream inputs, without fetching or changing pins.

The baseline example produces shared `AGENTS.md`, a Claude import route and complete skills in native directories. Kiro consumes the same baseline. Native conditional rules do not duplicate shared always-on text. A shadowing instruction file produces an explicit failure rather than a changed loading route.

## Add project-specific guidance

Copy local additions into a new consumer before initialization:

```sh
mkdir -p "$veritasDemoRoot/with-local/.veritas"
cp -R "$veritasDemoPackage/examples/local-overlay" "$veritasDemoRoot/with-local/.veritas/local"
"$veritasDemoCli" init --project "$veritasDemoRoot/with-local" --source ../company-library --profile company/baseline --targets codex,claude,kiro-ide --local .veritas/local --local-profile project
"$veritasDemoCli" plan --project "$veritasDemoRoot/with-local"
"$veritasDemoCli" sync --project "$veritasDemoRoot/with-local"
```

Local additions are another declarative `veritas.library.yaml` with an explicit profile and source namespace `local`. Edit `.veritas/local/steering/project-context.md`, then plan and synchronize. Local additions are current repository content rather than an upstream pin, so changes affect the next plan without fetching. Local and upstream skill names must not collide, even when bytes match.

## Author a library

The [company manifest](../examples/company-library/veritas.library.yaml) declares steering IDs/paths, skill names/directories and profiles with explicit selections. Profiles do not inherit. Canonical steering begins with strict YAML frontmatter:

```yaml
---
id: typescript
description: Apply TypeScript guidance to matching source files.
activation:
  mode: files
  patterns: ['src/**/*.ts']
targets: [claude, kiro-ide, kiro-cli]
---
```

The id must match its declaration. Activation mode is `always`, `files`, `manual` or `auto`; files requires positive portable patterns. Optional targets explicitly restrict consumers. Auto uses the description for relevance. Native harness imports are not allowed in the body; ordinary Markdown links are references. Inline/fenced code can contain literal import examples.

A skill directory matches its standard name and contains `SKILL.md` with name and description. Optional license, compatibility and string metadata are validated. All supporting files, binary assets, README/license content, executable intent and relative references travel with it. Veritas never runs companion scripts. Unknown metadata controls, advanced invocation/tool restrictions and native invocation sidecars fail explicitly in this candidate.

YAML aliases, merge keys, custom tags and duplicate keys are unsupported. YAML/selected Markdown must be valid UTF-8 without a BOM. Steering bodies normalize CRLF to LF without reformatting prose. Paths cannot escape packages, traverse symlinks or collide by case. Parsed Markdown links/images/definitions must resolve inside the skill after one percent decode. HTTPS/mail links are not fetched; fragment-only references are preserved without anchor certification.

Limits are 1 MiB per steering/SKILL/config document, 10 MiB per asset, 100 MiB per snapshot, 10,000 entries, 16 path segments and 1,000 rules/skills each. Errors identify the violating source.

## Choose conditional compatibility deliberately

`company/native-typescript` restricts conditional guidance to Claude/Kiro. Codex receives the baseline and skill, while that rule is explicitly outside its selection. The [native template](../examples/project/native-typescript.yaml) shows this arrangement.

Unrestricted `company/typescript` with Codex and no adaptation produces `ACTIVATION_UNSUPPORTED`, exit 2 and no generated writes. For explicit Codex-only broadening, use the [adaptation template](../examples/project/codex-adaptation.yaml):

```yaml
compatibility:
  adaptations:
    - rule: company/typescript
      target: codex
      kind: files-to-always
```

That exact rule/target becomes always-on and emits `ACTIVATION_ADAPTED`. With Claude/Kiro also selected, a shared AGENTS rule must be always-on for every consumer of it. Adapting only Codex while others remain conditional fails `SHARED_SCOPE_LEAK`. Restrict native guidance outside Codex, choose a Codex-only project, or explicitly adapt every selected consumer that must read the shared rule.

For a fresh adapted project, establish the source lock using the supported baseline and the same Codex target first. Then copy the template and preview the changed selection:

```sh
mkdir "$veritasDemoRoot/adapted"
"$veritasDemoCli" init --project "$veritasDemoRoot/adapted" --source ../company-library --profile company/baseline --targets codex
cp "$veritasDemoPackage/examples/project/codex-adaptation.yaml" "$veritasDemoRoot/adapted/veritas.yaml"
"$veritasDemoCli" validate --project "$veritasDemoRoot/adapted"
"$veritasDemoCli" plan --project "$veritasDemoRoot/adapted"
"$veritasDemoCli" sync --project "$veritasDemoRoot/adapted"
"$veritasDemoCli" check --project "$veritasDemoRoot/adapted"
```

`init` requires absent config and lock paths. Copying a template before init prevents initialization; `update` also requires an existing lock. Changing the selected library profile within this snapshot works without fetching because the target/profile versions and source descriptor still match the baseline lock. If you change those contracts or the source location, review and explicitly update the lock before planning.

Manual/auto steering is native only for the Kiro profiles and fails for Codex/Claude. A positive pattern matching no current project file remains in output with a warning, so future files can match. Source discovery does not redefine activation semantics.

## Resolve and update a Git source

Git initialization requires an explicit ref:

```sh
veritas init --project /path/to/consumer --source ssh://git@git.example.com/platform/standards.git --ref v1.0.0 --profile company/baseline --targets codex,claude,kiro-ide
```

Validated HTTPS and scp-style SSH locators are also supported. Embedded credentials and arbitrary executable transports are rejected. Imported hooks, scripts and submodules are not executed. Ordinary SSH/credential-helper authentication remains available without exposing credentials in provenance.

The lock records the resolved commit/tree digest. A moving tag does not change normal sync. To select a new intended pin, edit the source ref in `veritas.yaml`, then:

```sh
veritas update --project /path/to/consumer
veritas plan --project /path/to/consumer
veritas sync --project /path/to/consumer
```

Update changes lock/cache and reports pending generation; outputs wait for sync. Explicit update also incorporates local upstream changes into a new snapshot. Changing a profile within the same available snapshot does not fetch; source/target/compiler-profile changes must satisfy lock compatibility.

Restore a missing locked cache explicitly:

```sh
veritas update --restore --project /path/to/consumer
```

Restore verifies the existing digest and leaves lock bytes unchanged. Local restore requires current upstream bytes to match the locked tree; changed bytes require an intentional update. Corrupt caches never silently fall back to live source content.

## Preserve ownership and migrate existing content

`.veritas/manifest.json` records generated paths, hashes, executable intent, source identities and consumers. Matching a valid recorded state permits replacement/deletion; edited managed files conflict. Identical unmanaged bytes still conflict.

The [troubleshooting guide](troubleshooting.md#output_conflict) walks through migrating an existing `AGENTS.md` or skill step by step. Preserve backups or version-controlled copies of existing guidance. Convert reviewed content into canonical upstream/local entries and retain complete skill support files. Inspect validation and desired content before removing or relocating colliding original paths. Then plan and sync into available paths. There is no force, implicit adoption, automatic migration or bulk-overwrite mode.

Commit configuration, source lock, deterministic manifest, local additions and generated artifacts together. Exclude `.veritas/runtime/` from version control: cache, lock, stage and recovery state are machine-local. Extra unmanaged files inside skill directories are not removed as stale content.

## Recover interrupted writes

Mutators use an exclusive repository-local lock. Prepared transactions preserve staged bytes, backups and a validated runtime journal. Read-only commands report incomplete transactions and do not recover silently.

```sh
veritas recover --project /path/to/consumer
```

Recovery validates all affected files before acting. A committed manifest or source lock and matching after-state allow cleanup; source initialization/update commit through the source lock. A consistent uncommitted transaction allows rollback of recorded before/after states. External edits, unsafe paths, corrupt journals or inconsistent controls block recovery and preserve evidence. Resolve the exact conflict; do not erase the manifest or journal to make the command appear clean.

There is no `recover --unlock` or automatic stale-lock stealing in this candidate. A remaining lock requires manual owner investigation: preserve the exact lock, journal, stages and backups; establish the originating process identity and abandonment independently; recheck that the lock is unchanged before removing only that verified abandoned lock. Then run normal recovery. A PID or nonce alone cannot prove abandonment, and a missing PID check does not certify process identity or exclude PID reuse. Live, ambiguous or reused-PID ownership stays blocked. Do not recursively remove runtime state. [TASK-011 evidence](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/evidence/TASK-011.md) records injected-failure recovery and the unverified process-death/PID-reuse limits; this candidate provides no certified automatic abandonment procedure. Removing a lock does not authorize overriding file conflicts.

Representative injected interrupted-write recovery passed. Actual process kills, exhaustive crash permutations, automatic abandoned-lock removal and broad platform/power-loss durability are follow-up.

## Structured output and exit codes

Human output summarizes initialization, validation, sync, update and recovery. `plan` lists changed or conflicting paths; a clean `check` reports that generated files and the manifest are up to date. Diagnostics and remediation appear on stderr. Use `--json` for full hashes, provenance, compatibility and ordered operations.

Every command accepts project selection and JSON:

```sh
veritas plan --project /path/to/consumer --json
veritas check --project /path/to/consumer --json
```

JSON stdout is one envelope containing schemaVersion, command, outcome, diagnostics and data. Diagnostic codes are stable with qualified source locations where available. JSON excludes progress prose, color, unstable stacks and credentials.

When sync refuses a conflicted plan, its result retains the original conflict diagnostics and paths, plus `PLAN_CONFLICT` with a suggestion to inspect `plan`. Its JSON `data` contains the refused plan. No part of that plan is applied.

| Exit | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| 0    | Success; an ordinary changing plan also succeeds           |
| 1    | Check found output/manifest drift                          |
| 2    | Invalid content/configuration or unsupported compatibility |
| 3    | Ownership conflict or unsafe path                          |
| 4    | Source/cache/operational failure                           |
| 5    | Busy or incomplete transaction requiring attention         |

Failure precedence is 5, 3, 2, 4, then 1. A conflict prevents the entire sync, including otherwise safe operations.

## Understand compatibility labels

Bundled profiles are `codex-repo-v1`, `claude-repo-v1`, `kiro-ide-repo-v1` and `kiro-cli-repo-v1`; these are Veritas profile versions, not installed harness versions. Kiro CLI means V3. Legacy Kiro and custom-agent resource configurations are unsupported.

Profiles remain documentation-based until exact harness versions/settings and observed loading evidence certify them. Generated files alone do not establish loading or enforcement. Global/nested unmanaged guidance and nondefault settings limit claims even when bytes are correct. macOS with Node 24 is the initial candidate verification environment; hosted macOS/Linux package checks also passed. Windows and live harness certification remain follow-up. See the [compatibility matrix](compatibility.md) and [source research](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/research/compatibility.md).
