# TASK-002 package scaffold evidence

Completed scaffold verification at 2026-10-10 03:45–03:46 UTC on macOS, branch `feature/veritas-v01`, with uncommitted working-tree files. No staging, commits, publication or generated product guidance occurred.

## Delivered

One `veritas@0.1.0-rc.0` TypeScript NodeNext ESM package exports a quiet core and `dist/bin.js` executable. The CLI implements help/version only; other commands return invalid-command status 2. Strict compiler checks include unchecked indexing, exact optional properties, unknown catch variables and explicit override checking. Builds clean `dist/`, emit declarations and make the binary executable. Linting is type-aware for TypeScript. Formatting targets application/config/script files without rewriting design documents, local agent links or fixture bytes.

The manifest defines real `lint`, `format:check`, `typecheck`, `test`, `test:integration`, `build`, `test:package`, and `verify` commands. Unit and integration suites remain distinct and fail when no tests exist. The package gate runs `npm pack`, checks the packed file inventory, installs the archive offline into a clean temporary consumer with only runtime dependencies, executes its installed binary, imports its public core by package name, and compiles a consumer against public declarations. Temporary consumers are removed afterward.

## Dependency selection

Runtime versions: commander 15.0.0, picomatch 4.0.7, remark-frontmatter 5.0.0, remark-parse 11.0.0, unified 11.0.5, yaml 2.9.1, zod 4.6.5. Development versions include TypeScript 6.0.3, typescript-eslint 8.71.1, ESLint 10.12.0, Prettier 3.9.9, Vitest 5.0.3 and Node 24 typings. npm is pinned to the observed 11.16.0; supported Node major is 24.

Registry metadata and installed public exports/declarations were inspected with the installed `inspect-node-package-api` helper before integration. Commander `Command`, `CommanderError`, `exitOverride` and `parse` signatures were read directly. TypeScript 7.0.2 was rejected because typescript-eslint declares TypeScript `<6.1.0`. Primary references: [Commander](https://github.com/tj/commander.js), [Vitest configuration](https://vitest.dev/config/), [typescript-eslint setup](https://typescript-eslint.io/getting-started/).

An initial `npm audit --json` reported three affected packages through fast-glob → micromatch → braces, with an unpatched [stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The lead authorized removal of unused fast-glob. Final clean install reports **0 vulnerabilities**; filesystem traversal will use Node APIs.

## Exact verification

Every npm/Node command below used `PATH=/Users/dsteele/.nvm/versions/node/v24.18.0/bin:$PATH`. The observed runtime is Node **v24.18.0**, npm **11.16.0**.

| Command | Result |
| --- | --- |
| `npm test` before the core implementation | Expected failure: the public core module was absent |
| `npm ci` after dependency removal | Exit 0; 189 packages installed, 190 audited, 0 vulnerabilities |
| `node_modules/.bin/prettier --check package.json package-lock.json` | Exit 0 after lockfile revision |
| `npm run test:package` after dependency removal | Exit 0; clean consumer installation, 2 package tests and public declaration compilation |
| `npm run verify` on the final scaffold and reduced lockfile | Exit 0; lint, format, typecheck, 1 unit test, 4 integration tests, build, 2 package tests and declaration compilation |

The scaffold tests verify distribution version consistency, CLI help/version streams and absence of created project files, quiet core import, rejection of unavailable commands, installed executable behavior, clean consumer resolution and declaration usability. No skipped tests or no-tests-found escape flags were used.

## Limitations and handoff

The sandbox cannot write the default npm cache/logs, so dependency setup and packed installation verification used authorized escalation. An initial un-escalated package attempt failed at `npm pack`; the same gate passed with the needed access. npm 11.16 reports an unapproved optional `fsevents` install script; it was not approved or executed, and all gates passed without it. Linux/Windows and live harness compatibility remain unverified.

Only scaffold/package behavior is implemented. REQ-013 distribution infrastructure is established; the product release candidate and other requirements remain pending. The lead may now extend `src/index.ts` with intentional core exports and replace the CLI entry skeleton during integration. Unit/integration commands discover later suites automatically. Preserve the external consumer declaration fixture as `.ts.txt`: it is copied into the temporary consumer and compiled there, avoiding dependence on an existing checkout build during ordinary typecheck. Build and package scripts own only `dist/` and temporary consumer directories.
