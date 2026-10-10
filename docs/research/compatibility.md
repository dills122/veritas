# Veritas harness compatibility research

Veritas's adapter profiles define artifact and loading behavior, with evidence separate from model output. These mappings are documentation-based as reviewed on October 9, 2026; certification requires exact harness versions, settings, and observed loading evidence.

## Vendor constraints

Codex builds an instruction chain along repository-root-to-current-directory ancestry, selecting at most one file per directory and preferring AGENTS.override.md. It discovers repository skills through `.agents/skills` and supports linked skill directories. These behaviors do not supply a general glob-triggered steering mechanism. [Codex instructions](https://developers.openai.com/codex/guides/agents-md/), [Codex skills](https://developers.openai.com/codex/skills/).

Claude rules support `paths` frontmatter, and CLAUDE.md supports imports. Current documentation describes AGENTS.md discovery conditional on CLAUDE files/settings. Generate an explicit import for a shared baseline and test its route. Veritas must reject malformed rule frontmatter before a harness treats it as unconditional content. [Claude memory](https://code.claude.com/docs/en/memory). Skill invocation and tool controls need typed capability checks. [Claude skills](https://code.claude.com/docs/en/skills).

Kiro supports always, fileMatch, manual, and auto steering, including arrays of file-match patterns. AGENTS.md is another always-loaded surface. Custom agents require explicit resource configuration and are outside v0.1 certification. Keep IDE and CLI profile identities distinct. [Kiro steering](https://kiro.dev/docs/steering/). Workspace skills reside in `.kiro/skills`. [Kiro skills](https://kiro.dev/docs/skills/).

The Agent Skills standard defines required name/description metadata, directory identity, and supporting files. Experimental tool declarations are not assumed to enforce identical restrictions across consumers. [Agent Skills specification](https://agentskills.io/specification).

## Initial capability profile

| Feature | Codex | Claude | Kiro IDE | Kiro CLI |
| --- | --- | --- | --- | --- |
| Always steering | Shared AGENTS | Import shared AGENTS or native rule | Shared AGENTS or native steering | Same only after profile fixtures |
| File steering | Unsupported | Native tested paths subset | Native tested fileMatch subset | Profile-gated native |
| Manual steering | Unsupported | Unsupported | Native manual | Profile-gated manual |
| Auto steering | Unsupported | Unsupported | Native auto with name/description | Profile-gated auto |
| Portable skill | Native placement | Native placement | Native placement | Profile-gated native |
| Invocation/tool restriction | Typed support or error | Typed support or error | Typed support or error | Typed support or error |
| File rule made always | Exact opt-in adaptation | Exact opt-in adaptation | Exact opt-in adaptation | Exact opt-in adaptation |

`codex-repo-v1`, `claude-repo-v1`, `kiro-ide-repo-v1`, and `kiro-cli-repo-v1` are proposed Veritas profile IDs, not harness versions. Each profile records source URLs, tested patterns/features, shadow cases, actual version/range, settings, certification status, and evidence paths. Rendering fixtures cannot establish runtime certification.

## Same checkout fixtures

| Fixture | Required result |
| --- | --- |
| All three families | One effective baseline route per consumer |
| All seven non-empty family subsets | Minimal outputs, no unnecessary shared file |
| Both Kiro surfaces | Coalesce only identical bytes and compatible declarations |
| Codex-only baseline alongside Kiro | Fail leakage; no override |
| Claude/Kiro-only rule | Native restricted route outside shared baseline |
| Extension/dotfile/case patterns | Tested equivalent mapping or explicit unsupported |
| Existing override/competing root Claude file | Fail a shadowed generated route |
| Existing nested/global guidance | Inventory, preserve, qualify certification |
| Restricted skill on incapable consumer | Fail; no metadata stripping |
| Stale adaptation | Error |

## Existing engines

Rulesync documents rules and skills with distinct Kiro targets. Ruler documents native skill propagation across the three families. Their feature lists establish overlap, without proving or disproving Veritas's pinning, ownership, or recovery contracts. [Rulesync](https://github.com/dyoshikawa/rulesync), [Ruler](https://github.com/intellectronica/ruler).

TASK-001 produces `docs/research/build-vs-reuse.md`: pinned revisions, commands, fixture translations, output trees, diagnostics, repeat-run deltas, edited/unmanaged output behavior, API and license conclusions. Run tools only in disposable fixture copies; never apply them to this repository's AI Central guidance. Comparative execution and live certification remain pending.

## Runtime method

Use isolated temporary repositories and a controlled environment. Record tool versions, settings/global instructions, input/output hashes, and logs or native inspection proving loaded paths. Check baseline discovery, matching/nonmatching activation, manual/auto discovery, and skill availability without executing package scripts. An LLM claiming it read a file is insufficient evidence.

If a harness or credentials are unavailable, complete compiler tests, record the precise gap, and retain the documentation-based label. Changes to loading or output require a new profile version and regression fixtures.

Kickoff implementation rechecked [Kiro steering](https://kiro.dev/docs/steering/) on October 10 UTC: full CLI inclusion modes require V3; V1/V2 are partial. The bundled CLI profile targets V3 and does not imply legacy certification.
