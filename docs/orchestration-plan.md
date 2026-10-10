# Veritas bounded release candidate orchestration

Build a usable 0.1.0 local release candidate in the accepted 4–6-hour window. One lead owns contracts, integration, budget and evidence; up to three internal workers implement disjoint slices. This is a working estimate, recalibrated at each gate, not a promise that incomplete safety checks will pass by a deadline.

## Deliverable and scope

The candidate must compile a local or pinned Git library into guidance for Codex, Claude and Kiro; preserve complete portable skills; diagnose unsupported activation; protect unmanaged/edited files; preview changes; safely synchronize and recover representative interrupted writes; check drift; and run as a packed Node 24 CLI outside this checkout.

The verified environment is initially macOS. Live harness and Linux/Windows certification, advanced invocation controls, automatic stale-lock removal and exhaustive crash permutations are follow-up. Unsupported controls fail explicitly. The product specification's accepted RC boundary governs this run; the earlier full certification campaign remains a follow-up target.

## Estimates and gates

| Gate | Target elapsed time | Required evidence | Action on overrun |
| --- | --- | --- | --- |
| G0 | 30–40 minutes | Bounded reuse decision; strict ESM scaffold builds and packed help/version works | Resolve standalone baseline with explicit research gaps; fix scaffold before dependencies |
| G1 | 60–80 minutes | Shared schemas/model, capability and filesystem contracts tested | Serialize disputed interfaces; stop affected workers |
| G2 | 120–150 minutes | Parsing/packages, local snapshots, three pure adapters and ownership plan | Prefer required core behavior; reject advanced controls |
| G3 | 180–220 minutes | End-to-end local/Git init, plan, sync, check, update and representative recovery | Triage required failures; start no optional features |
| G4 | 240 minutes | Feature freeze and remaining requirement assessment | Spend remaining budget on fixes, tests, docs, package and review |
| G5 | 300–360 minutes | Clean verification/package/example results and independent review | Deliver complete candidate or explicitly incomplete checkpoint; preserve work |

Expected first useful workflow: 2–4 hours. Expected local candidate: 4–6 hours. The earlier 12–20-hour estimate included broader certification/hardening; that broader campaign is outside this kickoff. Tool/network delays and the safe writer are the main uncertainty. At G0 and G3, replace estimates with observed throughput and remaining work.

Absolute start, four-hour freeze and six-hour stop are recorded in [execution-budget.json](execution-budget.json). Never reset the deadline during a context handoff. A failed acceptance gate blocks its dependent task even when its target time expires. Six hours is a maximum for this run; useful completion can happen earlier.

## Dispatch order

1. Research owner executes TASK-001 in disposable repositories, capped at 30 minutes. Scaffold owner executes TASK-002 concurrently; the lead maintains project truth and verifies output.
2. After G0, freeze TASK-003 shared contracts with lead review. Parallel writers start only after their interfaces are present and tested.
3. Dispatch parsing, local sources and ownership planning first; use freed slots for Codex, Claude and Kiro adapters. Queue excess ready items rather than exceeding three workers.
4. Run compiler composition and filesystem writing/recovery independently. Slice the writer into lock/observation, apply/journal, then recovery tests; checkpoint after each slice rather than one large unreviewed delivery.
5. Integrate CLI while a separate source owner adds Git transport. The lead wires Git into the CLI after both return; no parallel CLI edits.
6. After the useful workflow, run package/examples and compatibility-label checks, then a fresh-context reviewer. Fix actionable findings and rerun affected verification.

Ledger task IDs remain stable. Internal slice labels are checkpoints within a task, not duplicate requirements. Shared model/config/profile files remain lead-controlled after G1. Only the lead edits task status, canonical decisions and budget records; workers return evidence and proposals.

## Worker timeboxes

Individual task budgets are recorded in [work-items.json](work-items.json). After 15–20 minutes without meaningful progress, return the specific blocker and a minimal reproduction; the lead can redirect independent work. At a task's budget, report delivered/remaining acceptance and a revised estimate. Time expiry is a reassessment trigger, not permission to erase work or weaken contracts.

The lead checks gate timing and integrates returned evidence continuously. Commentary reports meaningful progress, risks and decisions; it does not substitute for the ledger. Read-only planning checks validate requirements, dependencies, ownership and links after each retained status change.

## Integration and completion

Tests and competitor tools never generate into this development checkout's agent guidance. Work stays on local branch `feature/veritas-v01`; no commits, pushes, publication or external messages are part of this run. Preserve user files and other workers' edits.

Each task returns files, exact command results, acceptance coverage, limitations and remaining risks. Retain evidence under `docs/evidence/TASK-NNN.md`. The lead independently checks material results. At G5, report completed, incomplete and deferred requirements separately; a green scaffold is not a product release candidate.

TASK-013 Git extraction was decoupled from TASK-011 after source/writer interfaces froze: it returns a verified in-memory snapshot and never writes controls. The lead integrates CLI pins through the accepted writer later. This permits Git tests in parallel without competing output authority.

## Completed bounded continuation

The original six-hour kickoff ended with a verified provisional archive and unfinished review. The user then explicitly authorized finishing review, fixing findings and closing the same candidate without new scope. The final directory-depth correction and its regression are retained; final review3 is Ready and all17tasks are completed. Current source/archive identities and exact gates are in TASK-017. Original timebox timestamps are preserved rather than restarted; execution-budget.json records the authorized closure separately.
