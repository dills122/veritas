import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { error } from '../diagnostics/index.js';
import { pathProblem } from '../model/paths.js';
import { createFiles } from '../sync/authoring.js';
import type { Rollback } from '../sync/authoring.js';
import { CommandError } from './pipeline.js';

export const SCAFFOLD_DIRECTORY = '.veritas/library';
export const SCAFFOLD_PROFILE = 'repo/baseline';
const encoder = new TextEncoder();

export const STARTER_FILES: ReadonlyArray<{ path: string; text: string }> = [
  {
    path: 'veritas.library.yaml',
    text: `# Library manifest: declares the steering and skills this repository shares
# and bundles them into profiles. Add entries here as you add files.
schemaVersion: 1
steering:
  - id: project-guidance
    path: steering/project-guidance.md
skills: []
profiles:
  baseline:
    steering: [project-guidance]
    skills: []
`,
  },
  {
    path: 'steering/project-guidance.md',
    text: `---
id: project-guidance
description: Project-wide guidance for coding agents.
activation:
  mode: always
---
# Project guidance

Replace this text with guidance your agents should always follow in this
repository: build and test commands, coding conventions, review expectations.
`,
  },
];

export type Scaffold = {
  directory: string;
  files: readonly string[];
  rollback: Rollback;
};

function invalid(code: string, message: string): CommandError {
  return new CommandError(2, [error(code, message)]);
}

/** Validates init argument combinations that commander cannot express. */
export function checkInitArguments(options: {
  source?: string;
  profile?: string;
  ref?: string;
  scaffold?: string | boolean;
}): void {
  if (options.scaffold !== undefined) {
    if (options.source || options.profile || options.ref)
      throw invalid(
        'CLI_ARGUMENT_INVALID',
        '--scaffold creates its own library; do not combine it with --source, --profile or --ref',
      );
    return;
  }
  if (!options.source)
    throw invalid(
      'CLI_ARGUMENT_INVALID',
      'init needs --source <library> and --profile <namespace/profile>, or --scaffold to create a starter library',
    );
  if (!options.profile)
    throw invalid(
      'CLI_ARGUMENT_INVALID',
      'required option --profile not specified',
    );
}

/** Writes the starter library. Fails if the directory already exists. */
export async function createScaffold(
  project: string,
  requested: string | boolean,
): Promise<Scaffold> {
  const directory =
    typeof requested === 'string' ? requested : SCAFFOLD_DIRECTORY;
  const problem = pathProblem(directory);
  if (
    problem ||
    directory === '.' ||
    directory === '.veritas' ||
    directory.startsWith('.veritas/runtime')
  )
    throw invalid(
      'SCAFFOLD_PATH_INVALID',
      `Cannot create a library at '${directory}'; use a dedicated relative directory such as ${SCAFFOLD_DIRECTORY}`,
    );
  const existing = await lstat(resolve(project, directory)).then(
    () => true,
    () => false,
  );
  if (existing)
    throw new CommandError(3, [
      {
        ...error(
          'SCAFFOLD_EXISTS',
          `${directory} already exists; nothing was created`,
        ),
        remediation: `To use it as your library run: veritas init --source ${directory} --profile <namespace>/<profile> --targets <ids>`,
      },
    ]);
  const files = STARTER_FILES.map((file) => ({
    path: `${directory}/${file.path}`,
    bytes: encoder.encode(file.text),
  }));
  const rollback = await createFiles(project, files);
  return { directory, files: files.map((file) => file.path), rollback };
}
