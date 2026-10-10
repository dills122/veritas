# Veritas 0.1.0-rc.0 end-user acceptance audit

**Recommendation: Ready after bounded fixes.** The installed candidate completed the core local-library workflow and protected consumer content in the exercised failure cases. Before public distribution, address F1–F3: the adaptation-template bootstrap dead end, lost conflict diagnostics from `sync`, and inaccessible documentation links in the installed package. These are bounded adoption/diagnostic fixes; this audit found no P0/P1 content-loss defect. Improve help and human output under F4 when practical. This recommendation does not authorize publication or certify agent-harness loading.

## Artifact, environment and method

Audited on October 10, 2026, on macOS, using Node `v24.18.0` and npm `11.16.0`. The checkout HEAD and peeled annotated tag `v0.1.0-rc.0` both matched the brief's checkpoint:

```text
5ad7cc272973f9c18fb6171ab24b6a3bb1ca82e8
```

The actual installed archive was `/private/tmp/veritas-tag-release/veritas-0.1.0-rc.0.tgz`. Its independently checked SHA-256 was:

```text
e279a10d40175c049b1eb7c99258e6b51fc2b0e74c2fa29ae92a7731133359a1
```

Initial `git status --short` showed only the pre-existing untracked `docs/work/` handoff. No product code, tag, authentication, global tooling, commit, external issue or release was changed. Audit consumers and fixtures stayed under `/private/tmp/veritas-end-user-audit`. Only this report and its two supporting evidence files were added to the checkout.

The first journey used `README.md`, `docs/user-guide.md`, `examples/README.md`, installed help and `docs/compatibility.md`. Confusion was recorded before consulting the governing specification and technical design. No implementation source or historical review conclusions were used to drive the tests. Persistent cache, lock, journal and manifest files were inspected as observable product output. The existing test suite and example-verification scripts were not run or counted as acceptance evidence.

Two real npm installations were exercised: the guide's disposable tools directory and a conventional consumer dev dependency. The first default-cache installation failed with sandbox `EPERM` at the home npm cache; this was an environment restriction, not a Veritas defect. A disposable npm cache and a permitted dependency download resolved it. The second installation succeeded offline from that cache. Neither installation ran lifecycle scripts.

```sh
export PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH
auditRoot=/private/tmp/veritas-end-user-audit
npm install --cache "$auditRoot/npm-cache" \
  --prefix "$auditRoot/tools space" --ignore-scripts --no-audit --no-fund \
  /private/tmp/veritas-tag-release/veritas-0.1.0-rc.0.tgz
auditCli="$auditRoot/tools space/node_modules/.bin/veritas"
```

The separate conventional consumer used:

```sh
cd "$auditRoot/npm consumer"
npm init -y --cache "$auditRoot/npm-cache"
npm install --save-dev --ignore-scripts --offline --no-audit --no-fund \
  --cache "$auditRoot/npm-cache" \
  /private/tmp/veritas-tag-release/veritas-0.1.0-rc.0.tgz
npm exec --offline --cache "$auditRoot/npm-cache" -- veritas --version
```

Both installs added 61 packages and exposed version `0.1.0-rc.0`. The dependency installation still requires a registry connection or previously populated npm cache; the tarball is not a bundled offline dependency distribution.

## First-run effort and experience

After obtaining the checkout-only example library, the guide's five commands succeeded without a configuration workaround:

```sh
cp -R /Users/dsteele/repos/veritas/examples/company-library "$auditRoot/company-library"
mkdir -p "$auditRoot/consumer space"
"$auditCli" init --project "$auditRoot/consumer space" \
  --source ../company-library --profile company/baseline \
  --targets codex,claude,kiro-ide
"$auditCli" validate --project "$auditRoot/consumer space"
"$auditCli" plan --project "$auditRoot/consumer space"
"$auditCli" sync --project "$auditRoot/consumer space"
"$auditCli" check --project "$auditRoot/consumer space"
```

