# Compatibility fixture catalogue v1

`catalogue.json` records intended Veritas behavior. `canonical-library/` represents always/files/manual/auto steering, target restrictions and a complete portable skill. `restricted-skill/` adds advanced native controls that the bounded RC must reject explicitly. These are authored inputs for later tests; the catalogue alone does not prove implementation acceptance or runtime harness loading.

`competitor-inputs/` retains translations used in the October 9, 2026 comparison. Ruler's files input uses Claude-native `paths` frontmatter to test its handling; it is not a claim that Ruler has a canonical activation schema equivalent to Veritas. Rulesync's translation uses `root`, `globs` and typed Kiro fields. Manual/auto, advanced controls and shadow/pattern edge cases were catalogued rather than exhaustively run.

`results.json` contains three runs per tool: unmanaged baseline, unchanged repeat, then a user-edited CLAUDE file. `retests.json` contains clean Ruler repetition, Codex-only Rulesync output and reversed Rulesync target order. Inventories contain exact SHA-256 hashes and modes. `tool-pins.json` identifies exact npm package versions, registry integrity values, package entrypoint hashes and environment. Absolute temporary paths in evidence identify the experiment, not deterministic product artifacts.

Reproduce in fresh disposable directories, never this checkout:

```sh
# Use Node 24; installation is local and install scripts are disabled.
npm install --prefix /private/tmp/veritas-compat-tools --ignore-scripts --no-audit --no-fund --save-exact rulesync@29.0.0 @intellectronica/ruler@0.3.44
python3 tests/fixtures/compatibility/run-probes.py /private/tmp/veritas-compat-tools /private/tmp/veritas-compat-new-run
python3 tests/fixtures/compatibility/retests.py /private/tmp/veritas-compat-tools /private/tmp/veritas-compat-new-run
```

The retained runners use the observed `/Users/dsteele/.nvm/versions/node/v24.18.0/bin/node`; adjust that constant when reproducing elsewhere. The retest runner requires the first runner's source directories, so pass the same fresh directory to both. Do not reuse a prior run directory: the first experiment deliberately depends on initial unmanaged state.

The executable fixture is intentionally inert unless invoked. Neither Veritas nor the runners execute imported skill scripts. Skill binary asset bytes are `00 ff 0a 0d 80`; its SHA-256 is `896a425d1fade64e368ccca61003182138e59b7050bca9a7ec8f4ca99646f9fb`.
