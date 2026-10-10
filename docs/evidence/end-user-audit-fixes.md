# End-user audit fixes and installed acceptance

**Ready for the authorized bounded fixes.** F1–F3 and the F4 help/human-output cleanup from the [original audit](end-user-audit.md) are addressed. Fresh independent review found no actionable issues. This evidence describes an uncommitted follow-up and a separate local archive, not the original tagged candidate. Nothing was staged, committed, pushed, published or deployed; no tag was moved.

## Scope and resulting behavior

| Finding | Change | Observed acceptance |
| --- | --- | --- |
| F1: adaptation-template bootstrap dead end | Document baseline Codex initialization before replacing the config with the packaged adaptation template; explain lock prerequisites | Fresh installed consumer completed init, template copy, validate, plan, sync and check; adaptation warnings retained |
| F2: sync loses original diagnostics | CLI retains the refused plan's diagnostics, source locations and full JSON data alongside PLAN_CONFLICT and remediation | Edited/unmanaged files report OUTPUT_CONFLICT with AGENTS.md; corrupt manifest reports MANIFEST_INVALID with .veritas/manifest.json; all consumer content/modes preserved |
| F3: installed documentation unavailable | Package user guide, compatibility matrix, examples and complete supporting assets; provide tarball-only setup; version source-only links | Installed documentation's relative file links resolve; both walkthroughs use installed examples rather than checkout fixtures |
| F4: help and human output | Command descriptions, inherited global flags, targets/workflow; concise typed summaries and path lists; parser error emitted once | All seven child help pages expose globals; clean check is two lines; JSON keeps complete metadata and empty stderr |

The source resolver, compiler, adapters and managed writer are unchanged. Conflicts still refuse the complete plan before transaction preparation. A plan containing safe creates and an edited AGENTS.md applied none of its safe subset. Human output also exposes manifest-only drift when every generated artifact is unchanged. Update reports that generated files await sync; restore states that the source lock is unchanged; recovery reports its action.

REQ-011/015, the CLI/distribution contracts, tests and verification tooling were updated together. F5's missing-root/no-command diagnostic redesign remains deferred; deduplicating parser errors is included in the requested human cleanup. Completed TASK-001–017 evidence and the original audit remain historical records.

## Exact identity and environment

Date: October 10, 2026. Platform: Darwin 25.6.0 arm64. Node v24.18.0; npm 11.16.0. Branch: codex/end-user-audit-fixes. Base, current HEAD and original tag v0.1.0-rc.0 peeled commit all remain:

```text
5ad7cc272973f9c18fb6171ab24b6a3bb1ca82e8
```

The reviewed unstaged implementation contains 13 modified tracked files plus new src/cli/human.ts. The [acceptance record](end-user-audit-fixes-acceptance.json) retains every reviewed file's SHA-256 and the compact, sorted JSON file-list identity:

```text
0769b19722a1ccf8835173adf46949939e0155ea5c158aef5355fb111f227275
```

Later evidence/index/traceability additions do not change the reviewed implementation or packaged files. Pre-existing untracked docs/work and original audit evidence were preserved.

New unpublished archive: artifacts/end-user-audit-fixes/veritas-0.1.0-rc.0.tgz, 56,211 bytes, 84 entries. SHA-256:

```text
8589fd9cbda6818bc70dabe5023f44fc8448117f1f399922641f168b56c976b8
```

The same version string is retained for local verification; this archive includes the uncommitted follow-up and must not be confused with the original tag's archive. The original /private/tmp/veritas-tag-release/veritas-0.1.0-rc.0.tgz remains unchanged, SHA-256:

```text
e279a10d40175c049b1eb7c99258e6b51fc2b0e74c2fa29ae92a7731133359a1
```

## Verification commands and outcomes

All commands below ran from the checkout except the installed executable invocations, which ran from the disposable acceptance directory. No imported skill script or lifecycle hook was executed. The npm cache is disposable because the sandbox cannot write the home cache.

```sh
export PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH
export npm_config_cache=/private/tmp/veritas-end-user-audit/npm-cache
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:integration
node examples/verify.mjs
node scripts/test-package.mjs
python3 scripts/check-planning.py
git diff --check
```

| Check | Result |
| --- | --- |
| Pre-fix focused regression run | 4 failed, 13 passed; demonstrated diagnostic, help and human-output failures |
| Post-fix focused CLI/scaffold integration | 17 passed |
| Lint, formatting, strict types | Passed |
| Unit suite | 167 passed across 11 files |
| Full integration suite, including build | 84 passed across 6 files |
| Core examples | 8 semantic checks passed |
| Sequential package acceptance | 3 installed consumer tests passed; public declarations verified; 47 CLI walkthrough commands passed |
| Planning consistency | Passed: 15 requirements, 12 decisions, 17 work items |
| Fresh saved-archive walkthrough | 47 CLI commands passed |
| Additional saved-archive consumer checks | 54 commands passed |

