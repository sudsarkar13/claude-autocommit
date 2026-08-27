import type { ClaudeCommitConfig } from './config';
import { TYPE_GUIDANCE, emojiFor } from './commitTypes';
import type { StagedDiff } from './git';

export interface CommitDraft {
  type: string;
  scope: string | null;
  subject: string;
  body: string[];
  breaking: boolean;
  breakingDescription: string | null;
}

export function buildJsonSchema(config: ClaudeCommitConfig): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: config.types,
        description: 'The Conventional Commit type that best matches the change.',
      },
      scope: {
        type: ['string', 'null'],
        description: config.includeScope
          ? 'One or two words naming the area of the codebase touched, lowercase. Null when the change spans the whole project.'
          : 'Always null.',
      },
      subject: {
        type: 'string',
        description:
          'Imperative-mood summary of the change. No emoji, no type prefix, no trailing period.',
      },
      body: {
        type: 'array',
        items: { type: 'string' },
        description: config.includeBody
          ? 'One entry per point worth making about what changed and why. Empty array when the subject says it all.'
          : 'Always an empty array.',
      },
      breaking: {
        type: 'boolean',
        description: 'True only when this change breaks an existing public API or contract.',
      },
      breakingDescription: {
        type: ['string', 'null'],
        description: 'What breaks and what callers must do about it. Null unless breaking is true.',
      },
    },
    required: ['type', 'scope', 'subject', 'body', 'breaking', 'breakingDescription'],
    additionalProperties: false,
  };
}

export function buildSystemPrompt(config: ClaudeCommitConfig): string {
  const budget = subjectTextBudget(config);

  const typeList = config.types
    .map((type) => {
      const emoji = emojiFor(type, config.emojiMap);
      const guidance = TYPE_GUIDANCE[type];
      const parts = [`- ${type}`];
      if (emoji) {
        parts.push(`(${emoji})`);
      }
      if (guidance) {
        parts.push(`— ${guidance}`);
      }
      return parts.join(' ');
    })
    .join('\n');

  const rules: string[] = [
    `Write the message in ${config.language}.`,
    'Pick exactly one type from the list. Choose it from what the change does, not from which files it touches — a change under `tests/` that fixes broken behaviour is still a `fix`.',
    `Keep \`subject\` in the imperative mood ("add", not "added" or "adds"), under ${budget} characters, with no trailing period and no emoji — the emoji is added afterwards from the type.`,
    config.subjectCase === 'sentence'
      ? 'Start `subject` with a capital letter.'
      : config.subjectCase === 'lower'
        ? 'Start `subject` with a lowercase letter unless the first word is an acronym or identifier such as `API` or `OAuth`.'
        : 'Capitalise `subject` however reads best.',
    'Describe what the change does, never the mechanics of the diff. "add retry to the upload queue", not "change 3 lines in upload.ts".',
  ];

  if (config.includeScope) {
    rules.push(
      'Set `scope` to the module, package, or feature area the change belongs to, in lowercase. Use `null` when the change is repository-wide, when the files share no common area, or when the only scope you can think of repeats the type.'
    );
  } else {
    rules.push('Always set `scope` to null.');
  }

  if (config.includeBody) {
    rules.push(
      'Use `body` for context the subject cannot carry: why the change was needed, consequences for callers, anything a reviewer would otherwise have to reconstruct. Leave it empty for changes that are fully explained by the subject.',
      config.bodyStyle === 'bullets'
        ? 'Each `body` entry becomes one bullet. Keep each to a single line — one idea, roughly 100 characters. Split a second idea into a second entry rather than extending the first.'
        : 'Each `body` entry becomes one paragraph. Two or three sentences at most.',
      'Never restate the subject in the body, and never list the changed filenames — the commit already records those.'
    );
  } else {
    rules.push('Always return an empty `body` array.');
  }

  if (config.detectBreakingChanges) {
    rules.push(
      'Set `breaking` to true only when existing callers must change: a removed or renamed export, a changed function signature, a migration, a dropped configuration key. Refactors that preserve behaviour are not breaking. When true, `breakingDescription` says what breaks and what to do about it.'
    );
  } else {
    rules.push('Always set `breaking` to false and `breakingDescription` to null.');
  }

  rules.push(
    'You are shown only the staged changes. Say nothing about work that is not in this diff, and do not speculate about intent the diff does not support.'
  );

  if (config.customInstructions) {
    rules.push(`Additional project rules: ${config.customInstructions}`);
  }

  return [
    'You write git commit messages from staged diffs. You produce Conventional Commits and nothing else — no commentary, no questions, no preamble.',
    '',
    'Available types:',
    typeList,
    '',
    'Rules:',
    ...rules.map((rule) => `- ${rule}`),
    '',
    'Return your answer through the structured output schema.',
  ].join('\n');
}

export function buildUserPrompt(staged: StagedDiff, branch: string | undefined): string {
  const sections: string[] = [];

  if (branch) {
    sections.push(`Current branch: ${branch}`);
  }

  const fileList = staged.files
    .map((file) =>
      file.originalPath
        ? `- ${file.status}: ${file.originalPath} → ${file.path}`
        : `- ${file.status}: ${file.path}`
    )
    .join('\n');

  sections.push(`Staged files (${staged.files.length}):\n${fileList}`);

  if (staged.trimmed) {
    sections.push(
      `Note: the full staged diff is ${formatBytes(staged.originalBytes)} and was shortened to fit. ` +
        'Every staged file is represented below, but some hunks are cut short where marked. ' +
        'Write the message from what you can see and stay general where the detail was dropped.'
    );
  }

  sections.push(`Staged diff:\n\n${staged.diff}`);

  return sections.join('\n\n');
}

function subjectTextBudget(config: ClaudeCommitConfig): number {
  // Reserve room for the emoji, the type, an optional scope, and ": ".
  const overhead = 2 + longest(config.types) + (config.includeScope ? 14 : 0) + 2;
  return Math.max(20, config.maxSubjectLength - overhead);
}

function longest(values: string[]): number {
  return values.reduce((max, value) => Math.max(max, value.length), 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
