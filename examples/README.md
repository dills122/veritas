# Veritas examples

`company-library/` is an upstream library with three explicit profiles. `local-overlay/` holds optional project additions, copied to the consumer's `.veritas/local/`. `project/` holds configuration templates; copy the chosen template to the consumer's fixed `veritas.yaml` path rather than pass it as an arbitrary configuration flag.

| Profile/configuration                                          | Expected result                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `company/baseline` + `project/veritas.yaml`                    | All three families receive one baseline and a complete portable skill                                                                          |
| `company/native-typescript` + `project/native-typescript.yaml` | Claude/Kiro receive native file-scoped guidance; Codex receives the shared baseline; the restricted rule is explicitly outside Codex selection |
| `company/typescript` with Codex selected and no adaptation     | `ACTIVATION_UNSUPPORTED`; no artifacts are applied                                                                                             |
| `company/typescript` + `project/codex-adaptation.yaml`         | Explicit Codex-only files-to-always adaptation, with an `ACTIVATION_ADAPTED` warning                                                           |
| Baseline plus local `project` profile                          | Both upstream and project-specific always rules, with separate source identities                                                               |

The TypeScript pattern may warn that no current project file matches. It stays in output so future files can match; the empty demonstration project does not redefine the pattern.

Use the [user guide](../docs/user-guide.md) for a disposable packed-package workflow. Do not synchronize these examples into the Veritas development checkout: its existing agent-tool setup is unmanaged product content.

The skill's supporting Markdown, license notice, README, executable companion file and binary fixture all travel with the package. The binary bytes are `00 ff 0a 0d 80`. The companion script must never run during snapshotting, validation, compilation or synchronization.

`verify.mjs` checks local snapshot creation, parsing, compilation, repeat bytes and expected unsupported/adapted behavior using the built modules. Run `node examples/verify.mjs` after `npm run build`. It performs source reads and in-memory compilation only.

`verify-cli.mjs` exercises the installed packed CLI in disposable physical copies, including upstream update, exact-lock restore, live local edits and ownership conflicts. Pass the installed bin path: `node examples/verify-cli.mjs "$veritasDemoCli"`. It deletes only temporary projects it creates. [Recorded results](cli-verification.json) and [TASK-015 evidence](../docs/evidence/TASK-015.md) describe the observed macOS run; guidance generation is separate from live harness certification.
