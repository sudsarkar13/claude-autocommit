/**
 * Conventional Commit types paired with exactly one gitmoji each.
 *
 * One emoji per commit, attached to the type — never to the description.
 * Users can override any of these through `claudeAutoCommit.emojiMap`.
 */
export const DEFAULT_EMOJI_MAP: Readonly<Record<string, string>> = {
  feat: '✨',
  fix: '🐛',
  docs: '📝',
  style: '💄',
  refactor: '♻️',
  perf: '⚡',
  test: '🧪',
  build: '📦',
  ci: '👷',
  chore: '🔧',
  revert: '⏪',
  // Not in the default type list, but recognised if a user adds them.
  security: '🔒',
  deps: '⬆️',
  init: '🎉',
  wip: '🚧',
  remove: '🔥',
  hotfix: '🚑',
  i18n: '🌐',
  a11y: '♿',
  release: '🔖',
  config: '🔧',
  merge: '🔀',
};

/** Short guidance shown to Claude so it picks the type the same way a human would. */
export const TYPE_GUIDANCE: Readonly<Record<string, string>> = {
  feat: 'a new capability visible to users of the code',
  fix: 'corrects broken behaviour',
  docs: 'documentation, comments, or README only',
  style: 'formatting, whitespace, or purely cosmetic UI changes; no logic change',
  refactor: 'restructures code without changing behaviour',
  perf: 'makes something measurably faster or lighter',
  test: 'adds or changes tests only',
  build: 'build system, bundler, packaging, or dependency manifests',
  ci: 'CI/CD pipelines and workflow files',
  chore: 'maintenance that fits no other type',
  revert: 'reverts a previous commit',
  security: 'fixes or hardens a security issue',
  deps: 'upgrades or pins dependencies',
  init: 'initial commit for a project or module',
  wip: 'deliberately incomplete work',
  remove: 'deletes code or files',
  hotfix: 'urgent production fix',
  i18n: 'internationalisation and localisation',
  a11y: 'accessibility improvements',
  release: 'version bump or release tagging',
  config: 'configuration files',
  merge: 'merges branches',
};

export function emojiFor(
  type: string,
  overrides: Record<string, string>
): string | undefined {
  return overrides[type] ?? DEFAULT_EMOJI_MAP[type];
}
