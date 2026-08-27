# Changelog

All notable changes to Claude Auto Commit are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-27

### Added
- `claudeAutoCommit.subjectCase` is now exposed in Settings (`lower`, `sentence`, `preserve`). The prompt already honoured it, but there was no way to change it from the default.

### Fixed
- Source Control icons now scale correctly. Fixed `width`/`height` attributes pinned them to a 16px intrinsic size, so they did not fill the toolbar slot and were upscaled from a bitmap on HiDPI displays.
- The star inside the Claude node is a real transparent cutout instead of a fill hardcoded to one assumed toolbar colour, so it no longer shows as a solid blob on themes whose background is not `#1E1E1E`/`#FFFFFF`.

### Changed
- Renamed extension to **Claude Auto Commit** (`claude-autocommit`).
- Updated command and configuration namespace to `claudeAutoCommit.*`.
- Replaced generic sparkle icon in Source Control with dedicated Claude Auto Commit logo SVGs for light and dark themes.
- Updated Source Control button tooltip to **Generate Commit with Claude Auto Commit** for clear distinction from GitHub Copilot.

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
  types available through `claudeAutoCommit.types`.
- Breaking-change detection producing `type(scope)!:` and a `BREAKING CHANGE:`
  footer.
- Per-file diff trimming with an explicit notice when a staged diff is too large
  to send in full.
- Configurable model, scope, subject case, body style, subject length, language,
  emoji overrides, and free-form project instructions.