All five returned 0. Their measured process time totaled **1.272 seconds**, including CLI startup. This is execution time, not a novice reading-time estimate. The transcript began at 11:54:40 EDT; the initial five commands completed in the first batch in about two seconds. Documentation reading, artifact verification and the restricted-cache retry preceded that batch and were not separately timed. The main costs were acquiring the omitted guide/examples and reading voluminous human output, rather than command execution.

The journey needed an explicit source, qualified library profile and target list; there is no remote or target default. `--help` and `init --help` did not explain the available target IDs or the five-command sequence. Paths with spaces worked. Local source paths correctly resolved relative to the consumer config directory, even while the CLI ran from another directory.

The generated baseline had one shared `AGENTS.md`, `CLAUDE.md` importing it, and complete skill copies in the three native directories. Binary bytes, supporting references, README/license content and executable intent matched the source. A repeat sync preserved all managed bytes/modes. Read-only commands preserved file contents, modes and modification times, including runtime files. Current-Git-root discovery worked from a subdirectory after `git init`; a non-Git subdirectory fell back to its cwd as the technical contract specifies.

## Prioritized findings

### F1 — P2 — The adaptation template has no working fresh-project bootstrap sequence

**Impact:** A reader following the examples' instruction to copy a chosen template to `veritas.yaml` reaches a dead end. The adaptation itself works, but the documented template-first path does not establish the required lock. This is an adoption/documentation defect, not a request for arbitrary config-path flags.

**Minimal reproduction:** Use the example library copied above and a new empty directory.

```sh
mkdir "$auditRoot/adapt-template"
cp /Users/dsteele/repos/veritas/examples/project/codex-adaptation.yaml \
  "$auditRoot/adapt-template/veritas.yaml"
"$auditCli" update --project "$auditRoot/adapt-template" --json
"$auditCli" init --project "$auditRoot/adapt-template" \
  --source ../company-library --profile company/typescript --targets codex --json
```

**Actual:** `update` exits **4**, stdout includes `CONTROL_MISSING: Missing veritas.lock.json; initialize or restore the project`. `init` exits **3**, stdout includes `INIT_CONFLICT: Init requires absent config and lock; existing controls remain untouched`. Both JSON stderr streams are empty. Starting with `init --profile company/typescript --targets codex` in an empty directory instead exits **2** (`ACTIVATION_UNSUPPORTED`) and writes no config or lock, so it cannot bootstrap the adaptation either.

**Expected:** The public example should supply a complete successful sequence for establishing controls and applying the exact adaptation. The user guide points to the adaptation template; the examples README says to copy templates into the consumer's fixed config path. Neither supplies the prerequisite baseline initialization.

**Observed workaround:** Initialize `company/baseline` with `--targets codex`, then replace `veritas.yaml` with the adaptation template. `plan`, `sync` and `check` succeed with `ACTIVATION_ADAPTED`; the selected target/profile contract remains compatible with the existing lock. No fetch or arbitrary force flag is needed.

**Bounded suggestion:** Document that working baseline-first sequence alongside every template-first example, and make its prerequisite explicit. An additional template-import feature is unnecessary to resolve this finding. Evidence labels: `unsupported-init`, `adapt-template-update`, `adapt-template-init`, `adapt-working-*`.

### F2 — P2 — Failed sync discards the actionable conflict diagnostics

**Impact:** After editing a generated file, the command the user runs does not identify the file or conflict type. JSON consumers also lose the original stable diagnostic code. A corrupt ownership manifest, unmanaged collision and shadow route collapse to the same generic message. Content remains safe, but resolving the failure requires an unexplained extra command.

**Minimal reproduction:** Complete the first journey, then:

```sh
printf '\nMy consumer edit.\n' >> "$auditRoot/consumer space/AGENTS.md"
"$auditCli" sync --project "$auditRoot/consumer space" --json
"$auditCli" plan --project "$auditRoot/consumer space" --json
```

