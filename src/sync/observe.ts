import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { error, VeritasError } from '../diagnostics/index.js';
import { sha256 } from '../model/hash.js';
import { pathProblem } from '../model/paths.js';
import { LIMITS } from '../model/types.js';
import type { ObservedFileState } from '../model/types.js';

function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}
function operational(path: string, cause: unknown): never {
  throw new VeritasError(
    error(
      'OBSERVATION_FAILED',
      `Cannot safely observe ${path}: ${cause instanceof Error ? cause.message : 'filesystem error'}`,
      { id: path, path },
    ),
    4,
  );
}
async function spellingProblem(
  parent: string,
  name: string,
): Promise<string | undefined> {
  const names = await readdir(parent);
  return names.some(
    (candidate) =>
      candidate !== name && candidate.toLowerCase() === name.toLowerCase(),
  )
    ? 'Destination has a case-colliding directory entry'
    : undefined;
}

/** Validate only the trusted project boundary and ancestors within it; never follow links. */
export async function assertSafeAncestors(
  project: string,
  path: string,
): Promise<string | undefined> {
  const problem = pathProblem(path);
  if (problem) return problem;
  const root = resolve(project);
  try {
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      return 'Project root is not an ordinary directory';
    const parts = path.split('/').slice(0, -1);
    let parent = root;
    for (const part of parts) {
      const spelling = await spellingProblem(parent, part);
      if (spelling) return spelling;
      parent = join(parent, part);
      let state;
      try {
        state = await lstat(parent);
      } catch (cause) {
        if (hasCode(cause, 'ENOENT')) return undefined;
        throw cause;
      }
      if (
        !state.isDirectory() ||
        state.isSymbolicLink() ||
        (state.mode & 0o7000) !== 0
      )
        return 'Destination ancestor is not a safe ordinary directory';
      try {
        await lstat(join(parent, '.git'));
        return 'Destination crosses a nested Git root';
      } catch (cause) {
        if (!hasCode(cause, 'ENOENT')) throw cause;
      }
    }
    return undefined;
  } catch (cause) {
    return operational(path, cause);
  }
}
export type ObservedRead = { state: ObservedFileState; bytes?: Uint8Array };

/** A bounded no-follow read. Callers must separately enforce their write authority. */
export async function readObservedFile(
  project: string,
  path: string,
): Promise<ObservedRead> {
  const problem = await assertSafeAncestors(project, path);
  if (problem) return { state: { kind: 'unsafe', reason: problem } };
  const destination = join(resolve(project), path);
  try {
    const names = path.split('/');
    const spelling = await spellingProblem(
      join(resolve(project), ...names.slice(0, -1)),
      names.at(-1) ?? '',
    );
    if (spelling) return { state: { kind: 'unsafe', reason: spelling } };
    const initial = await lstat(destination);
    if (
      !initial.isFile() ||
      initial.isSymbolicLink() ||
      initial.nlink !== 1 ||
      (initial.mode & 0o7000) !== 0
    )
      return {
        state: {
          kind: 'unsafe',
          reason: 'Destination is not a safe ordinary single-link file',
        },
      };
    if (initial.size > LIMITS.assetBytes)
      return {
        state: {
          kind: 'unsafe',
          reason: 'Observed file exceeds the 10 MiB output limit',
        },
      };
    const handle = await open(
      destination,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.ino !== initial.ino ||
        opened.dev !== initial.dev ||
        (opened.mode & 0o7000) !== 0 ||
        opened.size > LIMITS.assetBytes
      )
        return {
          state: {
            kind: 'unsafe',
            reason: 'Destination changed during observation',
          },
        };
      const bytes = await handle.readFile();
      const final = await handle.stat();
      if (
        bytes.byteLength > LIMITS.assetBytes ||
        final.size !== opened.size ||
        final.mtimeMs !== opened.mtimeMs ||
        final.mode !== opened.mode ||
        final.nlink !== 1
      )
        return {
          state: {
            kind: 'unsafe',
            reason: 'Destination changed during observation',
          },
        };
      return {
        state: {
          kind: 'file',
          sha256: sha256(bytes),
          executable: (opened.mode & 0o111) !== 0,
        },
        bytes,
      };
    } finally {
      await handle.close();
    }
  } catch (cause) {
    if (hasCode(cause, 'ENOENT')) return { state: { kind: 'missing' } };
    if (hasCode(cause, 'ELOOP') || hasCode(cause, 'ENOTDIR'))
      return {
        state: {
          kind: 'unsafe',
          reason: 'Destination changed to an unsafe path',
        },
      };
    return operational(path, cause);
  }
}
export async function observe(
  project: string,
  path: string,
): Promise<ObservedFileState> {
  return (await readObservedFile(project, path)).state;
}
export function equalState(
  a: ObservedFileState,
  b: ObservedFileState,
): boolean {
  return (
    (a.kind === 'missing' && b.kind === 'missing') ||
    (a.kind === 'file' &&
      b.kind === 'file' &&
      a.sha256 === b.sha256 &&
      a.executable === b.executable)
  );
}
