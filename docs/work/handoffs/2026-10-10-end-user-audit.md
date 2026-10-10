# Handoff: End-user release audit

## Objective And Boundary

Audit `0.1.0-rc.0` as an unfamiliar developer who wants Veritas to work. Exercise the installed CLI, first-run experience, ergonomics, documentation and supported features before a real release. Produce actionable findings and a release recommendation. This is a user acceptance audit, not another implementation review or a new feature campaign. Do not fix product code, commit, push, publish, move tags or create external issues in this audit.

## Canonical Sources

Read applicable `AGENTS.md` for working rules. Then use `README.md`, `docs/user-guide.md`, `examples/README.md`, installed help and `docs/compatibility.md` as the user-facing entry points. Begin with a documented user journey before reading implementation internals or prior review conclusions. Later compare observed/documented feature coverage with `docs/specification.md` and `docs/technical-design.md`. This brief is audit context, not product authority.

## Current Repository State

Repository: `/Users/dsteele/repos/veritas`; GitHub: `dills122/veritas`. `main` and annotated tag `v0.1.0-rc.0` point to `5ad7cc272973f9c18fb6171ab24b6a3bb1ca82e8`. The tree was clean before this uncommitted handoff was added. The audit chat shares this checkout; use disposable consuming repositories and keep writes in this checkout limited to the audit report/evidence.

## Completed Work And Evidence

Implementation and GitHub setup are complete. Prior local and hosted macOS/Linux checks passed; those results do not substitute for your own user journeys. The GitHub prerelease is a draft and there is no npm registry publication of this candidate. Audit the actual tagged archive, not an unrelated package named `veritas` on npm.

Verified tag archive: `/private/tmp/veritas-tag-release/veritas-0.1.0-rc.0.tgz`, SHA-256 `e279a10d40175c049b1eb7c99258e6b51fc2b0e74c2fa29ae92a7731133359a1`. This differs from the earlier local archive because the README changed during repository setup. Tag CI: https://github.com/dills122/veritas/actions/runs/38064836664. Setup PR: https://github.com/dills122/veritas/pull/4.

## Decisions And Rationale

Use the installed tagged artifact in fresh temporary projects to avoid the development checkout's existing AI Central guidance contaminating tests. Prefer black-box observations first. Record friction and misunderstandings before looking for explanations in source. Stay within the accepted candidate scope; distinguish a broken documented behavior from a desirable future feature or a clearly disclosed certification gap.

## Blockers And Limitations

Use Node 24/npm 11. Available runtime: `/Users/dsteele/.nvm/versions/node/v24.18.0/bin`; prepend it to PATH. Profiles are documentation-based. Live harness loading, Windows behavior, live Git authentication and power-loss durability remain uncertified, tracked in GitHub issues #1–#3. Do not invent those observations. If GitHub access is needed, use `/Users/dsteele/.ai-central/templates/skills/first-party/github-keychain-auth/SKILL.md`, run credential-dependent commands outside the sandbox, and unset `GH_TOKEN`/`GITHUB_TOKEN` for each `gh` invocation. Never expose credentials or change authentication state.

## Immediate Next Actions

1. Verify checkpoint, status, runtime and archive checksum; preserve this handoff and any other edits.
2. Follow the README/user guide as a first-time user: installation, help/discovery, a canonical library, consuming configuration and first successful sync. Record actual steps, backtracking and elapsed time. Avoid insider-only setup knowledge.
3. Exercise `init`, `validate`, `plan`, `sync`, `check`, `update`, `update --restore` and `recover` in disposable projects. Cover supported targets, local additions, pinned upstream edits, drift, safe repeated runs, human/JSON output and exits. Use realistic pre-existing guidance and edited outputs; inspect that user content survives conflicts.
4. Try ordinary mistakes: missing/invalid configuration, unknown flags/profiles/targets, relative paths and paths with spaces, missing cache, unsupported activation/metadata and busy/recovery situations that are safely reproducible. Judge whether messages explain both the problem and the next action. Never execute imported supporting skill scripts.
5. Assess documentation accuracy/completeness, examples, terminology, install/package docs availability, defaults, discoverability and supported-feature claims. Check whether rejected or deferred features are understandable. Use source only to diagnose observed failures or verify a disputed claim after the user journey.
6. Write `docs/evidence/end-user-audit.md` with prioritized, reproducible findings and a concrete recommendation: Ready, Ready after bounded fixes, or Not ready. Summarize in the audit chat. Do not send messages to other chats.

## Verification Commands

Reproduce commands a user would actually run against the installed tarball in disposable projects. Do not count the existing automated suite as the audit. For each finding retain the exact command, minimal inputs, actual stdout/stderr/exit, expected behavior or documented promise, user impact and a bounded suggested fix. Mark untested items explicitly. Keep artifacts sanitized and reference them from the report.

## Delivery Metadata

Date: 2026-10-10. Base/checkpoint: `5ad7cc272973f9c18fb6171ab24b6a3bb1ca82e8`; branch: `main`; tag: `v0.1.0-rc.0`; setup PR #4 merged. Known dirty file at dispatch: this handoff only. Deliverable: `docs/evidence/end-user-audit.md`, plus minimal supporting audit evidence if necessary. Findings must separate release blockers, usability/documentation fixes and optional future work; include a supported-feature coverage table and first-run effort summary. This task grants no publication or product-remediation authority.
