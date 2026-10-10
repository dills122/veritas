# Veritas agent guidance

Veritas is a repository-local compiler and synchronizer for versioned agent steering and skills. Optimize for honest compatibility, deterministic output, and preservation of user files.

## Read first

- `docs/README.md` is the planning index and authority map.
- `docs/specification.md` governs product requirements; `docs/technical-design.md` governs implementation contracts.
- `docs/implementation-plan.md` contains work items and dependencies. `docs/autonomous-handoff.md` is the execution entry point.
- `design.md` preserves the original proposal. Refined documents resolve ambiguities explicitly.
- Read `.codex/steering/repository-steering.md` and `.codex/steering/testing-quality-gates-steering.md`. Use `.codex/steering/javascript-typescript-steering.md` if present; local guidance wins if it conflicts.

## Current project state

The local `0.1.0-rc.0` candidate is completed under the accepted bounded scope. All 17 tasks have evidence, the final independent review is Ready, and current verification/package/examples pass. The original kickoff stop and explicitly authorized review/fix continuation are retained in docs/execution-budget.json. See docs/evidence/TASK-017.md for current source/archive identities and certification limits. Do not reopen completed implementation tasks or treat local candidate completion as publication authorization.

## Architecture and invariants

- One TypeScript ESM package, Node 24, npm with a committed package lockfile. No service, database, frontend, plugin system, or home-directory output in v0.1.
- `src/model/` owns shared contracts. `src/compiler/` owns selection and combined-target loading. Adapters return artifacts and diagnostics without I/O. `src/sync/` alone owns managed output writes.
- Routine commands use immutable locked snapshots. Only explicit source-resolution commands may fetch or change pins.
- Never execute imported skill scripts or source-defined configuration hooks.
- Never silently broaden activation, discard restrictions, overwrite unmanaged/modified outputs, or generate nested AGENTS files to imitate globs.
- Compile the whole selected target set before planning writes. Skills retain all supporting files and byte relationships.
- Update contracts, requirements, tests, and task evidence together when behavior changes.

## Tool setup

- Activate `/Users/dsteele/repos/veritas` with Serena; read its initial instructions before coding. Onboarding memories contain local navigation and conventions.
- For structural codebase exploration, use the installed `codebase-memory` skill. Check project/index readiness, query graph first, then check cited-path coverage; read/grep coverage gaps. The local graph indexes application symbols; check coverage after edits.
- Serena and codebase-memory MCP are already available through this host. Do not replace global MCP configuration or create duplicate servers without need.
- AI Central skills are local links under `.agents/skills` with `.codex/skills` compatibility links. They are optional shared tools, not product dependencies; see `docs/bootstrap.md` for repair.

## Working conventions

- Preserve unrelated edits; keep scope bounded. Use strict types, explicit errors, stable diagnostic codes, pure compilation, and injected filesystem/Git boundaries.
- Read the relevant installed skills before using them. Use `orchestrated-delivery` and `spec-traceability` for larger implementation orchestration.
- Parallel writers must have disjoint ownership and preserve each other's edits. The lead owns shared contracts, integration, and final verification. Create user-visible chats only when the user requests them.
- Application development should use a feature branch. Do not stage, commit, push, publish, or deploy unless authorized by the active task.

## Verification

Available now: `python3 scripts/verify-bootstrap.py`, `python3 scripts/check-planning.py`, and `serena memories check`.
Product checks available now: `npm ci`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, `npm run test:package`.
Record exact commands and outcomes; distinguish documentation-based compatibility from observed harness certification.
