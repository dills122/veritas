# TASK-015 examples and user documentation evidence

Status: documentation/example slice and installed local CLI walkthrough complete for lead integration. Pure source/compiler examples and the packed CLI passed. Recovery fault evidence is cross-referenced from TASK-011; live remote Git transport, actual process-death abandonment and live harness certification remain unverified. No public release is claimed.

## Owned artifacts

- `README.md`: product purpose, Node/runtime setup, example workflow, development checks and preserved planning/original-design/bootstrap links.
- `docs/user-guide.md`: all command contracts, packed local installation, local additions, authoring limits, unsupported activation/adaptation, Git pin updates/cache restore, ownership migration, recovery and JSON/exit codes.
- `examples/company-library/`: shared baseline, unrestricted conditional failure profile, Claude/Kiro-restricted conditional profile, and a complete portable skill with references/license/README/binary/executable assets.
- `examples/local-overlay/`: independent project additions using the reserved local namespace.
- `examples/project/`: baseline, native-conditional and Codex-only explicit-adaptation configuration templates.
- `examples/verify.mjs` and `examples/verification.json`: executed snapshot/parser/compiler checks and retained artifact hashes.
- `examples/verify-cli.mjs` and `examples/cli-verification.json`: reproducible installed-bin walkthrough in disposable physical source/project copies, with JSON command/exit/diagnostic records.

No shared ledger, decisions, specification, technical contracts, release/bootstrap records or dist files were edited. Builds remain lead-owned to avoid concurrent dist-clean races.

## Verification

Using Node 24.18.0 via `/Users/dsteele/.nvm/versions/node/v24.18.0/bin`:

- `node examples/verify.mjs`: exit 0 against the existing lead-built core exports. Eight checks passed: shared baseline, repeat artifact hashes, complete binary/executable assets, native conditional target selection, unsupported Codex file activation, explicit adaptation warning, shared-scope-leak rejection and local overlay composition. Baseline produced 20 deterministic artifacts. Full SHA-256 inventory retained in `examples/verification.json`.
- `node --check examples/verify.mjs`: exit 0.
- `node node_modules/prettier/bin/prettier.cjs --check README.md docs/user-guide.md examples`: initially reported only generated verification JSON style; the retained JSON was formatted and the subsequent check passed.
- `python3 scripts/check-planning.py`: exit 0; requirements, decisions, DAG, ownership, traceability and links passed.
- Direct local Markdown-link inspection across README, guide and example Markdown: all relative targets exist.

The binary fixture is `00 ff 0a 0d 80`, SHA-256 `896a425d1fade64e368ccca61003182138e59b7050bca9a7ec8f4ca99646f9fb`; all three output copies matched. Script executable intent remained true. Source reading, parsing and in-memory compilation did not execute that script or generate guidance into this checkout.

## Installed package walkthrough

Executed October 10, 2026 UTC on macOS, Node 24.18.0 and npm 11.16.0. The lead-built dist was packed once into an immutable tarball before the lead's next clean build. No worker builds or imported scripts ran.

```sh
export PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH
mkdir -p /private/tmp/veritas-task015-final/cache
npm pack --cache /private/tmp/veritas-task015-final/cache --ignore-scripts --pack-destination /private/tmp/veritas-task015-final --json
npm install --prefix /private/tmp/veritas-task015-final/tools --offline --ignore-scripts --no-audit --no-fund /private/tmp/veritas-task015-final/veritas-0.1.0-rc.0.tgz
node examples/verify-cli.mjs /private/tmp/veritas-task015-final/tools/node_modules/.bin/veritas
```

Pack exit 0: `veritas@0.1.0-rc.0`, 64 entries, including executable bin and public declarations. Archive SHA-256 `af2c1fba68c0c2f96724c0b849ea30aea9ad0e841a510851871fc74c8992f479`. This identifies the tested archive before the final README edits; the lead's final package will have a different archive hash. The code came from the current built candidate, not a public registry package.

An initial pack with the default home cache failed with sandbox `EPERM`; retrying with the disposable cache passed. Offline installation used the existing npm cache and required sandbox escalation for ordinary cache access, then exited 0 with 61 packages added. No network dependency retrieval, install hooks or imported skill scripts were used.

Runner exit 0, version/help exit 0, **42 JSON command invocations passed**: 30 success, three drift, one invalid compatibility, four ownership conflicts, one missing-cache operational failure and three busy results. The retained record lists every exact command with temporary roots normalized. Observed checks:

- Init creates config/lock/cache and no AGENTS output; validate/plan succeed, pre-sync check exits 1, sync/check succeed, and repeated sync preserves AGENTS mtime.
- Complete binary bytes and executable companion assets reach all three native skill directories.
- Upstream edits do not affect normal pinned check/sync. Explicit update changes lock with `generationPending: true` and leaves outputs unchanged until sync.
- Removing only the fixture's locked cache yields exit 4. `update --restore` restores it while preserving exact lock bytes, SHA-256 `290bc4622ec5565c79a638c5f1e26ed44c13cf29bce41ba420d3c8b06019350e`.
- Live local overlay edits affect plan/check/sync immediately and leave upstream lock bytes unchanged.
- Native restricted conditional profile succeeds. Unsupported Codex files fail init with exit 2 and no config creation; the explicit Codex-only adaptation succeeds with a warning.
- Unmanaged and edited managed guidance remains byte-identical after plan/sync exit 3.
- A live runner-owned fixture lock blocks check/sync/recover with exit 5 and stays untouched. The creating runner removes only its own exact fixture lock; this is not an abandoned-lock demonstration.
- Recover without a journal returns `action: none`.

Additional exact verification: `npm test -- tests/unit/compiler tests/unit/adapters` passed 31 tests across four files; `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/git-source` passed 15 tests across two files. Git tests execute real Git objects through injected local bare transport, including moving tags, intentional re-resolution and fixed-commit restore. Production CLI Git wiring is reviewed in [TASK-012](TASK-012.md); an installed CLI with live HTTPS/SSH authentication was not exercised. Guide remote locators are explicitly placeholders.

Final checks passed: `node --check examples/verify-cli.mjs`; `node node_modules/prettier/bin/prettier.cjs --check README.md docs/user-guide.md docs/compatibility.md docs/evidence/TASK-015.md docs/evidence/TASK-016.md examples`; `python3 scripts/check-planning.py` (15 requirements, 12 decisions, 17 acyclic work items); direct relative Markdown-target inspection in 13 owned documentation/example files. No temporary generated guidance or dependency installation was placed in this checkout.

## Recovery and compatibility limits

The guide now names manifest **or source lock** commit points, links [TASK-011](TASK-011.md) directly, and describes manual owner investigation without promising a certified process-death/PID-reuse procedure. Nonce/PID alone cannot establish abandonment; live, ambiguous and reused-PID ownership remains blocked. Preserve lock/journal/stages/backups and recheck exact identity before any verified-owner removal. No unlock/force/adoption flag exists.

TASK-011 records 31 injected-failure transaction/recovery tests, not actual process kills or power loss. This walkthrough verifies no-journal recovery and busy preservation. Exhaustive crash permutations, automatic abandoned-lock handling and broad platform durability remain follow-up.

macOS is the verified candidate environment; Linux/Windows runtime and live Codex/Claude/Kiro loading are unverified. Profiles remain documentation-based. Explicit files-to-always adaptation is shown in a Codex-only project because shared AGENTS cannot expose an adapted always rule to consumers that still intend conditional activation. [TASK-016](TASK-016.md) audits the profile labels and fixture coverage.

## Lead final-archive rerun

After independent-review fixes, installed the saved artifacts/veritas-0.1.0-rc.0.tgz (SHA2569c0a39f513703b8edc3407e4cb99a23e35efdfc91f86b257fe7af219523d9cc0) into a fresh physical /private/tmp consumer with npm install --offline --ignore-scripts --no-audit --no-fund. Ran node examples/verify-cli.mjs against its installed .bin/veritas; exit0 and all42 command invocations passed. examples/cli-verification.json now records this current built CLI. Reran node examples/verify.mjs: exit0,8 semantic checks/20 baseline artifacts. Init inventory and source-root containment regressions are additionally covered by final81integration tests.

## Corrected closure archive

The final bounded depth-limit fix changed runtime bytes. The corrected saved tarball is43,620bytes, SHA2563c131e2211d7a07fbbaca196c50ecb8a19504ca43bba38ff5e7d5e2e3bc50cf9. Lead installed it offline in a fresh physical /private/tmpconsumer, reran verify-cli.mjs:exit0,42commands. Core examples rerun:exit0,8checks/20artifacts. Current examples/cli-verification.json and verification.json reflect this run. Earlier hashes above are historical; TASK-014/017 own final archive/source identities.