The package script ran after the integration command had completed its build, avoiding a redundant build. Additional script formatting/lint checks passed:

```sh
node_modules/.bin/prettier --check examples/verify-cli.mjs
node_modules/.bin/eslint examples/verify-cli.mjs
```

An initial lint run found unsafe test-matcher assignments; explicit diagnostic assertions and unknown-typed matcher values corrected them. One initial package check overlapped integration's dist rebuild and correctly failed because dist/bin.js was temporarily absent. The subsequent sequential package check passed. The additional disposable Python harness initially asserted nonexistent desiredManifest and scalar diagnostic source fields; correcting those assertions to the existing manifest and source.path contract produced the final passing run. None of these intermediate attempts is counted as a pass.

Saved-archive creation, install and acceptance:

```sh
npm pack --json --ignore-scripts --pack-destination artifacts/end-user-audit-fixes \
  > /private/tmp/veritas-end-user-audit-fixed/pack.json
shasum -a 256 artifacts/end-user-audit-fixes/veritas-0.1.0-rc.0.tgz
npm install --offline --cache /private/tmp/veritas-end-user-audit/npm-cache \
  --prefix '/private/tmp/veritas-end-user-audit-fixed/tools space' \
  --ignore-scripts --no-audit --no-fund \
  artifacts/end-user-audit-fixes/veritas-0.1.0-rc.0.tgz
node examples/verify-cli.mjs \
  '/private/tmp/veritas-end-user-audit-fixed/tools space/node_modules/.bin/veritas' \
  > /private/tmp/veritas-end-user-audit-fixed/evidence/walkthrough.json
python3 /private/tmp/veritas-end-user-audit-fixed/acceptance.py \
  > /private/tmp/veritas-end-user-audit-fixed/evidence/acceptance.log
```

The fresh install added 61 packages offline. The 47-command walkthrough covers source pinning, explicit update, cache restore, local edits, native conditional guidance, adapted guidance, ownership refusals and an owned live-lock fixture. The extra 54 commands cover all help pages, README human workflow, complete JSON, artifact bytes/executable intent, exact adaptation recipe, edited/unmanaged/corrupt-manifest refusal, safe subset preservation, manifest-only drift, human update/restore/recover and individual/combined target routes. These are generated-output observations, not live harness loading certification.

| First-run human command | Original audit stdout lines | Follow-up stdout lines |
| --- | ---: | ---: |
| init | 930 | 5 |
| validate | 307 | 2 |
| plan | 594 | 24 |
| sync | 594 | 4 |
| clean check | 634 | 2 |

Read-only runs preserved consumer file hashes and modes. Update changed the source lock without touching outputs. Cache restore preserved lock bytes. Supporting binary bytes and executable intent matched the installed fixtures in all three native skill directories. Refused JSON sync retained full operations and diagnostics on stdout with empty stderr; human diagnostics identified file paths on stderr and suggested plan.

## Fresh independent review

Review instance 1 of 3 used a fresh-context agent under the independent-review skill. The reviewer recorded a blind preliminary pass before reading the author's explanation, inspected the frozen implementation/requirements/contracts, and returned **Ready, no actionable findings**.

Reviewer independently ran typecheck, the two focused CLI/scaffold integration files (17 passed), git diff --check, planning consistency and a manifest-only human-summary smoke. The reviewer inspected the sequential package log confirming 3 installed consumer tests, declaration checks and 47 walkthrough commands. The broader 167-unit/84-integration/lint/format results were author-reported rather than independently rerun. The extra saved-archive consumer run completed afterward without product changes, so another review instance was unnecessary.

## Retained evidence and limits

- [Acceptance summary and exact implementation identities](end-user-audit-fixes-acceptance.json), including the complete fresh 47-command walkthrough record.
- [Additional command transcript](end-user-audit-fixes-commands.jsonl.gz): all 54 exact argv/cwd/exit/stdout/stderr/duration records from the final successful run.
- [Disposable consumer harness](end-user-audit-fixes-consumer.py): exact assertions used by that run; requires a fresh directory and the installed package at its recorded temporary path.
- [Verification logs](end-user-audit-fixes-verification.txt.gz): focused/unit/integration/package logs, retained outside temporary files.

No new claims are made for live harness versions/loading, Windows, authenticated Git, exhaustive crash permutations or power-loss durability. Original injected-recovery and controlled interruption evidence remain as recorded. The requested fixes and renewed installed acceptance are complete; publication still requires separate user authorization.
