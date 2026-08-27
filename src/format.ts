import type { ClaudeAutoCommitConfig } from './config';
import { emojiFor } from './commitTypes';
import type { CommitDraft } from './prompt';

/**
 * Render a draft into a Conventional Commit message.
 *
 * The subject carries exactly one emoji, chosen from the commit type — never
 * from the description, and never more than one. Anything the model may have
 * put there itself is stripped first.
 */
export function formatCommitMessage(
  draft: CommitDraft,
  config: ClaudeAutoCommitConfig
): string {
  const type = normalizeType(draft.type, config);
  const emoji = config.emojiPosition === 'none' ? undefined : emojiFor(type, config.emojiMap);
  let scope = config.includeScope ? normalizeScope(draft.scope) : undefined;
  // A scope that merely repeats the type adds nothing: `ci(ci):` reads worse than `ci:`.
  if (scope === type) {
    scope = undefined;
  }
  const breaking = config.detectBreakingChanges && draft.breaking;

  let prefix = type;
  if (scope) {
    prefix += `(${scope})`;
  }
  if (breaking) {
    prefix += '!';
  }

  const subject = applyCase(cleanSubject(draft.subject), config.subjectCase);
  let line: string;

  switch (config.emojiPosition) {
    case 'beforeType':
      line = `${emoji ? emoji + ' ' : ''}${prefix}: ${subject}`;
      break;
    case 'afterType':
      line = `${prefix}: ${emoji ? emoji + ' ' : ''}${subject}`;
      break;
    default:
      line = `${prefix}: ${subject}`;
  }

  const lines = [truncateSubject(line, config.maxSubjectLength)];

  const body = config.includeBody ? renderBody(draft.body, config) : '';
  if (body) {
    lines.push('', body);
  }

  if (breaking && draft.breakingDescription) {
    lines.push('', `BREAKING CHANGE: ${cleanText(draft.breakingDescription)}`);
  }

  return lines.join('\n');
}

function renderBody(body: string[], config: ClaudeAutoCommitConfig): string {
  const entries = body.map(cleanText).filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    return '';
  }

  if (config.bodyStyle === 'bullets') {
    return entries.map((entry) => `- ${stripLeadingBullet(entry)}`).join('\n');
  }

  return entries.map((entry) => wrap(stripLeadingBullet(entry), 72)).join('\n\n');
}

function normalizeType(type: string, config: ClaudeAutoCommitConfig): string {
  const lower = cleanText(type).toLowerCase().replace(/[^a-z]/g, '');
  if (config.types.includes(lower)) {
    return lower;
  }
  // The schema constrains this, but never emit a type the user did not allow.
  return config.types[0] ?? 'chore';
}

function normalizeScope(scope: string | null): string | undefined {
  if (!scope) {
    return undefined;
  }
  const normalized = cleanText(scope)
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, '-');

  if (!normalized || normalized === 'null' || normalized === 'none') {
    return undefined;
  }
  return normalized;
}

/**
 * Matches a whole emoji grapheme — base pictograph plus any skin-tone modifier,
 * variation selector, and ZWJ-joined continuation — so multi-codepoint emoji are
 * removed as a unit rather than leaving orphaned joiners behind.
 */
const EMOJI_PATTERN =
  /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F)?)*/gu;

/**
 * Apply the configured subject capitalisation.
 *
 * Only a plainly capitalised first word is touched — `Add` becomes `add`, while
 * `API`, `OAuth`, and `TypeScript` keep the casing they need to stay readable.
 */
function applyCase(subject: string, mode: ClaudeAutoCommitConfig['subjectCase']): string {
  if (mode === 'preserve' || subject.length === 0) {
    return subject;
  }

  const [first, ...rest] = subject.split(' ');

  if (mode === 'sentence') {
    return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
  }

  const isPlainlyCapitalised = /^[A-Z][a-z']*$/.test(first);
  return isPlainlyCapitalised ? [first.toLowerCase(), ...rest].join(' ') : subject;
}

/** Strip emoji and collapse whitespace, leaving sentence punctuation intact. */
function cleanText(value: string): string {
  return value.replace(EMOJI_PATTERN, '').replace(/\s+/g, ' ').trim();
}

/**
 * Subject lines additionally lose any trailing period — Conventional Commits
 * subjects do not end in one, and body sentences keep theirs.
 */
function cleanSubject(value: string): string {
  return cleanText(value).replace(/\.+$/, '').trim();
}

function stripLeadingBullet(value: string): string {
  return value.replace(/^[-*•]\s*/, '');
}

/**
 * Truncate on a word boundary so a long subject degrades to a shorter sentence
 * rather than a cut-off word.
 */
function truncateSubject(line: string, max: number): string {
  if ([...line].length <= max) {
    return line;
  }

  const chars = [...line];
  const hard = chars.slice(0, max).join('');
  const lastSpace = hard.lastIndexOf(' ');
  const cut = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard;
  return cut.replace(/[,;:\s]+$/, '');
}

function wrap(text: string, width: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.join('\n');
}
