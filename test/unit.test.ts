import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCommitMessage } from '../src/format';
import { DEFAULT_EMOJI_MAP, emojiFor } from '../src/commitTypes';
import { buildJsonSchema, buildSystemPrompt } from '../src/prompt';
import type { ClaudeAutoCommitConfig } from '../src/config';

const baseConfig: ClaudeAutoCommitConfig = {
  model: 'claude-sonnet-5',
  emojiPosition: 'beforeType',
  includeScope: true,
  subjectCase: 'lower',
  includeBody: true,
  bodyStyle: 'bullets',
  maxSubjectLength: 72,
  detectBreakingChanges: true,
  types: ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
  emojiMap: DEFAULT_EMOJI_MAP,
  customInstructions: '',
  language: 'English',
  maxDiffBytes: 120000,
  claudePath: '',
  timeoutSeconds: 120,
  appendMode: 'replace',
};

test('formatCommitMessage: standard feat with scope and bullets', () => {
  const msg = formatCommitMessage(
    {
      type: 'feat',
      scope: 'auth',
      subject: 'add passkey login',
      body: ['Allow passkey enrollment', 'Support biometric authentication'],
      breaking: false,
      breakingDescription: null,
    },
    baseConfig
  );

  assert.equal(
    msg,
    '✨ feat(auth): add passkey login\n\n- Allow passkey enrollment\n- Support biometric authentication'
  );
});

test('formatCommitMessage: afterType emoji positioning', () => {
  const msg = formatCommitMessage(
    {
      type: 'feat',
      scope: 'auth',
      subject: 'add passkey login',
      body: [],
      breaking: false,
      breakingDescription: null,
    },
    { ...baseConfig, emojiPosition: 'afterType' }
  );

  assert.equal(msg, 'feat(auth): ✨ add passkey login');
});

test('formatCommitMessage: none emoji positioning', () => {
  const msg = formatCommitMessage(
    {
      type: 'feat',
      scope: 'auth',
      subject: 'add passkey login',
      body: [],
      breaking: false,
      breakingDescription: null,
    },
    { ...baseConfig, emojiPosition: 'none' }
  );

  assert.equal(msg, 'feat(auth): add passkey login');
});

test('formatCommitMessage: breaking change formatting', () => {
  const msg = formatCommitMessage(
    {
      type: 'fix',
      scope: 'api',
      subject: 'drop legacy v1 endpoints',
      body: ['Removed deprecated endpoints'],
      breaking: true,
      breakingDescription: 'Migrate to /v2/api',
    },
    baseConfig
  );

  assert.equal(
    msg,
    '🐛 fix(api)!: drop legacy v1 endpoints\n\n- Removed deprecated endpoints\n\nBREAKING CHANGE: Migrate to /v2/api'
  );
});

test('formatCommitMessage: bodyStyle paragraphs', () => {
  const msg = formatCommitMessage(
    {
      type: 'docs',
      scope: null,
      subject: 'update installation guide',
      body: ['This document explains setup steps.', 'Ensure Node 20 or higher is installed.'],
      breaking: false,
      breakingDescription: null,
    },
    { ...baseConfig, bodyStyle: 'paragraphs' }
  );

  assert.equal(
    msg,
    '📝 docs: update installation guide\n\nThis document explains setup steps.\n\nEnsure Node 20 or higher is installed.'
  );
});

test('formatCommitMessage: subject truncation on word boundary', () => {
  const msg = formatCommitMessage(
    {
      type: 'feat',
      scope: null,
      subject: 'a very long subject line that should definitely exceed the configured character budget limit easily',
      body: [],
      breaking: false,
      breakingDescription: null,
    },
    { ...baseConfig, maxSubjectLength: 40 }
  );

  assert.ok(msg.length <= 40);
  assert.ok(!msg.endsWith(' '));
  assert.ok(!msg.endsWith(','));
});

test('commitTypes: emojiFor custom mapping override', () => {
  const emoji = emojiFor('feat', { feat: '🚀' });
  assert.equal(emoji, '🚀');
});

test('buildJsonSchema: includes allowed types', () => {
  const schema = buildJsonSchema(baseConfig) as {
    properties: { type: { enum: string[] } };
  };

  assert.deepEqual(schema.properties.type.enum, baseConfig.types);
});

test('buildSystemPrompt: includes language and instructions', () => {
  const prompt = buildSystemPrompt({
    ...baseConfig,
    language: 'French',
    customInstructions: 'Always include issue reference',
  });

  assert.ok(prompt.includes('Write the message in French.'));
  assert.ok(prompt.includes('Additional project rules: Always include issue reference'));
});

