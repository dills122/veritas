import { spawn } from 'node:child_process';
import type { VeritasError } from '../diagnostics/index.js';
import { sourceError } from './snapshot.js';

export type GitRunOptions = {
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  input?: Uint8Array;
};
export type GitRunner = (
  args: readonly string[],
  options: GitRunOptions,
) => Promise<Uint8Array>;

function gitEnvironment(): NodeJS.ProcessEnv {
  const blocked = new Set([
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_PARAMETERS',
    'GIT_TEMPLATE_DIR',
    'GIT_DEFAULT_HASH',
    'GIT_REPLACE_REF_BASE',
    'GIT_NAMESPACE',
    'GIT_EXEC_PATH',
  ]);
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!blocked.has(key) && !/^GIT_CONFIG_(?:KEY|VALUE)_/u.test(key))
      env[key] = value;
  }
  return {
    ...env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_PROTOCOL_FROM_USER: '0',
    GIT_ALLOW_PROTOCOL: 'https:ssh',
  };
}

/** User authentication configuration stays available; repository/environment redirection does not. */
export function createGitRunner(executable = 'git'): GitRunner {
  return (args, options) =>
    new Promise((resolve, reject) => {
      if (
        !Number.isSafeInteger(options.timeoutMs) ||
        options.timeoutMs <= 0 ||
        !Number.isSafeInteger(options.maxOutputBytes) ||
        options.maxOutputBytes <= 0
      ) {
        reject(
          sourceError('GIT_FAILED', options.cwd, 'Invalid Git process limits'),
        );
        return;
      }
      const child = spawn(executable, [...args], {
        cwd: options.cwd,
        env: gitEnvironment(),
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const output: Uint8Array[] = [];
      let bytes = 0,
        outputBytes = 0,
        failure: VeritasError | undefined;
      function fail(code: string, message: string): void {
        failure ??= sourceError(code, options.cwd, message);
        if (child.pid !== undefined) {
          try {
            if (process.platform === 'win32') child.kill('SIGKILL');
            else process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        }
      }
      const timer = setTimeout(
        () => fail('GIT_TIMEOUT', 'Git command timed out'),
        options.timeoutMs,
      );
      child.on('error', (cause: unknown) => {
        const missing =
          typeof cause === 'object' &&
          cause !== null &&
          'code' in cause &&
          cause.code === 'ENOENT';
        fail(
          missing ? 'GIT_UNAVAILABLE' : 'GIT_FAILED',
          missing ? 'Git executable is unavailable' : 'Git command failed',
        );
      });
      child.stdin.on('error', () => fail('GIT_FAILED', 'Git command failed'));
      child.stdout.on('error', () => fail('GIT_FAILED', 'Git command failed'));
      child.stderr.on('error', () => fail('GIT_FAILED', 'Git command failed'));
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > options.maxOutputBytes) {
          fail(
            'GIT_OUTPUT_LIMIT',
            'Git output exceeds the configured byte limit',
          );
          return;
        }
        outputBytes += chunk.byteLength;
        output.push(Uint8Array.from(chunk));
      });
      child.stderr.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > options.maxOutputBytes)
          fail(
            'GIT_OUTPUT_LIMIT',
            'Git output exceeds the configured byte limit',
          );
      });
      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        if (failure) {
          reject(failure);
          return;
        }
        if (code !== 0) {
          reject(sourceError('GIT_FAILED', options.cwd, 'Git command failed'));
          return;
        }
        const result = new Uint8Array(outputBytes);
        let offset = 0;
        for (const chunk of output) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(result);
      });
      child.stdin.end(options.input);
    });
}
