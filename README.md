<div align="center">

<img src="media/icon.png" width="112" alt="Claude Commit" />

# Claude Commit

**Conventional Commit messages, written by Claude, from your staged changes.**

One click in the Source Control view. One emoji, on the type, where it belongs.

</div>

---

## What it does

Claude Commit adds a ✨ button to the Source Control title bar. Press it and the
extension reads your **staged** diff, hands it to Claude, and fills the commit
message box with a proper Conventional Commit:

```
✨ feat(auth): add passkey enrollment to the login flow

- Passkeys are stored per device so a lost phone does not lock the account out
- Falls back to the existing password flow when the browser has no authenticator
```

```
🐛 fix(uploads)!: stop retrying non-idempotent multipart parts

- A retried part could duplicate a chunk when S3 had already accepted the first
  attempt but the response was lost

BREAKING CHANGE: `upload()` no longer accepts `retryAll`. Pass `retryPolicy: "idempotent-only"`.
```

Exactly one emoji per message, and it always belongs to the **type** — never
sprinkled through the description.

## Requirements

Claude Commit runs on **your existing Claude subscription**. There is no API key
to paste and no separate billing.

1. Install the [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/setup)
2. Sign in: `claude auth login`
3. Install this extension

The extension checks `claude auth status` before every run and refuses to
proceed unless you are signed in through claude.ai on an active **Pro, Max,
Team, or Enterprise** plan. Usage is billed to that account like any other
Claude Code usage.

To confirm your setup at any time, run **Claude Commit: Check Claude
Subscription Status** from the Command Palette.

## Usage

| How | What happens |
| --- | --- |
| ✨ button in the Source Control title bar | Writes the message into the commit box for you to review and edit |
| **Claude Commit: Generate Message and Commit** | Writes the message and commits the staged files in one step |
| **Claude Commit: Cancel Generation** | Stops a run in progress |

Only **staged** changes are read. Nothing unstaged, nothing already committed,
and no files outside the diff — Claude runs with every tool switched off, so it
cannot read, write, or execute anything in your repository.

## Commit types

Each type carries exactly one emoji. Both are configurable.

| Type | Emoji | Used for |
| --- | :---: | --- |
| `feat` | ✨ | a new capability |
| `fix` | 🐛 | corrects broken behaviour |
| `docs` | 📝 | documentation only |
| `style` | 💄 | formatting, no logic change |
| `refactor` | ♻️ | restructuring without behaviour change |
| `perf` | ⚡️ | measurably faster or lighter |
| `test` | ✅ | tests only |
| `build` | 📦️ | build system, bundler, dependencies |
| `ci` | 👷 | pipelines and workflows |
| `chore` | 🔧 | maintenance that fits nowhere else |
| `revert` | ⏪️ | reverts a previous commit |

Extra types are recognised if you add them to `claudeCommit.types`, including
`security` 🔒️, `deps` ⬆️, `init` 🎉, `wip` 🚧, `remove` 🔥, `hotfix` 🚑️,
`i18n` 🌐, `a11y` ♿️, and `release` 🔖.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `claudeCommit.model` | `claude-sonnet-5` | Model used. `claude-haiku-4-5` is faster and cheaper, `claude-opus-5` is the most careful. |
| `claudeCommit.emojiPosition` | `beforeType` | `✨ feat: …`, `feat: ✨ …`, or `none`. |
| `claudeCommit.includeScope` | `true` | Include `(scope)` after the type. |
| `claudeCommit.subjectCase` | `lower` | `lower`, `sentence`, or `preserve`. Acronyms are never lowercased. |
| `claudeCommit.includeBody` | `true` | Write a body under the subject. |
| `claudeCommit.bodyStyle` | `bullets` | `bullets` or wrapped `paragraphs`. |
| `claudeCommit.maxSubjectLength` | `72` | Subject budget, emoji and prefix included. |
| `claudeCommit.detectBreakingChanges` | `true` | Allow `!` and a `BREAKING CHANGE:` footer. |
| `claudeCommit.types` | 11 types | Which types Claude may choose from. |
| `claudeCommit.emojiMap` | `{}` | Override any type's emoji, e.g. `{ "feat": "🚀" }`. |
| `claudeCommit.customInstructions` | `""` | Extra project rules appended to the prompt. |
| `claudeCommit.language` | `English` | Language the message is written in. |
| `claudeCommit.maxDiffBytes` | `120000` | Diff size budget. Larger diffs are trimmed per file, and you are told. |
| `claudeCommit.claudePath` | `""` | Path to `claude` if it is not discoverable automatically. |
| `claudeCommit.timeoutSeconds` | `120` | How long to wait before giving up. |
| `claudeCommit.appendMode` | `replace` | `keepExisting` leaves a non-empty commit box alone. |

Settings are read per folder, so a workspace can pin its own conventions in
`.vscode/settings.json`:

```jsonc
{
  "claudeCommit.types": ["feat", "fix", "docs", "chore", "deps"],
  "claudeCommit.emojiMap": { "deps": "⬆️" },
  "claudeCommit.customInstructions": "Reference the Linear ticket from the branch name as a footer, e.g. 'Refs: ENG-1234'."
}
```

## Large diffs

When a staged diff exceeds `maxDiffBytes`, the extension does not silently cut
it off. Every staged file still gets its own share of the budget with an
explicit marker where content was dropped, the prompt tells Claude the diff was
shortened, and you get a notification asking you to review the result before
committing.

## Privacy

Your staged diff is sent to Anthropic to generate the message, under the same
terms as the rest of your Claude Code usage. The extension:

- reads only what `git diff --cached` returns
- runs Claude with `--tools ""`, so no file, shell, or network tool is available
- runs with `--no-session-persistence` and `--setting-sources ""`, so nothing is
  written to disk and no project settings, hooks, or MCP servers are loaded
- stores no credentials of its own — authentication belongs entirely to the
  Claude Code CLI

## Troubleshooting

**"Could not find the Claude Code CLI"** — install it, or set
`claudeCommit.claudePath` to the absolute path of the `claude` binary. Find it
with `which claude` (macOS/Linux) or `where claude` (Windows).

**"No active Claude plan was found"** — run `claude auth login` and sign in with
the Claude account that holds your subscription. If the CLI is authenticated
with an API key or through Bedrock/Vertex, sign in through claude.ai instead.

**The message isn't what you wanted** — it lands in the commit box, not in a
commit. Edit it freely, then adjust `claudeCommit.customInstructions` so the
next one comes out closer.

For anything else, run **Claude Commit: Show Logs**.

## Contributing

```bash
npm install
npm run watch     # rebuild on change
```

Press <kbd>F5</kbd> to launch an Extension Development Host with the extension
loaded. `npm run check-types` and `npm run lint` must pass before a PR.

## License

[MIT](LICENSE) © Sudeepta Sarkar

Not an official Anthropic product. Claude and Claude Code are trademarks of
Anthropic, PBC.
