import * as vscode from 'vscode';
import {
  ClaudeNoSubscriptionError,
  ClaudeNotAuthenticatedError,
  ClaudeNotInstalledError,
  ClaudeRunError,
  assertActiveSubscription,
  forgetResolvedPath,
  generateStructured,
  getAuthStatus,
  resolveClaudePath,
} from './claudeCli';
import { readConfig } from './config';
import { formatCommitMessage } from './format';
import { GitUnavailableError, getStagedDiff, resolveRepository } from './git';
import { Logger } from './logger';
import { CommitDraft, buildJsonSchema, buildSystemPrompt, buildUserPrompt } from './prompt';
import type { Repository } from './gitApi';

const RUNNING_CONTEXT = 'claudeAutoCommit.running';
const CLI_DOCS = 'https://docs.claude.com/en/docs/claude-code/setup';

let log: Logger;
let currentRun: vscode.CancellationTokenSource | undefined;

export function activate(context: vscode.ExtensionContext): void {
  log = new Logger();
  context.subscriptions.push(log);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeAutoCommit.generate',
      (sourceControl?: vscode.SourceControl) => runGenerate(sourceControl, false)
    ),
    vscode.commands.registerCommand(
      'claudeAutoCommit.generateAndCommit',
      (sourceControl?: vscode.SourceControl) => runGenerate(sourceControl, true)
    ),
    vscode.commands.registerCommand('claudeAutoCommit.cancel', () => {
      currentRun?.cancel();
    }),
    vscode.commands.registerCommand('claudeAutoCommit.checkAuth', () => checkAuth()),
    vscode.commands.registerCommand('claudeAutoCommit.showOutput', () => log.show())
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('claudeAutoCommit.claudePath')) {
        forgetResolvedPath();
      }
    })
  );

  log.info('Claude Auto Commit activated.');
}

export function deactivate(): void {
  currentRun?.cancel();
}

async function runGenerate(
  sourceControl: vscode.SourceControl | undefined,
  commitAfterwards: boolean
): Promise<void> {
  if (currentRun) {
    vscode.window.showInformationMessage('Claude Auto Commit is already generating a message.');
    return;
  }

  const source = new vscode.CancellationTokenSource();
  currentRun = source;
  await vscode.commands.executeCommand('setContext', RUNNING_CONTEXT, true);

  try {
    await generate(sourceControl, commitAfterwards, source.token);
  } catch (error) {
    if (error instanceof vscode.CancellationError) {
      log.info('Generation cancelled.');
    } else {
      await reportError(error);
    }
  } finally {
    source.dispose();
    currentRun = undefined;
    await vscode.commands.executeCommand('setContext', RUNNING_CONTEXT, false);
  }
}

async function generate(
  sourceControl: vscode.SourceControl | undefined,
  commitAfterwards: boolean,
  token: vscode.CancellationToken
): Promise<void> {
  const repo = await resolveRepository(sourceControl);
  if (!repo) {
    return;
  }

  const config = readConfig(repo.rootUri);

  if (
    config.appendMode === 'keepExisting' &&
    repo.inputBox.value.trim().length > 0 &&
    !commitAfterwards
  ) {
    vscode.window.showInformationMessage(
      'Claude Auto Commit left your existing message alone (`claudeAutoCommit.appendMode` is set to `keepExisting`).'
    );
    return;
  }

  const claudePath = await resolveClaudePath(config.claudePath, log);
  assertActiveSubscription(await getAuthStatus(claudePath, log));

  const message = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.SourceControl,
      title: 'Claude is reading your staged changes…',
      cancellable: true,
    },
    async (_progress, progressToken) => {
      const linked = linkTokens(token, progressToken);
      try {
        return await produceMessage(repo, config, claudePath, linked.token);
      } finally {
        linked.dispose();
      }
    }
  );

  if (!message) {
    return;
  }

  if (commitAfterwards) {
    await repo.commit(message);
    log.info('Committed staged changes.');
    vscode.window.showInformationMessage(`Committed: ${message.split('\n')[0]}`);
    return;
  }

  repo.inputBox.value = message;
  await vscode.commands.executeCommand('workbench.view.scm');
}

