# TASK-014: verified macOS candidate package

Current candidate: `veritas@0.1.0-rc.0`, Node 24.18.0 / npm 11.16.0, macOS 26.6.2 arm64. Retained work is uncommitted/untracked on unborn `feature/veritas-v01`; no publishing. Final source identity and independent review are retained in [TASK-017](TASK-017.md).

## Current observed gate results

All npm commands explicitly used `PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH`.

- Clean `npm ci --offline --no-audit --no-fund` during kickoff passed: 189 packages installed from the lock. Package/dependency metadata are unchanged by review closure. Optional `fsevents` install approval remains withheld; all mandatory checks pass without it.
- `npm run verify` after the final depth-limit correction passed: lint, format, typecheck; 167 unit tests in 11 files; 81 integration tests in 6 files; clean builds; 2 installed consumer tests and strict public declaration compilation.
- `npm audit --audit-level=high` refreshed during closure: exit 0, zero reported vulnerabilities.
- `npm pack --ignore-scripts --pack-destination artifacts --json` passed: 64 entries, 43,620-byte archive, executable bin and core declarations; only dist, README and package metadata. [Package manifest](package-manifest.json) retains the complete inventory.
- Installed the corrected saved tarball in a fresh physical temp consumer with offline npm install, then ran `node examples/verify-cli.mjs` against its installed `.bin/veritas`: exit 0, 42 JSON commands covering exits 0–5 passed. [Command record](../../examples/cli-verification.json) identifies the current candidate workflow.
- `node examples/verify.mjs` passed: 8 semantic checks and 20 baseline artifacts, [record](../../examples/verification.json).

Saved archive: `artifacts/veritas-0.1.0-rc.0.tgz`; SHA-256 `3c131e2211d7a07fbbaca196c50ecb8a19504ca43bba38ff5e7d5e2e3bc50cf9`.

## Earlier checkpoint and limits

The kickoff package gate had 164 unit tests and archive SHA-256 `9c0a39f513703b8edc3407e4cb99a23e35efdfc91f86b257fe7af219523d9cc0`; it was superseded by the bounded depth correction. The [kickoff checkpoint](TASK-017-kickoff.md) preserves that earlier source/archive identity. Earlier un-escalated npm pack hit sandbox EPERM; ordinary authorized cache access made package checks pass. No ownership/cache permissions were globally changed.

`.github/workflows/ci.yml` retains a macOS Node 24/npm 11 recipe for clean install, verification, examples, planning and advisory audit. YAML parses locally; remote Actions and branch-protection configuration were not executed. Compatible v6 actions reference official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) documentation.

Linux/Windows, live HTTPS/SSH authentication, live harness loading, process-kill/PID-reuse/power-loss and hostile race certification remain outside the accepted local RC. No registry project, remote repository, push, commit or publication was created.