**Actual sync:** Exit **3**, empty stderr, and this complete stdout envelope:

```json
{
  "command": "sync",
  "data": null,
  "diagnostics": [
    {
      "code": "PLAN_CONFLICT",
      "message": "The complete plan has conflicts or errors; no output was written",
      "severity": "error"
    }
  ],
  "outcome": "conflict",
  "schemaVersion": 1
}
```

**Actual plan:** Exit **3**, with `OUTPUT_CONFLICT`, message `Managed output was modified outside Veritas`, and source path `AGENTS.md`. Human sync similarly produces only `sync: conflict` on stdout and the generic `PLAN_CONFLICT` on stderr; human plan identifies `AGENTS.md` on stderr.

**Expected:** Preserve safely collected plan diagnostics and source locations in a failed sync result, consistent with REQ-011 and the technical CLI contract. The refusal message can accompany them. At minimum the human message should direct the user to `veritas plan --project …`.

**Bounded suggestion:** Carry the original conflict diagnostics through the CLI failure result without changing the atomic refusal behavior. Test at least edited-output and corrupt-manifest cases through the installed CLI. Evidence labels: `edited-plan`, `edited-sync`, `corrupt-manifest-*`, `complete-conflict-*-human`. All consumer bytes survived. A separate plan containing three otherwise safe creates, 19 unchanged files and one conflict also confirmed that sync wrote none of the safe subset (`safe-subset-*`).

### F3 — P2 — The installed README's user-documentation links are unusable locally

**Impact:** An artifact-only recipient can run the executable but cannot follow its local links to the installation workflow, authoring guide or examples. The reader must independently find or clone the source repository before making useful guidance. This matters for the intended GitHub tarball distribution even without npm publication.

**Reproduction:** After either real install:

```sh
test -f "$auditRoot/tools space/node_modules/veritas/README.md"        # succeeds
test -f "$auditRoot/tools space/node_modules/veritas/docs/user-guide.md" # fails
test -f "$auditRoot/tools space/node_modules/veritas/examples/README.md" # fails
tar -tzf /private/tmp/veritas-tag-release/veritas-0.1.0-rc.0.tgz
```

**Actual:** The tarball contains `dist/`, `package.json` and `README.md`. The README uses relative `docs/user-guide.md` and `examples/README.md` links; neither target nor the example library is packaged. Its build instructions explicitly require a checkout, so this audit does not claim those instructions promise a build inside `node_modules`.

**Expected:** A recipient of the released artifact should be able to reach the version-matched public guide and a canonical library example from the included README.

**Bounded suggestion:** Either include the small relevant guide/examples and their necessary relative dependencies, or give artifact readers explicit versioned repository links and a short tarball-consumer quick start. State when obtaining a checkout is a prerequisite. Preserve the existing warning against fetching an unrelated npm package named `veritas`. Evidence: archive inventory and `package-doc-presence`.

### F4 — P2 usability improvement — Help and human output make routine use unnecessarily difficult

**Reproduction:** `"$auditCli" --help`, `"$auditCli" plan --help`, and the first journey above.

**Actual:** Root help lists command names without descriptions. `plan --help` contains only its usage and `-h, --help`; inherited `--project` and `--json` are accepted but not shown. `init --help` does not list valid target IDs or explain the absence of defaults. Clean human output is an unabridged pretty-printed data object:

| First-run command | Stdout lines | Stdout bytes |
| --- | ---: | ---: |
| init | 930 | 24,806 |
| validate | 307 | 7,520 |
| plan | 594 | 15,417 |
| sync | 594 | 15,417 |
| check | 634 | 17,717 |

**Expected/usefulness:** Human output should make the next action, planned paths and clean/drift state easy to see. Full machine metadata belongs in the already-working JSON mode. The specification does not mandate a particular compact layout, so this is a usability recommendation rather than a formatting-contract violation.

