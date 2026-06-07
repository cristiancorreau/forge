# Changelog — forge (VS Code extension)

## [0.6.0]

### Added
- **`forge: Recommend`** command — runs the stack-aware advisor (`forge recommend`)
  in an integrated terminal: best catalog items for this project, with a WHY
  anchored in the detected stack. Read-only; re-run with `--apply` to install.

### Fixed
- **Search Catalog** now reads the unified catalog output (SPEC-050). The CLI's
  `aitmpl-search --json` switched from `name` to `label`/`id`; the extension's
  parser accepts both, so catalog search works again against forge ≥ 3.4.0.

> Publishing: push a `vscode-v0.6.0` tag or run the `publish-vscode` workflow
> (needs the `VSCE_PAT` repo secret). See README.
