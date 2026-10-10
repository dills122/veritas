# Veritas autonomous implementation handoff

Use the prompt below in an implementation session opened against this repository. It authorizes bounded implementation of the v0.1 local release candidate, with internal subagent orchestration and evidence-based integration. The current implementation run uses the accepted scope and persistent deadlines in docs/orchestration-plan.md and docs/execution-budget.json.

## Copyable execution prompt

```text
Implement Veritas v0.1 in this repository using internal subagent orchestration.

Read AGENTS.md, docs/README.md, docs/specification.md, docs/technical-design.md,
docs/decisions.md, docs/implementation-plan.md, docs/work-items.json,
docs/test-strategy.md, docs/research/compatibility.md, and docs/bootstrap.md.
The product specification governs scope. The work-item ledger governs task status.
Do not rely on previous chat history.

First read docs/orchestration-plan.md and docs/execution-budget.json. Preserve the
accepted four-hour feature freeze and six-hour maximum across resumes. The initial
verified environment is macOS Node 24. Broad OS/live harness certification and
advanced controls are follow-up; reject unsupported controls rather than stripping them.

Complete the required local release candidate: one strict TypeScript ESM CLI/core
package for Node 24, pinned local/Git upstream snapshots, explicit local additions,
pure Codex/Claude/Kiro adapters, combined-target loading checks, deterministic
artifacts, safe ownership planning, journaled sync/recovery, drift CI, clean package
consumer tests, examples, documentation, and honest compatibility evidence.

Inspect dirty state and preserve all existing project files. The current repository
contains tool setup and planning only, with no application package or source.
Activate the project in Serena and read its initial instructions. Check codebase-memory
project/index status before structural exploration and verify cited-path coverage.
Use the orchestrated-delivery and spec-traceability skills. Read their SKILL.md files.
Run available bootstrap/planning/memory checks. Select Node 24 before product validation.
Use a feature branch if Git supports it; do not erase or stage unrelated user work.

Start TASK-001 research and TASK-002 scaffolding. TASK-001 must resolve the build-versus-
reuse gate before shared core implementation. TASK-003 freezes shared contracts.
Dispatch only ready task IDs from docs/work-items.json; at most three internal
workers alongside the lead if four slots are available. Assign exact owned files,
requirements, acceptance tests, and evidence destination. Tell writers they share
this codebase and must preserve others' changes. Queue excess ready tasks; do not
invent separate user-visible chats. The lead owns shared schema/profile changes,
CLI/package integration, conflicts, final verification, and task status.

Keep tests, competitor tools, and demonstrations in disposable repositories.
Never run generation against this checkout's bootstrap AGENTS, steering, or skill
links. Never silently broaden activation, strip restrictions, overwrite unmanaged
or edited files, adopt identical files, or execute imported skill/config scripts.
No automatic AGENTS override/nested-glob workaround, dynamic plugin engine, hosted
service, home-directory output, hooks, MCP settings or subagent synchronization.

Use the task packets and dependencies in the implementation plan. Update governing
contracts before plans if a real conflict appears. Routine implementation choices
within those contracts need no repeated confirmation. Continue independent ready
work when credentials, network, CI or a live harness are unavailable; record exact
gaps and keep documentation-based labels. Do not fabricate certified loading or
successful tests. A material scope or safety-contract change must be made explicit
and reviewed before its dependent lane proceeds.

Run meaningful focused checks during each task, then integrated verification at wave
boundaries. Store exact outcomes in docs/evidence/TASK-NNN.md and update the ledger
plus rendered task index. A task is complete only with executed acceptance evidence.
Use a fresh-context engineering reviewer after substantial integration, provide a
bounded retained-diff/plan packet, fix actionable findings, and close TASK-017 only
after the parent acceptance boundary is met.

Do not push, merge, publish an npm package, deploy, send external messages, alter
global MCP configuration, or create external projects as part of this instruction.
Retained edits remain local for review; report their diff identity. Commits are
outside this handoff's requested boundary and must not stop implementation and
validation.

Finish with completed/blocked/deferred requirements, exact verification results,
compatibility labels and access gaps, changed-file summary, review outcome, and the
next concrete release action. The goal is the integrated local product, not just
completed child assignments.
```

## Child work packet

```text
Work item: TASK-NNN and its canonical title
Outcome: one bounded deliverable from docs/work-items.json
Read first: AGENTS.md plus governing requirements, contracts, decisions and task packet
Delivery unit: internal subagent, or bounded research
Owned paths: exact ledger scope; shared schemas/CLI/package remain lead-owned
Do not change: another owner's files or source-of-truth contracts without lead approval
Acceptance: copy the task's observable conditions
Verification: task commands and evidence required, with honest unavailable-check limits
Integration: current lead branch/worktree; you are not alone, preserve other edits
Return: files, exact command results, requirement evidence, assumptions, blockers,
        review risks and recommended next action; no independent commits or publishing
```

Before dispatching structural code work, the lead passes codebase-memory freshness, exact symbols/paths, coverage gaps, relevant queries, and source fallback already performed. Workers without those tools use the supplied evidence and targeted source reads; they must not claim graph verification they did not perform.

## Resume and stop conditions

On resume, inspect the ledger and retained evidence, then check current code against claimed completed tasks. Never rerun a completed task just to recreate chat context. Identify ready pending tasks whose dependencies are completed. If the working tree differs from an evidence identity, verify the relevant acceptance boundary before trusting that evidence.

Stop a dependent lane on shared-contract inconsistency, unsafe writes, unresolved compatibility loss, failed ownership/recovery tests, or a changed build-versus-reuse decision. Continue unrelated ready work. Ask for a user decision only where implementation cannot preserve authorized scope or an external action genuinely needs approval. Missing live harness/CI access is an evidence limitation; it does not permit claiming a certified release and does not prevent local implementation.

Completion means every required product requirement has integrated verification and review, with external-access limitations reported accurately. Optional certification remains separately qualified. A local release candidate can be ready for review without being published; no task in this plan grants publication authority.

## Completed candidate handoff

All 17 implementation tasks are completed. The original execution prompt above is a historical implementation template; do not dispatch completed tasks again. Read [final closure](evidence/TASK-017.md), [Ready independent review](evidence/review-3.md), [source inventory](evidence/rc-source-inventory.json) and the completed ledger before making changes.

The local artifact is `artifacts/veritas-0.1.0-rc.0.tgz`, SHA-256 `3c131e2211d7a07fbbaca196c50ecb8a19504ca43bba38ff5e7d5e2e3bc50cf9`. Current full verification passes lint/format/typecheck, 167 unit tests, 81 integration tests, 2 installed consumer tests and public declarations. The installed archive passes 42 CLI commands; examples pass 8 semantic checks. All four bounded review findings are fixed; final review instance 3 of maximum 3 is closed with no actionable findings.

No in-scope blocker remains. Future work is the explicitly deferred live harness/remote-auth/other-platform certification and broader hardening campaign, requiring its own requested scope. Do not reset the historical kickoff deadline. The user subsequently committed and pushed the implementation as `5d696d3c876e4e81021834cff2c7ab69a5be91af`, then authorized GitHub repository setup, CI, tags and follow-up issues. See [GitHub setup](github-setup.md) for that separate delivery. Bootstrap links/cache/memories remain machine-local; Serena's standalone health passes while the parent MCP session needs refreshing for symbols. npm publication and a stable release remain separate decisions.
