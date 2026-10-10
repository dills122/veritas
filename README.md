# Veritas

[![Verify](https://github.com/dills122/veritas/actions/workflows/ci.yml/badge.svg)](https://github.com/dills122/veritas/actions/workflows/ci.yml) [![Dependency audit](https://github.com/dills122/veritas/actions/workflows/security.yml/badge.svg)](https://github.com/dills122/veritas/actions/workflows/security.yml)

Veritas compiles a reviewed library of steering and complete skills into repository guidance for Codex, Claude Code and Kiro. It pins upstream inputs, makes compatibility loss explicit, protects unmanaged or edited files, and supports reviewable plans and CI drift checks.

The `0.1.0-rc.0` candidate follows the accepted [4–6-hour orchestration schedule](docs/orchestration-plan.md). Its locally packed CLI passed the documented workflow on macOS with Node 24, including pinned updates, cache restore, local additions and ownership protection. [Verification evidence](docs/evidence/TASK-015.md) records the checks and limits. No public npm installation or live harness certification is claimed.

Use Node 24 and npm 11. From this checkout:

```sh
npm ci
npm run build
node examples/verify.mjs
```

The [user guide](docs/user-guide.md) explains packed local installation and the `init → validate → plan → sync → check` workflow in a disposable consuming repository. [Examples](examples/README.md) cover a shared baseline, native conditional guidance, explicit adaptation and project additions. Veritas never executes imported skill scripts.

Codex's profile supports always-on steering; Claude adds native file-scoped rules; Kiro IDE and CLI V3 add manual/auto modes. Advanced invocation/tool controls fail explicitly in this candidate. Profiles are documentation-based, and macOS is the initial verification environment. See the [compatibility matrix](docs/compatibility.md) for the distinction between generated fixtures and observed harness loading.

Existing guidance does not become managed merely because its bytes match. Move reviewed content into the canonical library or local additions, resolve conflicting paths deliberately, then preview the complete plan. There is no implicit adoption or force-overwrite option.

Development checks:

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:integration
npm run test:package
```

The [planning guide](docs/README.md) maps authoritative requirements, technical contracts and decisions. The [autonomous handoff](docs/autonomous-handoff.md) remains the execution entry point; [design.md](design.md) preserves the original proposal. [Bootstrap instructions](docs/bootstrap.md) describe the optional AI Central, Serena and codebase-memory tools. Their setup checks remain available:

```sh
python3 scripts/verify-bootstrap.py
python3 scripts/check-planning.py
serena memories check
```

GitHub CI runs quality/unit checks, macOS and Linux integration/installed-package checks, the complete CLI examples and dependency audits. Candidate archives and checksums are retained as run artifacts. Dependabot proposes weekly dependency and pinned Action updates. See [repository setup](docs/github-setup.md) for release tagging and contribution checks.

The package is currently marked `UNLICENSED`. This candidate is distributed through GitHub; no npm registry publication is configured.
