import * as vscode from 'vscode';
import { API, Change, GitExtension, Repository, Status } from './gitApi';

export class GitUnavailableError extends Error {}

let cachedApi: API | undefined;

export async function getGitApi(): Promise<API> {
  if (cachedApi) {
    return cachedApi;
  }

  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) {
    throw new GitUnavailableError(
      'The built-in Git extension is not available. Enable it to use Claude Auto Commit.'
    );
  }

  const exports = extension.isActive ? extension.exports : await extension.activate();
  if (!exports.enabled) {
    throw new GitUnavailableError(
      'Git support is disabled in this window (`git.enabled` is false).'
    );
  }

  cachedApi = exports.getAPI(1);
  return cachedApi;
}

/**
 * Resolve which repository the user means: the one whose SCM view they clicked,
 * the one owning the active editor, or — when neither is knowable and several
 * are open — whichever they pick.
 */
export async function resolveRepository(
  sourceControl?: vscode.SourceControl
): Promise<Repository | undefined> {
  const api = await getGitApi();

  if (api.repositories.length === 0) {
    throw new GitUnavailableError('No Git repository is open in this window.');
  }

  if (sourceControl?.rootUri) {
    const fromScm = api.getRepository(sourceControl.rootUri);
    if (fromScm) {
      return fromScm;
    }
  }

  if (api.repositories.length === 1) {
    return api.repositories[0];
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const fromEditor = api.getRepository(activeUri);
    if (fromEditor) {
      return fromEditor;
    }
  }

  const picked = await vscode.window.showQuickPick(
    api.repositories.map((repo) => ({
      label: vscode.workspace.asRelativePath(repo.rootUri, false) || repo.rootUri.fsPath,
      description: repo.rootUri.fsPath,
      repo,
    })),
    { title: 'Claude Auto Commit', placeHolder: 'Which repository do you want a message for?' }
  );

  return picked?.repo;
}

export interface StagedFile {
  path: string;
  status: string;
  /** Present only when the file was renamed, so the model can say so. */
  originalPath?: string;
}

const INDEX_STATUS_LABELS: Partial<Record<Status, string>> = {
  [Status.INDEX_ADDED]: 'added',
  [Status.INDEX_MODIFIED]: 'modified',
  [Status.INDEX_DELETED]: 'deleted',
  [Status.INDEX_RENAMED]: 'renamed',
  [Status.INDEX_COPIED]: 'copied',
  [Status.INTENT_TO_ADD]: 'added',
  [Status.INTENT_TO_RENAME]: 'renamed',
  [Status.TYPE_CHANGED]: 'type changed',
};

export function describeStagedFiles(repo: Repository): StagedFile[] {
  return repo.state.indexChanges.map((change: Change) => {
    const target = change.renameUri ?? change.uri;
    const file: StagedFile = {
      path: relativeTo(repo, target),
      status: INDEX_STATUS_LABELS[change.status] ?? 'changed',
    };

    const original = relativeTo(repo, change.originalUri);
    if (change.renameUri && original !== file.path) {
      file.originalPath = original;
    }

    return file;
  });
}

function relativeTo(repo: Repository, uri: vscode.Uri): string {
  const root = repo.rootUri.fsPath.replace(/[\\/]+$/, '');
  const full = uri.fsPath;
  if (full.startsWith(root + '/') || full.startsWith(root + '\\')) {
    return full.slice(root.length + 1).replace(/\\/g, '/');
  }
  return full.replace(/\\/g, '/');
}

export interface StagedDiff {
  files: StagedFile[];
  diff: string;
  /** True when the diff had to be shortened to fit the size budget. */
  trimmed: boolean;
  originalBytes: number;
}

/**
 * Collect the staged diff, trimming it to `maxBytes` when necessary.
 *
 * Trimming keeps every staged path represented — each file gets an equal share
 * of the budget and an explicit marker where content was dropped — so the model
 * never silently loses sight of a file that is part of the commit.
 */
export async function getStagedDiff(
  repo: Repository,
  maxBytes: number
): Promise<StagedDiff> {
  const files = describeStagedFiles(repo);
  const full = await repo.diff(true);
  const originalBytes = Buffer.byteLength(full, 'utf8');

  if (originalBytes <= maxBytes) {
    return { files, diff: full, trimmed: false, originalBytes };
  }

  const perFileBudget = Math.max(1200, Math.floor(maxBytes / Math.max(files.length, 1)));
  const parts: string[] = [];

  for (const file of files) {
    let fileDiff: string;
    try {
      fileDiff = await repo.diffIndexWithHEAD(file.path);
    } catch {
      // Deleted or binary paths can fail here; the header alone still tells
      // the model the file is part of the commit.
      fileDiff = '';
    }

    if (!fileDiff.trim()) {
      parts.push(`--- ${file.path} (${file.status}, diff unavailable) ---`);
      continue;
    }

    parts.push(truncateDiff(fileDiff, perFileBudget));
  }

  return {
    files,
    diff: parts.join('\n\n'),
    trimmed: true,
    originalBytes,
  };
}

function truncateDiff(diff: string, budget: number): string {
  if (Buffer.byteLength(diff, 'utf8') <= budget) {
    return diff;
  }

  const lines = diff.split('\n');
  const kept: string[] = [];
  let used = 0;

  for (const line of lines) {
    const size = Buffer.byteLength(line, 'utf8') + 1;
    if (used + size > budget) {
      kept.push(`[... ${lines.length - kept.length} more lines omitted ...]`);
      break;
    }
    kept.push(line);
    used += size;
  }

  return kept.join('\n');
}
