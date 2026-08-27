import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from './logger';

export class ClaudeNotInstalledError extends Error {}
export class ClaudeNotAuthenticatedError extends Error {}
export class ClaudeNoSubscriptionError extends Error {}
export class ClaudeRunError extends Error {}

export interface AuthStatus {
  loggedIn: boolean;
  authMethod?: string;
  apiProvider?: string;
  email?: string;
  orgName?: string;
  subscriptionType?: string;
}

/** Locations the CLI installer uses, checked when `claude` is not on PATH. */
function candidatePaths(): string[] {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'bin', 'claude'),
    path.join(home, '.claude', 'local', 'claude'),
    path.join(home, 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Programs', 'claude', 'claude.exe'));
    }
    if (appData) {
      candidates.push(path.join(appData, 'npm', 'claude.cmd'));
    }
  }

  return candidates;
}

let resolvedPath: string | undefined;

export function forgetResolvedPath(): void {
  resolvedPath = undefined;
}

/**
 * Find the `claude` executable. Prefers the configured path, then PATH, then
 * the standard install locations.
 */
export async function resolveClaudePath(
  configured: string,
  log: Logger
): Promise<string> {
  if (configured) {
    if (!fs.existsSync(configured)) {
      throw new ClaudeNotInstalledError(
        `\`claudeAutoCommit.claudePath\` points at ${configured}, which does not exist.`
      );
    }
    return configured;
  }

  if (resolvedPath) {
    return resolvedPath;
  }

  const onPath = process.platform === 'win32' ? 'claude.cmd' : 'claude';
  if (await canRun(onPath)) {
    log.info(`Found claude on PATH as \`${onPath}\`.`);
    resolvedPath = onPath;
    return resolvedPath;
  }

  for (const candidate of candidatePaths()) {
    if (fs.existsSync(candidate) && (await canRun(candidate))) {
      log.info(`Found claude at ${candidate}.`);
      resolvedPath = candidate;
      return resolvedPath;
    }
  }

  throw new ClaudeNotInstalledError(
    'Could not find the Claude Code CLI. Install it, or set `claudeAutoCommit.claudePath`.'
  );
}

