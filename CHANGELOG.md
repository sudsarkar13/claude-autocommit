# Changelog

All notable changes to Claude Commit are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-27

Initial release.

### Added

- ✨ button in the Source Control title bar that writes a Conventional Commit
  message from the staged diff into the commit input box.
- **Generate Message and Commit** command that writes the message and commits in
  one step, plus **Cancel Generation** for a run in progress.
- Subscription gate: the extension verifies through `claude auth status` that a
  claude.ai account with an active Pro, Max, Team, or Enterprise plan is signed
  in before it will run.
- Exactly one emoji per message, attached to the commit type, positioned before
  or after the type or omitted entirely.
- Eleven default commit types with gitmoji defaults, and ten more recognised
  types available through `claudeCommit.types`.
- Breaking-change detection producing `type(scope)!:` and a `BREAKING CHANGE:`
  footer.
- Per-file diff trimming with an explicit notice when a staged diff is too large
  to send in full.
- Configurable model, scope, subject case, body style, subject length, language,
  emoji overrides, and free-form project instructions.
