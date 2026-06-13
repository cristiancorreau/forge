# SPEC-072 Tests de paridad GUI ↔ CLI

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

La GUI (webview SPEC-070 y app SPEC-071) debe "hacer lo mismo que la CLI". Como
ambas GUIs **spawnean el mismo `dist/cli.js`**, la paridad es verificable sin
runtime gráfico, en Node puro, apto para CI.

## Decisión

Cuatro capas de test (en `vscode-extension/test/` y, análogamente, en `desktop/test/`):

1. **Mapeo intención→args** (unit, `ipc.test.mjs`): importar `toArgs()` y aseverar
   que cada acción produce el subcomando y flags exactos. Atrapa la regresión de
   llamar al wizard interactivo en vez del comando no-interactivo.
2. **Validación de formularios** (unit): funciones puras de validación (slug/nombre
   regex, paths) contra casos válidos/ inválidos.
3. **Paridad de artefactos** (integración, `parity.test.mjs`): para cada comando
   núcleo (`init --from`, `adopt`, `generate`), en dos dirs temporales aislados:
   (a) rama CLI directa con args canónicos; (b) rama GUI con args de `toArgs()` a
   partir de un payload equivalente. Comparar exit code y **SHA-256** de
   `project.yaml`, `.forge/manifest.json` (excluyendo el timestamp) y cada archivo
   bajo `.claude/`. Igualdad byte a byte.
4. **Cobertura de `cliCommand`** (unit): parametrizar el split de tokens para
   `npx`/global/`pnpm dlx`/`bunx`.

Pre-requisito: `npm run build:all` (genera `dist/`). Los tests spawnean ese
`dist/cli.js` fijo (no `npx`) para evitar skew de versión. Gate de release del VSIX.

## Criterios de aceptación

- [ ] `ipc.test.mjs` cubre todas las acciones de la GUI.
- [ ] `parity.test.mjs` prueba igualdad de artefactos CLI vs GUI para init/adopt/generate.
- [ ] La suite corre en Node sin abrir VS Code, en CI.
- [ ] Se documenta que al bumpear la CLI se re-corre la paridad antes de publicar.

## Impacto de compliance

Ninguno.
