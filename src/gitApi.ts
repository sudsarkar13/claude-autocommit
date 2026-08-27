/**
 * Minimal typings for the API exported by the built-in `vscode.git` extension.
 * Only the members this extension actually uses are declared here; the full
 * surface lives in the VS Code repository as `extensions/git/src/api/git.d.ts`.
 */
import type { Uri, Event, Disposable } from 'vscode';

export const enum Status {
  INDEX_MODIFIED = 0,
  INDEX_ADDED = 1,
  INDEX_DELETED = 2,
  INDEX_RENAMED = 3,
  INDEX_COPIED = 4,
  MODIFIED = 5,
  DELETED = 6,
  UNTRACKED = 7,
  IGNORED = 8,
  INTENT_TO_ADD = 9,
  INTENT_TO_RENAME = 10,
  TYPE_CHANGED = 11,
}

export interface Change {
  readonly uri: Uri;
  readonly originalUri: Uri;
  readonly renameUri: Uri | undefined;
  readonly status: Status;
}

export interface Branch {
  readonly name?: string;
  readonly upstream?: { readonly name: string; readonly remote: string };
  readonly ahead?: number;
  readonly behind?: number;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly indexChanges: Change[];
  readonly workingTreeChanges: Change[];
  readonly mergeChanges: Change[];
  readonly onDidChange: Event<void>;
}

export interface SourceControlInputBox {
  value: string;
  placeholder: string;
}

export interface CommitOptions {
  all?: boolean | 'tracked';
  amend?: boolean;
  signoff?: boolean;
  signCommit?: boolean;
  empty?: boolean;
  noVerify?: boolean;
}

export interface Repository {
  readonly rootUri: Uri;
  readonly inputBox: SourceControlInputBox;
  readonly state: RepositoryState;

  /** Diff against the index when `cached` is true, otherwise the working tree. */
  diff(cached?: boolean): Promise<string>;
  diffIndexWithHEAD(): Promise<Change[]>;
  diffIndexWithHEAD(path: string): Promise<string>;
  commit(message: string, opts?: CommitOptions): Promise<void>;
}

export interface API {
  readonly state: 'uninitialized' | 'initialized';
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
  getRepository(uri: Uri): Repository | null;
}

export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): API;
}

export type { Disposable };
