# Veritas planning and implementation guide

Veritas v0.1 compiles a pinned library of agent guidance into explainable, safely managed repository artifacts. The planning package defines the product contracts, implementation order, and evidence needed to hand execution to an autonomous lead session.

## Start here

1. Read [Design review](design-review.md) for the main strengths, gaps, and changes to the original proposal.
2. Read [Product specification](specification.md) and [Technical design](technical-design.md) for governing contracts.
3. Read [Decisions](decisions.md) and [Compatibility research](research/compatibility.md) for tradeoffs and vendor assumptions.
4. Execute [Implementation plan](implementation-plan.md), using [work-items.json](work-items.json) as the task state ledger.
5. Use [Test strategy](test-strategy.md) for requirement evidence and [Autonomous handoff](autonomous-handoff.md) as the next session's prompt.
6. See [Bootstrap](bootstrap.md) to verify or repair local tools.
7. User-facing help lives in the [user guide](user-guide.md) and [troubleshooting guide](troubleshooting.md); keep diagnostic codes and their fixes in sync with the latter.

## Authority and status

Product requirements outrank implementation plans. Technical contracts and decisions refine requirements without expanding scope. Change those first when implementation exposes a conflict; update dependent tasks and tests together. `design.md` remains the original proposal and is preserved for provenance.

Current status: the local `0.1.0-rc.0` candidate is completed. All 17 tasks are accepted; [final independent review](evidence/review-3.md) is Ready with no actionable findings. [Closure evidence](evidence/TASK-017.md) retains the corrected archive, current source identity and verification. The original [4–6-hour kickoff](orchestration-plan.md) and stop are historical; the user explicitly authorized the bounded review/fix continuation. Live harness and other-platform certification remain deferred.

The subsequent [end-user audit fixes](evidence/end-user-audit-fixes.md) address adaptation setup, refused-sync diagnostics, installed documentation and help/human output. Their uncommitted source and separate local archive passed renewed installed-consumer acceptance and fresh review. The original candidate tag and evidence remain unchanged; publication is not authorized.

`docs/work-items.json` owns execution status, dependencies, ownership, and evidence paths. The generated task table in the implementation plan mirrors that ledger. The requirement table in the specification owns requirements; the test strategy owns requirement-to-test mapping. Evidence belongs in `docs/evidence/`, with exact commands, environment, outcomes, and limitations. Do not mark work complete based on a narrative summary.

## Available verification

```sh
python3 scripts/verify-bootstrap.py
python3 scripts/check-planning.py
serena memories check
```

These validate setup and planning consistency. Product behavior is checked by `npm run verify` and the installed examples, with results in task evidence.