**Bounded suggestion:** Add one-line command descriptions, global-option visibility, valid targets and one workflow example. Render a concise human summary with path/kind operations and warnings; retain the complete JSON envelope. This needs no interactive wizard or new target-selection defaults. Evidence: `help-*`, `first-*`.

### F5 — P3 — Missing project paths and JSON without a command have unhelpful messages

```sh
"$auditCli" check --project "$auditRoot/not-existing" --json
"$auditCli" --json
```

The nonexistent project returns **4**, `OBSERVATION_FAILED`, referring to failure to observe `.veritas/runtime/journal.json` and an `lstat` ENOENT on the root. A reader needs to create/select the project directory, not investigate a journal. An existing empty project instead gives the useful exit **2** `CONTROL_MISSING: Missing veritas.yaml; initialize or restore the project`.

JSON without a command returns **2**, command `unknown`, and `CLI_ARGUMENT_INVALID` message `(outputHelp)`. Non-JSON without a command prints help and returns 0. Argument failures in human mode can also print the same parser error twice, followed by `unknown: invalid` rather than the attempted command.

**Bounded suggestion:** Give missing-root failures a project-path message/remediation and translate the no-command parser condition into a useful instruction. Deduplicate human argument errors. No data loss or malformed completed-command JSON was observed. Evidence: `missing-project-json`, `missing-config-*-existing`, `arg---json`, `init-no-args`, `arg-plan---project`.

## Supported-feature coverage

This table records actual package observations, not existing CI results. Target subsets exercised were each of four targets alone, the guide's three-target set, all four together, Kiro IDE+CLI together, and the invalid mixed-adaptation case; this was not an exhaustive 15-subset campaign.