function canRun(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { shell: process.platform === 'win32' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Read the signed-in account. This is the subscription gate: Claude Auto Commit only
 * runs for an account signed in through claude.ai with an active plan.
 */
export async function getAuthStatus(
  claudePath: string,
  log: Logger
): Promise<AuthStatus> {
  const { stdout, code } = await run(claudePath, ['auth', 'status', '--json'], {
    timeoutMs: 20000,
  });

  if (code !== 0) {
    throw new ClaudeNotAuthenticatedError(
      'Could not read your Claude authentication status. Run `claude auth login` in a terminal.'
    );
  }

  try {
    const status = JSON.parse(stdout.trim()) as AuthStatus;
    log.info(
      `Auth: loggedIn=${status.loggedIn} method=${status.authMethod ?? 'unknown'} plan=${
        status.subscriptionType ?? 'none'
      }`
    );
    return status;
  } catch {
    throw new ClaudeNotAuthenticatedError(
      'Claude returned an authentication status this extension could not read.'
    );
  }
}

const SUBSCRIPTION_PLANS = new Set(['pro', 'max', 'max_5x', 'max_20x', 'team', 'enterprise']);

export function assertActiveSubscription(status: AuthStatus): void {
  if (!status.loggedIn) {
    throw new ClaudeNotAuthenticatedError(
      'You are not signed in to Claude. Run `claude auth login` and choose your Claude account.'
    );
  }

  const plan = (status.subscriptionType ?? '').toLowerCase();
  if (!SUBSCRIPTION_PLANS.has(plan)) {
    throw new ClaudeNoSubscriptionError(
      status.authMethod === 'apiKey' || status.apiProvider !== 'firstParty'
        ? 'Claude Auto Commit needs an account signed in through claude.ai with an active Claude plan. ' +
          'The CLI is currently authenticated another way.'
        : 'No active Claude plan was found on your account. Claude Auto Commit needs a Pro, Max, Team, or Enterprise plan.'
    );
  }
}

export interface GenerateRequest {
  claudePath: string;
  cwd: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  timeoutMs: number;
  token: vscode.CancellationToken;
}

export interface GenerateResult<T> {
  value: T;
  costUsd: number;
  durationMs: number;
}

/**
 * Run a one-shot, tool-free Claude turn constrained to a JSON schema.
 *
 * Tools, session persistence and settings discovery are all switched off: this
 * call reads nothing but the prompt it is handed, and leaves nothing behind.
 */
export async function generateStructured<T>(
  request: GenerateRequest,
  log: Logger
): Promise<GenerateResult<T>> {
  const args = [
    '--print',
    request.userPrompt,
    '--model',
    request.model,
    '--system-prompt',
    request.systemPrompt,
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(request.jsonSchema),
    '--tools',
    '',
    '--no-session-persistence',
    '--setting-sources',
    '',
    '--disable-slash-commands',
  ];

  log.info(`Running claude with model ${request.model} in ${request.cwd}`);

  const { stdout, stderr, code } = await run(request.claudePath, args, {
    cwd: request.cwd,
    timeoutMs: request.timeoutMs,
    token: request.token,
  });

  if (code !== 0) {
    log.error(`claude exited with code ${code}: ${stderr.trim() || '(no stderr)'}`);
    throw new ClaudeRunError(firstLine(stderr) || `Claude exited with code ${code}.`);
  }

  const payload = parseResultLine(stdout);

  if (payload.is_error || payload.subtype !== 'success') {
    const detail =
      (Array.isArray(payload.errors) && payload.errors.join('; ')) ||
      (typeof payload.result === 'string' && payload.result) ||
      payload.subtype;
    throw new ClaudeRunError(`Claude could not complete the request: ${detail}`);
  }

  const structured = payload.structured_output ?? safeJson(payload.result);
  if (!structured) {
    throw new ClaudeRunError('Claude did not return a structured commit message.');
  }

  return {
    value: structured as T,
    costUsd: typeof payload.total_cost_usd === 'number' ? payload.total_cost_usd : 0,
    durationMs: typeof payload.duration_ms === 'number' ? payload.duration_ms : 0,
  };
}

interface ResultPayload {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  errors?: unknown;
  structured_output?: unknown;
  total_cost_usd?: unknown;
  duration_ms?: unknown;
}

/** The CLI prints one JSON object; be forgiving about anything printed before it. */
function parseResultLine(stdout: string): ResultPayload {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new ClaudeRunError('Claude produced no output.');
  }

  const lines = trimmed.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = safeJson(lines[i]);
    if (parsed && typeof parsed === 'object' && (parsed as ResultPayload).type === 'result') {
      return parsed as ResultPayload;
    }
  }

  const whole = safeJson(trimmed);
  if (whole && typeof whole === 'object') {
    return whole as ResultPayload;
  }

  throw new ClaudeRunError('Could not parse the response from Claude.');
}

function safeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}

interface RunOptions {
  cwd?: string;
  timeoutMs: number;
  token?: vscode.CancellationToken;
}

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function run(command: string, args: string[], options: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      env: {
        ...process.env,
        // Keep the CLI in machine-readable mode regardless of user shell config.
        CLAUDE_CODE_ENTRYPOINT: 'vscode-claude-autocommit',
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cancelSub?.dispose();
      fn();
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(() =>
        reject(
          new ClaudeRunError(
            `Claude did not respond within ${Math.round(options.timeoutMs / 1000)}s.`
          )
        )
      );
    }, options.timeoutMs);

    const cancelSub = options.token?.onCancellationRequested(() => {
      child.kill();
      finish(() => reject(new vscode.CancellationError()));
    });

    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));

    child.on('error', (error) => {
      finish(() => reject(new ClaudeNotInstalledError(`Could not run \`${command}\`: ${error.message}`)));
    });

    child.on('close', (code) => {
      finish(() => resolve({ stdout, stderr, code }));
    });
  });
}
