# Changelog — forge (VS Code extension)

## [0.7.1]

### Added
- **Abrir terminal con el runtime** — tras un `init`/`adopt` exitoso en el panel,
  aparece la acción "Abrir terminal con \<runtime\>": abre una terminal integrada de
  VS Code en el workspace ejecutando el agente configurado (`claude` / `opencode` /
  `codex` / `gemini`). Usa la API de terminal de VS Code (no es un comando de la CLI;
  no afecta la paridad). Mapeo runtime→comando puro y testeado.

## [0.7.0]

### Added
- **Panel de configuración visual (webview)** — comando `forge: Abrir panel de configuración`
  y un botón en la status bar. Tres flujos sin tocar la consola: **Proyecto nuevo**
  (usa `forge init --from` con previsualización `--dry-run`), **Adoptar proyecto
  existente** (`forge adopt`) y **Diagnóstico** (`audit --json` + `doctor`) como lista
  accionable. La GUI es solo presentación: invoca el mismo `dist/cli.js` vía spawn
  (mapeo acción→args en `src/ipc.ts`). SPEC-070.
- **Tests de paridad GUI↔CLI** (SPEC-072) — `test/ipc.test.mjs` (mapeo acción→args),
  `test/validation.test.mjs` y `test/parity.test.mjs` (compara SHA-256 de
  `project.yaml` + `.claude/*` entre la CLI directa y el flujo de la GUI).

### Changed
- Cierra el drift de versión con la CLI (0.6.0 → 0.7.0). Requiere publicación manual
  al Marketplace (issue #73).

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