| Feature or claim | Observed result | Evidence labels / limit |
| --- | --- | --- |
| Tarball tools install and ordinary dev dependency | Pass; executable/version/help work, no build needed | `normal-consumer-*`; initial tools install described above |
| init → validate → plan → sync → check | Pass in physical disposable consumer | `first-*`; all exits 0 |
| No default source/profile/targets | Explicit required-option failures | `init-no-args`, `init-default-targets` |
| Relative source and paths with spaces | Pass; source interpreted relative to config | `first-init`, `normal-consumer-*` |
| Cwd and Git-root project selection | Pass; non-Git subdir uses cwd, Git subdir finds root | `cwd-check`, `subdir-discovery`, `git-subdir-check` |
| All four target profiles, native individual always routes | Pass; Claude-only/Kiro-only use native rules/steering, Codex uses AGENTS | `single-*-init/sync`, recorded output paths |
| Shared baseline and Claude import, Kiro path coalescing | Pass in generated bytes and consumer identities | `first-*`, `native-*`; no live loading assertion |
| Native files activation and no-match warning | Pass; pattern retained; warning disappears with matching `src/index.ts` | `native-init`, `native-match-check` |
| Kiro manual/auto; Codex/Claude rejection | Pass for rendered inclusion metadata and explicit unsupported errors | `kiro-modes-*`, `claude-modes-init`, `codex-modes-init` |
| Exact files-to-always adaptation | Pass after documented-workflow workaround | `adapt-working-*`; F1 covers fresh template bootstrap |
| Combined-target scope leak | Exit 2 `SHARED_SCOPE_LEAK`; no writes | `mixed-scope-leak`, `scope-leak-no-writes` |
| Portable skill files, binary bytes, executable intent | All source files match all three native copies | `asset-byte-mode-preservation`, `first-output-tree` |
| Imported scripts never execute | Unique marker absent after source resolution and sync | `imported-script-not-run`; companion script never invoked by audit |
| Local upstream pin and explicit update | Live upstream edit ignored by check/sync; update changes lock and leaves outputs; check then exits 1 | `pinned-*`, `local-source-update`, `post-update-*` |
| Live local additions | Plan/sync use current edited local content with unchanged upstream lock | `local-*`, `local-lock-and-text` |
| Missing cache and exact restore | Exit 4 then successful restore; lock bytes unchanged | `missing-cache-*`, `cache-restore`, `restore-lock-equal` |
| Corrupt cache / changed source restore | Explicit `CACHE_INVALID` / `RESTORE_MISMATCH`; no live fallback | `corrupt-cache-*`, `restore-mismatch*` |
| Determinism, no-op sync and read-only commands | Byte/mode equality; read-only file mtimes also unchanged | `repeat-*`, `read-only-*` |
| Output and manifest-only drift | Missing generated output and provenance-only change exit 1; ordinary changing plan exits 0 | `missing-managed-*`, `post-update-plan`, `manifest-only-drift` |
| Edited bytes and executable mode protection | Exit 3; edited output preserved | `edited-*`, `mode-drift-*` |
| Unmanaged collisions, including equal bytes | Init controls succeed with blocked preview; plan/sync exit 3; original content survives | `unmanaged-*`; intentional behavior clearly disclosed |
| Shadow instruction and nested unmanaged guidance | Blocked shadow; deterministic nested warning; all unmanaged content preserved | `shadow-*`, `unmanaged-*` |
| Complete conflict blocks every write | Pass, including three otherwise safe new skill assets alongside one edited-file conflict | `complete-conflict-preservation`, `safe-subset-*` |
| Safe stale deletion | Owned skill files removed individually; extra user file retained | `stale-*`, `stale-extra-preserved` |
| Unsafe output ancestor and corrupt manifest | Exit 3; no writes through symlink, invalid manifest not treated as absent | `symlink-*`, `outside-empty`, `corrupt-manifest-*` |
| Invalid YAML/config/profile/target | Explicit failures; YAML line/column and selected source locations supplied | `invalid-yaml-*`, `unknown-*-existing`, `unknown-target-profile`, `duplicate-target` |
| Unsupported native controls, sidecar, missing asset reference, negative glob | Exit 2; no silent stripping/broadening | `unsupported-metadata`, `sidecar-init`, `missing-reference-init`, `unsafe-pattern-init` |
| Unsafe local source and source containing consumer | Explicit refusal | `source-symlink-init`, `source-containing-project` |
| Git locator/ref validation | No-ref, HTTP and file transport rejected without a fetch | `git-no-ref`, `git-insecure`, `git-file` |
| Concurrent mutators | Second sync exits 5; first finishes successfully; clean check follows | `concurrent-sync`, `busy-first-sync`, `busy-clean-check` |
| Recovery and external edits after interruption | Controlled partial rollback succeeds; edited after-state blocks and preserves evidence | `interrupted-*`, `interrupted-edited-*`; bounded experiment below |
| JSON envelope and exit meanings | 125 normally completed operational/argument JSON commands parse as one schemaVersion-1 envelope with empty stderr; exits 0–5 observed | Completed census recorded 121 before final smoke and three safe-subset commands. Help/version and deliberately terminated children excluded |

Malformed metadata prevents init controls from being committed, though an empty `.veritas/runtime` directory can remain. The audit did not interpret that runtime directory as generated guidance or implicit ownership.

## Controlled recovery experiment and its limits

A dedicated library added 1,200 ordinary 8 KiB binary assets to the example skill. The consumer selected Codex. Two simultaneous installed sync invocations demonstrated exclusion: the second returned `SYNC_BUSY`, exit 5; the first returned 0.

For each interruption experiment, the audit started its own installed sync subprocess, waited until its real journal and at least one generated binary file existed, sent SIGTERM, and reaped that exact child. Both waits returned `-15`. Check reported `SYNC_INCOMPLETE`, exit 5, and recovery while the remaining lock existed reported `SYNC_BUSY`, exit 5. Before removing **only** that child's `sync.lock`, the audit verified its bytes were unchanged and that the exact child it owned had terminated. Stages, journal and backups were preserved. This was direct ownership evidence, not PID guessing or TTL-based lock removal.

