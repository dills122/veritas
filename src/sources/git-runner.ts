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

/**
 * Maps Git stderr to a fixed hint. Raw stderr is never echoed: it can carry
 * credentials or remote-controlled text.
 */
export function gitFailureHint(stderr: string): string {
  if (
    /permission denied|authentication failed|could not read username|publickey|host key verification|terminal prompts disabled/iu.test(
      stderr,
    )
  )
    return 'Authentication failed. Veritas never prompts: configure a Git credential helper or SSH agent, and confirm with `git ls-remote <url>` in your shell.';
  if (
    /could not resolve host|unable to access|connection (?:refused|timed out)|network is unreachable|timed out/iu.test(
      stderr,
    )
  )
    return 'The remote is unreachable. Check the network, VPN or proxy, and the host name in the source URL.';
  if (
    /not found|does not appear to be a git repository|repository .* not/iu.test(
      stderr,
    )
  )
    return 'The repository was not found or you lack access. Check the URL and your permissions.';
  if (
    /couldn't find remote ref|invalid refspec|not our ref|unadvertised/iu.test(
      stderr,
    )
  )
    return 'The requested ref could not be fetched. Check --ref names an existing branch, tag or commit.';
  return 'Run `git ls-remote <url>` in your shell to see the underlying Git error.';
}

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
      let stderrText = '';
      let bytes = 0,
        outputBytes = 0,
        failure: VeritasError | undefined;
      function fail(code: string, message: string): void {
        failure ??= sourceError(
          code,
          options.cwd,
          message,
          code === 'GIT_UNAVAILABLE'
            ? 'Install Git and make sure it is on PATH.'
            : code === 'GIT_TIMEOUT'
              ? 'The remote did not answer within 30 seconds. Check the network and retry.'
              : undefined,
        );
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
        if (stderrText.length < 8192) stderrText += chunk.toString('utf8');
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
          reject(
            sourceError(
              'GIT_FAILED',
              'git',
              'Git command failed',
              gitFailureHint(stderrText),
            ),
          );
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
