# Veritas local tool bootstrap

The local development integration uses shared AI Central links while keeping repository-specific guidance as real files. It prepares implementation agents; it does not place the project under Veritas-generated ownership.

## Installed state

- Git initialized locally, now on unborn implementation branch `feature/veritas-v01`; no remote, commits, staging, or publishing added.
- Source checkout: `/Users/dsteele/.ai-central`, resolved from `AI_CENTRAL_HOME=/Users/dsteele/.ai-central/templates`.
- Source revision: `e08d63e874f39264ed36f31812476f0816b9e49e`, clean at setup; checkout was not pulled, reset, or switched.
- Install mode: shared links. Profiles: `base,javascript-typescript`. Bundles: `core,node,orchestration,planning,engineering,documentation`.
- `AGENTS.md`, repository steering, and testing gates are real customized files. Reusable TypeScript steering and skills are links. `codebase-memory` additionally links to the installed user skill.
- Skill discovery uses `.agents/skills`, with `.codex/skills` compatibility links. There are 56 AI Central skills plus the codebase-memory skill, and one reusable steering link: 115 links total.
- Exact managed link paths, `.codebase-memory/`, and `.serena/memories/` are excluded in `.git/info/exclude`. Real guidance and `.serena/project.yml` remain trackable. Project-owned runtime ignores are in `.gitignore`; graph-only filtering is in `.cbmignore`.
- Serena project `veritas` is activated and configured for TypeScript LSP, UTF-8, and ignored tool/build directories. Core, stack, conventions, commands, and completion memories were written.
- Codebase-memory project `veritas` was indexed initially in fast mode, then in full mode with persistence after planning. Its graph was refreshed against product source during implementation; graph counts are not evidence of behavior.
- Both MCP servers are already callable on this host. No global configuration replacement or duplicate server process is required.

## Refresh and verify

```sh
/Users/dsteele/.ai-central/scripts/setup-ai-context.sh /Users/dsteele/repos/veritas \
  --yes --mode link --profiles base,javascript-typescript \
  --bundles core,node,orchestration,planning,engineering,documentation --dry-run
```

Review the preview, then run the same command without `--dry-run`. It preserves real project files. New links need exact local exclusions; compare the result with the verifier. Do not follow a missing checkout by overwriting links with arbitrary copies.

```sh
python3 scripts/verify-bootstrap.py
serena memories check
/Users/dsteele/.ai-central/scripts/check.sh
```

Serena health-check requires an analyzable source file larger than 1 KiB. Before implementation, use a disposable TypeScript probe and remove it afterward; TASK-002 should rerun the check against real source. Never interpret a no-source health-check failure as a successful LSP check.

For a fresh machine, reapply the [bootstrap-ai-central skill](https://github.com/dills122/ai-central) using its installed instructions. Recreate codebase-memory discovery links if needed, index this repository, activate Serena, and regenerate local memories from the trackable project contracts. Machine-local exclusions and source links do not survive cloning by design.

## Verification record

At setup, AI Central's `scripts/check.sh` passed all four reported test groups and provenance checks; two tests were skipped. The project verifier passed all 115 links, exclusions, real guidance, graph artifact, and Serena configuration. `serena memories check` found no reference issues. Product npm gates now exist; executed results are retained in task evidence.

The TypeScript health-check outcome and final planning verification are recorded in `docs/evidence/setup.md` after execution. No application or live harness behavior is claimed by these setup checks.

## Active-session tooling limitation

During kickoff, the running Serena MCP server reported an empty active language-server list despite reading the correct `language_servers: [typescript]` project config. Its pattern search works. The standalone Serena CLI health probe previously passed TypeScript symbol/reference resolution; restart the MCP server or app session to refresh its cached project state. Use source reads and compiler checks for coverage gaps meanwhile; do not claim active MCP symbolic navigation succeeded.

## Product-source refresh

Full persisted graph refresh during RC verification:1216nodes/2924edges, zero unusable/skipped files, six intentionally unindexed suffix assets. src/index.ts has one partial parse range at its type-star export; read that source for export coverage. The local graph remains machine-excluded. Standalone Serena health-check against real product/test source passed symbol overview/find/reference tools on Node24/TypeScript6.0.3; parent MCP still reports an empty LSP list even after activation. This session limitation remains visible. Memories were refreshed to implemented commands and checked with no reference issues.

Final closure refreshed the persisted product graph to1316nodes/3019edges, with no skipped/unusable files and the same single partial type-star export range requiring source fallback. Seven suffix assets are intentionally unindexed. Standalone Serena health/configuration remains healthy; no global MCP replacement or app restart was performed during candidate closure.