async function produceMessage(
  repo: Repository,
  config: ReturnType<typeof readConfig>,
  claudePath: string,
  token: vscode.CancellationToken
): Promise<string | undefined> {
  const staged = await getStagedDiff(repo, config.maxDiffBytes);

  if (staged.files.length === 0 || !staged.diff.trim()) {
    vscode.window.showWarningMessage(
      'Nothing is staged. Stage the changes you want described, then run Claude Auto Commit again.'
    );
    return undefined;
  }

  if (staged.trimmed) {
    log.warn(
      `Staged diff is ${staged.originalBytes} bytes; trimmed to fit the ${config.maxDiffBytes} byte budget.`
    );
  }

  const result = await generateStructured<CommitDraft>(
    {
      claudePath,
      cwd: repo.rootUri.fsPath,
      model: config.model,
      systemPrompt: buildSystemPrompt(config),
      userPrompt: buildUserPrompt(staged, repo.state.HEAD?.name),
      jsonSchema: buildJsonSchema(config),
      timeoutMs: config.timeoutSeconds * 1000,
      token,
    },
    log
  );

  const message = formatCommitMessage(result.value, config);
  log.info(
    `Generated in ${Math.round(result.durationMs)}ms (~$${result.costUsd.toFixed(4)}): ${
      message.split('\n')[0]
    }`
  );

  if (staged.trimmed) {
    vscode.window.showInformationMessage(
      'The staged diff was too large to send in full, so Claude wrote this message from a trimmed version. Review it before committing.'
    );
  }

  return message;
}

async function checkAuth(): Promise<void> {
  try {
    const config = readConfig();
    const claudePath = await resolveClaudePath(config.claudePath, log);
    const status = await getAuthStatus(claudePath, log);

    assertActiveSubscription(status);

    vscode.window.showInformationMessage(
      `Claude Auto Commit is ready — signed in as ${status.email ?? 'your account'} on the ${
        status.subscriptionType ?? 'unknown'
      } plan.`
    );
  } catch (error) {
    await reportError(error);
  }
}

async function reportError(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  log.error('Claude Auto Commit failed.', error);

  if (error instanceof ClaudeNotInstalledError) {
    const choice = await vscode.window.showErrorMessage(
      message,
      'Installation Guide',
      'Open Settings'
    );
    if (choice === 'Installation Guide') {
      vscode.env.openExternal(vscode.Uri.parse(CLI_DOCS));
    } else if (choice === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'claudeAutoCommit.claudePath');
    }
    return;
  }

  if (error instanceof ClaudeNotAuthenticatedError || error instanceof ClaudeNoSubscriptionError) {
    const choice = await vscode.window.showErrorMessage(message, 'Sign In', 'Show Logs');
    if (choice === 'Sign In') {
      const terminal = vscode.window.createTerminal('Claude Sign In');
      terminal.show();
      terminal.sendText('claude auth login');
    } else if (choice === 'Show Logs') {
      log.show();
    }
    return;
  }

  if (error instanceof GitUnavailableError) {
    vscode.window.showErrorMessage(message);
    return;
  }

  const choice = await vscode.window.showErrorMessage(
    error instanceof ClaudeRunError ? message : `Claude Auto Commit failed: ${message}`,
    'Show Logs'
  );
  if (choice === 'Show Logs') {
    log.show();
  }
}

/** Cancel when either the command or the progress notification is cancelled. */
function linkTokens(
  a: vscode.CancellationToken,
  b: vscode.CancellationToken
): vscode.CancellationTokenSource & vscode.Disposable {
  const source = new vscode.CancellationTokenSource();
  const subs = [
    a.onCancellationRequested(() => source.cancel()),
    b.onCancellationRequested(() => source.cancel()),
  ];

  const originalDispose = source.dispose.bind(source);
  source.dispose = () => {
    subs.forEach((sub) => sub.dispose());
    originalDispose();
  };

  return source;
}