Normal recovery then returned 0, removed the created output files and journal, and left the uncommitted manifest absent. A second recover returned 0; resync and check returned 0. In the second consumer, changing the generated `assets/bytes.bin` after interruption caused `RECOVERY_CONFLICT`, exit 3; the edited file and journal bytes remained identical after the refusal.

The fixture preparation and invocation were equivalent to:

```python
# In a disposable copied example library; never invoke a companion script.
for i in range(1200):
    (assets / f"fixture-{i:04}.bin").write_bytes(bytes([i % 256]) * 8192)
# Initialize a new consumer with --source ../large-library and --targets codex.
child = subprocess.Popen([cli, "sync", "--project", str(project), "--json"], ...)
# Poll the real runtime/journal.json and generated assets; then:
child.terminate()
stdout, stderr = child.communicate(timeout=10)
# Verify the exact child's termination and unchanged lock before removing only it.
# Run installed check, recover, repeated recover, sync and check as recorded.
```

Exact command arguments, exits, child-state observations and preservation checks are retained in the transcript. This pair of controlled SIGTERM experiments adds a narrow process-interruption observation on this macOS filesystem. It does **not** certify arbitrary crash phases, abandoned locks from other processes, PID reuse, Windows or power-loss durability. No automatic unlock procedure is recommended or claimed.

## Disclosed gaps and optional future work

Live Codex/Claude/Kiro loading and activation enforcement remain **unverified**. No harness was invoked. The native metadata and routes above are generated-byte observations. The compatibility matrix clearly explains this distinction and the absence of Windows/power-loss certification. Those disclosed gaps are not newly discovered defects.

Live authenticated Git resolution, moved remote tags and Git cache restoration were not exercised. Local content snapshot pinning/update/restore were independently exercised; they do not prove remote Git transport behavior. The brief's existing Git-authentication gap remains open. No global credentials or transport settings were changed to manufacture a pass. HTTPS/SSH server interaction, cross-platform behavior, every parser/resource-limit boundary, every target subset and exhaustive crash permutations remain outside this audit's observed coverage.

The user guide still describes Linux runtime verification as follow-up, while the README/compatibility matrix describe hosted Linux checks passing. Align those labels with the exact scope of hosted evidence; this is minor documentation drift and does not certify live harnesses on Linux.

`UNLICENSED`, lack of npm registry publication, unsupported advanced invocation/tool controls, no force adoption, no automatic stale-lock stealing, and the deferred legacy Kiro/custom-agent modes are disclosed product boundaries. Interactive setup, profile listing, direct template initialization, automatic migration, additional transports and global output would be future features; they are unnecessary to fix F1–F3.

## Evidence and release follow-through

- [Compact command and observation ledger](end-user-audit-summary.json): exact argv rendered as shell commands, cwd, exits, durations, diagnostics and preservation observations.
- [Complete stdout/stderr transcript](end-user-audit-commands.jsonl.gz): gzip-compressed JSON Lines, including large fixture plans. Use `gzip -dc docs/evidence/end-user-audit-commands.jsonl.gz` to inspect. The transcript contains 165 executed command records, including two deliberately terminated subprocesses, plus audit observations. Initial shell setup/install/archive listing is described above; checkpoint/hash/runtime verification is also repeated in the retained ledger.
- Reproduction paths in this report refer to disposable audit fixtures. For a fresh run, use a new temporary root, install the same hash-verified tarball and copy the same tagged examples; do not run these recipes in the development checkout.

Report verification: `python3 scripts/check-planning.py` passed with 15 requirements, 12 decisions and 17 acyclic work items, including local-link verification. The gzip transcript was read back and matched the raw log byte-for-byte; completed JSON envelopes were independently parsed. Final checkout HEAD remained the recorded checkpoint; status contained only the preserved handoff and these three audit deliverables.

The current candidate's content-safety behavior supports continuing toward release. Resolve F1–F3, rerun their short installed-package reproductions and the first five-command journey against the replacement archive, and keep the documentation-based compatibility label. This report grants no remediation or publication authority and does not reopen the completed implementation work items.
