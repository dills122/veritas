# TASK-013 — explicit Git source resolution

Status: implementation ready for lead integration, 2026-10-10 04:44 UTC.

## Scope and interface

Owned files: `src/sources/git.ts`, `src/sources/git-runner.ts`,
`tests/integration/git-source/`, and this evidence file. No shared contracts,
CLI wiring, lock/config writes, package changes, managed outputs, commits,
publishing, or dist builds were performed by this task.

```ts
resolveGitSnapshot(
  project: string,
  descriptor: { git: string; ref: string },
  options?: { runner?: GitRunner },
): Promise<{ snapshot: Snapshot; resolvedCommit: string }>

type GitRunOptions = {
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  input?: Uint8Array;
};
type GitRunner = (
  args: readonly string[],
  options: GitRunOptions,
) => Promise<Uint8Array>;
createGitRunner(executable?: string): GitRunner;
```

The resolver validates shared production locator rules and safe refs before
filesystem/process work. It distinguishes branches, tags, fully qualified refs,
HEAD, and complete 40/64-character object IDs. Ambiguous short branch/tag names
fail explicitly. It fetches the advertised object ID, peels annotated tags to
commits, and returns the resolved commit and validated snapshot. The caller owns
cache storage and pin changes; restore can pass the locked commit and must check
the locked tree digest before storage.

Temporary repositories live under the validated project runtime, use bare init
with empty templates and explicit object format, and are removed after success
or failure. No checkout occurs. Command overrides disable imported hooks,
submodule recursion, automatic maintenance, and unsupported transports. Git runs
through argv arrays with `shell: false`; normal user authentication helpers remain
available while inherited repository/redirection/config-injection environment
variables are removed. The native runner clamps transport to HTTPS/SSH and
discards stderr contents when reporting errors, preventing credential echoes.

Tree extraction uses NUL-separated `ls-tree` and binary `cat-file --batch`.
Only ordinary 100644/100755 blobs are accepted. Shared portable-path, case,
depth, snapshot, and executable-config rules apply. Symlinks, submodules, LFS
pointers, malformed/truncated streams, excessive entries, assets over 10 MiB,
and snapshots over 100 MiB fail with structured exit-4 diagnostics. Output and
execution limits are enforced per command, including injected runner results.

## Verification

All commands used Node 24 via
`PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH`.
Installed Git: `git version 2.50.1 (Apple Git-155)`.

- `npx vitest run --config vitest.integration.config.ts tests/integration/git-source`
  — 2 files, 15 tests passed. Disposable bare Git fixtures verified both SHA-1
  and SHA-256 end to end, binary bytes/executable intent, annotated and moved
  tags, fixed-commit restore, immutable cache after source changes, rejection of
  symlinks/submodules/LFS/oversize assets, no hook/filter/imported-script
  execution, locator/ref validation, missing/ambiguous refs, and sanitized
  failures. Native subprocess tests verified missing Git, binary stdin/stdout,
  nonzero failures, output bounds, and timeout termination.
- `npx eslint src/sources/git.ts src/sources/git-runner.ts tests/integration/git-source`
  — passed with no diagnostics.
- `npx prettier --check src/sources/git.ts src/sources/git-runner.ts tests/integration/git-source`
  — passed.
- `npm run typecheck` — whole-project TypeScript check passed.

TDD exposed the shared locator validator accepting `file://` and Windows drive
syntax through its scp fallback. The lead fixed that shared contract and added
five validator regressions; Git tests then passed with the shared validator as
the sole locator authority. Earlier lint failures in fixture error typing and
control-byte validation were corrected and rechecked. A final cleanup-error
change triggered `no-unsafe-finally`; cleanup now records its structured error
without replacing an earlier resolution failure. The complete focused suite,
lint, formatting, and typecheck were rerun successfully at 04:44 UTC.

No build was run because the lead exclusively owns dist while CLI integration
tests execute. These are source-level integration results; the lead must wire
and verify CLI source add/update/cache restore before accepting the whole task.

## Limits and follow-up

Local bare fixtures use an injected runner that substitutes the validated HTTPS
locator and explicitly enables file transport only inside tests. This does not
certify live HTTPS/SSH authentication or remote server behavior. Unavailable or
unauthorized old commits fail rather than resolving a moved ref during restore.

The 30-second limit is per Git command. Output is bounded, but fetch can receive
large compressed objects before tree validation; this RC does not impose a
separate network-transfer or temporary-pack disk quota. Blob extraction buffers
bounded payloads in memory. Runtime filesystem safety reuses TASK-005 ancestor
validation and has its same limitation concerning hostile concurrent ancestor
replacement without a dirfd-relative filesystem API. Broad OS and live harness
certification remain follow-up work within the accepted RC scope.

## Primary sources

- [Git ls-tree](https://git-scm.com/docs/git-ls-tree): NUL-separated tree records,
  modes/types/sizes and recursive tree inventory.
- [Git cat-file](https://git-scm.com/docs/git-cat-file): binary batch framing and
  object identity/type/size verification without checkout filters.
- [Git fetch](https://git-scm.com/docs/git-fetch): object refspecs, shallow fetch,
  tag behavior and submodule controls.
- [Git init](https://git-scm.com/docs/git-init): empty templates, bare repositories
  and SHA-1/SHA-256 object-format selection.
## Independent review correction — executable canonical manifest

On 2026-10-10 at 04:50 UTC, a Git fixture with executable
`veritas.library.yaml` demonstrated review finding 2 before the fix: Git
snapshot validation accepted the manifest. TASK-005's shared private
configuration predicate now rejects it with `CACHE_INVALID`, exit 4. The Git
regression passed after the change, with all local/cache/Git source integration
checks passing (36 tests) and local source unit checks passing (11 tests).
Scoped source lint and whole-project typecheck passed. Exact commands and the
local/cache regressions are recorded in TASK-005's correction section. No Git
resolver code, CLI wiring, dist build, or commit was changed for this correction.
