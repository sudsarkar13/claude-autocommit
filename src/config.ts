import * as vscode from 'vscode';
import { DEFAULT_EMOJI_MAP } from './commitTypes';

export type EmojiPosition = 'beforeType' | 'afterType' | 'none';
export type BodyStyle = 'bullets' | 'paragraphs';
export type SubjectCase = 'lower' | 'sentence' | 'preserve';
export type AppendMode = 'replace' | 'keepExisting';

export interface ClaudeAutoCommitConfig {
  model: string;
  emojiPosition: EmojiPosition;
  includeScope: boolean;
  subjectCase: SubjectCase;
  includeBody: boolean;
  bodyStyle: BodyStyle;
  maxSubjectLength: number;
  detectBreakingChanges: boolean;
  types: string[];
  emojiMap: Record<string, string>;
  customInstructions: string;
  language: string;
  maxDiffBytes: number;
  claudePath: string;
  timeoutSeconds: number;
  appendMode: AppendMode;
}

export function readConfig(scope?: vscode.Uri): ClaudeAutoCommitConfig {
  const c = vscode.workspace.getConfiguration('claudeAutoCommit', scope ?? null);

  const configuredTypes = c.get<string[]>('types', []);
  const types = configuredTypes.length > 0 ? configuredTypes : Object.keys(DEFAULT_EMOJI_MAP);

  return {
    model: c.get<string>('model', 'claude-sonnet-5'),
    emojiPosition: c.get<EmojiPosition>('emojiPosition', 'beforeType'),
    includeScope: c.get<boolean>('includeScope', true),
    subjectCase: c.get<SubjectCase>('subjectCase', 'lower'),
    includeBody: c.get<boolean>('includeBody', true),
    bodyStyle: c.get<BodyStyle>('bodyStyle', 'bullets'),
    maxSubjectLength: c.get<number>('maxSubjectLength', 72),
    detectBreakingChanges: c.get<boolean>('detectBreakingChanges', true),
    types,
    emojiMap: { ...DEFAULT_EMOJI_MAP, ...c.get<Record<string, string>>('emojiMap', {}) },
    customInstructions: c.get<string>('customInstructions', '').trim(),
    language: c.get<string>('language', 'English').trim() || 'English',
    maxDiffBytes: c.get<number>('maxDiffBytes', 120000),
    claudePath: c.get<string>('claudePath', '').trim(),
    timeoutSeconds: c.get<number>('timeoutSeconds', 120),
    appendMode: c.get<AppendMode>('appendMode', 'replace'),
  };
}
