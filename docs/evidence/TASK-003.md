# TASK-003 evidence

Lead contract freeze: strict version-1 config/library/frontmatter/lock/manifest/journal schemas; normalized artifact, source, loading, plan and command types; outputVersion 1; fixed documentation-based profiles. Shared contracts live in src/model/types.ts, src/config/schemas.ts, src/config/parse.ts and src/adapters/profiles/index.ts.

Tests were written before implementation and failed for absent modules. Added portability and location cases failed before fixes. Focused model suite: 24 passed; config suite: 15 passed. Full suite before final location addition: 38 passed (including scaffold); subsequent focused config, typecheck and lint pass. All commands selected installed Node 24.18.0 in PATH. No harness certification is claimed.

Checks cover unknown fields/version/profile, namespace/reference identity, duplicate YAML/aliases/custom tags/merge keys, transactional path authority, missing commit entries, path traversal/reserved names/case and ancestor collisions, content+mode identity, positive glob grammar, dotfiles and case sensitivity. YAML and schema diagnostics use one-based source positions.

Adapters and source/parser/planner interfaces are frozen in the technical design implementation contract appendix. The lead alone may change shared contracts during parallel execution. Effects may throw VeritasError with a structured diagnostic and documented exit code; expected declarative parse errors return Result<T>.
