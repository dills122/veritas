# Veritas testing and quality gates

Documentation/tool gates: `python3 scripts/verify-bootstrap.py`, `python3 scripts/check-planning.py`, `serena memories check`. Product checks exist; consult the task evidence for executed results.

TASK-002 installed real npm scripts for lint, format:check, typecheck, test, test:integration, build, and test:package. Tests must exercise observable contracts, not mirror internal implementation.

Compiler gates: malformed YAML, identity conflicts, unsupported activation, target restrictions, combined-target loading, deterministic bytes, preserved binary skill assets and relative references.

Sync gates: unmanaged and edited-file protection, idempotence, safe deletion, mode drift, symlink/traversal rejection, concurrent invocation, representative injected interruptions before/after replacements and manifest commit, recovery without erasing external edits.

Source gates: pinned Git resolution, moved tags do not affect normal sync, corrupted snapshots rejected, offline operation, no imported script execution, no unsafe Git hooks/submodules/symlinks.

Initial RC release gates: macOS Node 24; Linux/Windows and live harness certification are follow-up, packed CLI from a clean temporary consumer project, full requirement evidence, honest harness certification status. Run focused checks during work and integration checks once per completed wave. Only the lead runs clean dist builds; workers use direct Vitest and tsc --noEmit to avoid build races. Snapshot updates require contract review.

Documentation-only changes require planning consistency and source/link review, not invented application tests. Record missing runtime evidence as unverified.
