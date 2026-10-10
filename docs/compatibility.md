# Veritas 0.1 compatibility

All bundled profiles are **documentation-based**. Renderer/compiler fixtures and the installed CLI are verified on macOS with Node 24.18.0. Hosted macOS/Linux CI also passes integration, installed-package/public-declaration and full CLI example checks; see [repository setup evidence](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/github-setup.md). Live Codex, Claude Code, Kiro IDE and Kiro CLI loading or enforcement is **unverified**; no harness runtime version or settings have been certified. Windows execution and power-loss durability are also unverified.

Profile IDs are Veritas contract versions, not harness release numbers. [Implemented profiles](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/src/adapters/profiles/index.ts), [source research](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/research/compatibility.md) and [TASK-016 evidence](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/evidence/TASK-016.md) distinguish the intended native mapping from observed generation.

## Bundled profile matrix

| Target / profile                 | Intended steering mapping                                                                                                                  | Skill destination        | Runtime certification |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | --------------------- |
| Codex / `codex-repo-v1`          | Always through repository `AGENTS.md`; files/manual/auto unsupported                                                                       | `.agents/skills/<name>/` | Unverified            |
| Claude Code / `claude-repo-v1`   | Always through native rules or `CLAUDE.md` importing shared `AGENTS.md`; files through `paths` frontmatter; manual/auto unsupported        | `.claude/skills/<name>/` | Unverified            |
| Kiro IDE / `kiro-ide-repo-v1`    | Always through shared `AGENTS.md` or native steering; files through `fileMatch` with pattern arrays; manual/auto native inclusion metadata | `.kiro/skills/<name>/`   | Unverified            |
| Kiro CLI V3 / `kiro-cli-repo-v1` | Same declared modes and byte mapping as IDE, with a distinct consumer/profile identity                                                     | `.kiro/skills/<name>/`   | Unverified            |

Kiro CLI means V3 for the documented full inclusion modes. Legacy V1/V2 and custom-agent resource configurations are unsupported by this candidate. Coalescing identical IDE/CLI bytes is verified as compiler behavior and does not establish equal runtime loading.

Primary source references: [Codex instructions](https://developers.openai.com/codex/guides/agents-md/), [Codex skills](https://developers.openai.com/codex/skills/), [Claude memory](https://code.claude.com/docs/en/memory), [Claude skills](https://code.claude.com/docs/en/skills), [Kiro steering](https://kiro.dev/docs/steering/), [Kiro skills](https://kiro.dev/docs/skills/) and the [Agent Skills specification](https://agentskills.io/specification). The research records the October 9 documentation review and October 10 Kiro CLI recheck; this audit adds implementation evidence, not a new live certification.

## Scope and adaptation

The compiler selects the whole target set before generation. Codex's shared baseline must be eligible and effectively always-on for every selected consumer that can load it. Native restricted Claude/Kiro rules avoid that shared route. Incompatible restrictions or mixed activation produce `SHARED_SCOPE_LEAK`, with no artifacts applied.

An unsupported mode fails with `ACTIVATION_UNSUPPORTED`. Only an exact declared `files-to-always` rule/target adaptation permits broadening and emits `ACTIVATION_ADAPTED`. Stale/irrelevant adaptations fail. Adapting only Codex while a selected shared-baseline consumer still needs conditional behavior fails; the [examples](../examples/README.md) show native exclusions and a Codex-only adaptation.

Portable patterns allow relative positive patterns with `*`, `?` and whole-segment `**`. Negation, braces, character classes, extglobs, traversal and absolute patterns are rejected. Veritas's matching is case-sensitive and includes dotfiles; harness equivalence across those edge cases remains unverified. A pattern matching no current project file is retained with a warning for future files.

Standard skill metadata and complete supporting Markdown, license, binary and executable assets are preserved. Veritas never executes imported scripts. Unknown frontmatter controls, tool/invocation restrictions and `agents/openai.yaml` sidecars are rejected rather than stripped or assumed enforceable. A shared Kiro path cannot leak an IDE-only/CLI-only skill or rule. Duplicate skill identity fails even with equal bytes.

Root instruction shadowing or competing Claude loading routes fail explicitly when detected in the project inventory. Nested unmanaged guidance is preserved and warned about. Global guidance and nondefault harness settings remain outside certification; a valid generated tree does not prove which instruction chain a harness reads.

## Executed fixture evidence

| Evidence                                                                                                                                                                                    | Observed scope                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Compiler tests](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/tests/unit/compiler/compile.test.ts)                                                                                                                                    | All 15 nonempty subsets of the four targets; single declared always-loading route; scope restrictions, adaptations, Kiro coalescing, duplicate skills and deterministic permutation |
| [Codex renderer](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/tests/unit/adapters/codex/render.test.ts), [Claude renderer](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/tests/unit/adapters/claude/render.test.ts), [Kiro renderer](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/tests/unit/adapters/kiro/render.test.ts) | Pure artifact bytes, parsed native metadata, complete assets, unsupported modes and identical IDE/CLI byte mapping                                                                  |
| [Package parser tests](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/tests/unit/parsing/library.test.ts)                                                                                                                               | Strict metadata, rejected invocation sidecars/native imports, relative references, byte/mode preservation and selected-source limits                                                |
| [Core example record](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/examples/verification.json)                                                                                                                                        | Eight snapshot/parser/compiler checks, baseline artifact hashes, restricted conditional rule and exact adaptation                                                                   |
| [Installed CLI record](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/examples/cli-verification.json)                                                                                                                                   | Disposable local upstream/overlay workflow; pin/update/cache restore and ownership/busy exits; no live harness invocation                                                           |

TASK-016 ran 31 compiler/adapter tests successfully. [TASK-015](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/evidence/TASK-015.md) records the installed tarball and exact CLI commands. [TASK-011](https://github.com/dills122/veritas/blob/v0.1.0-rc.0/docs/evidence/TASK-011.md) covers injected interrupted-write recovery; actual process death, PID reuse and power loss are unverified.

## Follow-up certification

For each target, record the exact harness version, settings, working directory and global/nested instruction inventory. Use isolated temporary repositories with hashed source/generated inputs. Capture native inspection/logging proving loaded paths, skill discovery and matching/nonmatching file activation. For Kiro, separately exercise manual and auto discovery on IDE and CLI V3. Verify dotfile/case/extension patterns and shadow cases, and compare all family combinations that share paths. Do not accept an LLM's assertion that it read a file as loading evidence. Preserve supporting scripts without running them.

Only upgrade a profile's evidence label after reproducible runtime observations cover its claimed behavior. New loading/output semantics require a new profile contract version and regression fixtures. Until then, generated bytes remain verified and runtime behavior remains unverified.
