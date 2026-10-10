# Veritas

[![Verify](https://github.com/dills122/veritas/actions/workflows/ci.yml/badge.svg)](https://github.com/dills122/veritas/actions/workflows/ci.yml) [![Dependency audit](https://github.com/dills122/veritas/actions/workflows/security.yml/badge.svg)](https://github.com/dills122/veritas/actions/workflows/security.yml)

Veritas compiles a reviewed library of steering and complete skills into repository guidance for Codex, Claude Code and Kiro. It pins upstream inputs, makes compatibility loss explicit, protects unmanaged or edited files, and supports reviewable plans and CI drift checks.

The original `0.1.0-rc.0` candidate follows the accepted [4–6-hour orchestration schedule](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/orchestration-plan.md). Its locally packed CLI passed the documented workflow on macOS with Node 24, including pinned updates, cache restore, local additions and ownership protection. [Original verification evidence](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/evidence/TASK-015.md) records the checks and limits. No public npm installation or live harness certification is claimed.

## What you get

Keep one reviewed library of steering and skills. Veritas turns it into the files each agent harness actually reads, and refuses to guess when a harness cannot honor something:

```text
your-library/                         your-repo/
  steering/baseline.md      ──┐         AGENTS.md            (Codex, Kiro)
  steering/typescript.md    ──┼─veritas─▶ CLAUDE.md            (Claude Code)
  skills/review-repository/ ──┘         .agents/skills/…     (Codex)
                                        .claude/skills/…     (Claude Code)
                                        .kiro/skills/…       (Kiro)
```

- **Reviewable.** `plan` shows every create, replace and delete before anything is written.
- **Pinned.** Upstream libraries are locked to an exact snapshot; routine commands never fetch.
- **Safe.** Files Veritas did not create, or that were edited by hand, are never overwritten. There is no `--force`.
- **Honest.** If a target cannot represent a rule (for example file globs in Codex), Veritas fails with a clear code instead of quietly changing behavior.
- **CI-friendly.** `veritas check` exits `1` on drift and `3` on hand-edited generated files.

## If something goes wrong

Every error prints a stable code and, where possible, the fix. New to the terms? See the [glossary](docs/glossary.md). The [troubleshooting guide](docs/troubleshooting.md) explains each code, including how to bring an existing `AGENTS.md` or `CLAUDE.md` under Veritas management and how to run `check` in a fresh CI checkout (`veritas update --restore && veritas check`). Add `.veritas/runtime/` to `.gitignore`: it is machine-local cache and recovery state.

## Quick start

Starting a repository without a shared library? One command creates a starter library and initializes the project; `veritas adopt <file>` then pulls existing `AGENTS.md`, Kiro steering, Claude rules or skills into it without touching the originals:

```sh
veritas init --scaffold --targets codex,claude,kiro-ide
veritas adopt AGENTS.md          # optional: bring existing guidance under management
veritas update && veritas plan --diff && veritas sync
```

The walkthrough below uses a shared example library instead.

Use Node 24 and npm 11. To try a provided candidate tarball, replace the absolute archive path below. The package includes the user guide and example library; npm installs its runtime dependencies without building Veritas or running imported scripts.

```sh
veritasDemoRoot=$(mktemp -d)
npm install --prefix "$veritasDemoRoot/tools" --ignore-scripts --no-audit --no-fund /absolute/path/to/veritas-0.1.0-rc.0.tgz
veritasDemoPackage="$veritasDemoRoot/tools/node_modules/veritas"
cp -R "$veritasDemoPackage/examples/company-library" "$veritasDemoRoot/company-library"
mkdir "$veritasDemoRoot/project"
veritasDemoCli="$veritasDemoRoot/tools/node_modules/.bin/veritas"
"$veritasDemoCli" init --project "$veritasDemoRoot/project" --source ../company-library --profile company/baseline --targets codex,claude,kiro-ide
"$veritasDemoCli" validate --project "$veritasDemoRoot/project"
"$veritasDemoCli" plan --project "$veritasDemoRoot/project"
"$veritasDemoCli" sync --project "$veritasDemoRoot/project"
"$veritasDemoCli" check --project "$veritasDemoRoot/project"
```

Human output summarizes results and lists planned changes. Add `--json` for complete provenance, hashes and diagnostics. Init requires an explicit source, qualified profile and targets; there are no defaults. Keep the demo paths for the [user guide](docs/user-guide.md), which also covers creating a tarball from a checkout and adapting conditional guidance.

For development, run from a source checkout:

```sh
npm ci
npm run build
node examples/verify.mjs
```

The [user guide](docs/user-guide.md) explains packed local installation and the `init → validate → plan → sync → check` workflow in a disposable consuming repository. [Examples](examples/README.md) cover a shared baseline, native conditional guidance, explicit adaptation and project additions. Veritas never executes imported skill scripts.

Codex's profile supports always-on steering; Claude adds native file-scoped rules; Kiro IDE and CLI V3 add manual/auto modes. Advanced invocation/tool controls fail explicitly in this candidate. Profiles are documentation-based, and macOS is the initial verification environment. See the [compatibility matrix](docs/compatibility.md) for the distinction between generated fixtures and observed harness loading.

Existing guidance does not become managed merely because its bytes match. Move reviewed content into the canonical library or local additions, resolve conflicting paths deliberately, then preview the complete plan. There is no implicit adoption or force-overwrite option.

Development checks, from a source checkout:

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:integration
npm run test:package
```

The tagged [planning guide](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/README.md) maps authoritative requirements, technical contracts and decisions. The [original autonomous handoff](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/autonomous-handoff.md) preserves the execution entry point; [design.md](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/design.md) preserves the original proposal. [Bootstrap instructions](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/bootstrap.md) describe the optional AI Central, Serena and codebase-memory tools. Their setup checks remain available in the source checkout:

```sh
python3 scripts/verify-bootstrap.py
python3 scripts/check-planning.py
serena memories check
```

GitHub CI runs quality/unit checks, macOS and Linux integration/installed-package checks, the complete CLI examples and dependency audits. Candidate archives and checksums are retained as run artifacts. Dependabot proposes weekly dependency and pinned Action updates. See [repository setup](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/github-setup.md) for release tagging and contribution checks.

The package is currently marked `UNLICENSED`. This candidate is distributed through GitHub; no npm registry publication is configured.
