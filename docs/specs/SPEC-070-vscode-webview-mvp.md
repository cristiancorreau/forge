# SPEC-070 Webview de configuración en la extensión VS Code (MVP)

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

Usuarios que no saben usar la consola necesitan un modo de configuración visual.
La extensión VS Code (`vscode-extension/`, v0.6.0) ya existe y ya invoca la CLI
via `spawn` (`getCliCommand`/`runForge`). La vía de menor esfuerzo y mayor alcance
es agregarle un **Webview con formularios**, no construir una app nueva. La GUI es
solo presentación; el motor sigue siendo el **mismo `dist/cli.js`** (paridad casi
trivial).

## Decisión

1. **`src/ipc.ts`** — contrato tipado único acción→args CLI (fuente de verdad para
   los tests de paridad): `runInit({answersFile})`→`['init','--from',f]`,
   `runAdopt({runtime,mode,wiki})`→`['adopt','--yes',...]`, `runAudit`→`['audit','--json']`,
   `runDoctor`, `runGenerate({runtime})`. Función pura `toArgs(action, payload): string[]`.
2. **`src/webview/panel.ts`** — `WebviewPanel` con CSP, `postMessage` y router que
   mapea mensajes del form → `toArgs` → `spawn` (reusa `getCliCommand`).
3. **`media/`** — HTML/CSS/JS (vanilla o preact, sin React pesado) con:
   - Form "Proyecto nuevo" (init): pasos tipo→stack→DB/ORM/pkg/testing→modo→runtime→skills,
     validación de nombre/slug en vivo, preview (`--dry-run`) antes de aplicar; al confirmar
     escribe `answers.json` temporal y corre `forge init --from`.
   - Form "Adoptar proyecto existente" (adopt): runtime+mode+wiki, preview `--dry-run`, aplicar.
   - Panel de diagnóstico: `audit --json` + `doctor` como lista accionable.
4. Comando `forge.openConfigPanel` y un botón en la status bar.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Solo comandos de paleta (hoy) | Cero trabajo | No sirve a no-consola | Es el problema a resolver |
| Importar libs de la CLI en vez de spawn | Sin subproceso | La CLI es ESM sin `exports`; frágil; rompe paridad | Spawn del binario es más robusto |

## Criterios de aceptación

- [ ] `toArgs()` es puro y testeado (cada acción → args exactos).
- [ ] El webview abre, valida el form y corre la acción via spawn del mismo CLI.
- [ ] Form init usa `forge init --from` (SPEC-069); form adopt usa `adopt --yes`.
- [ ] Tests de mapeo + (con la CLI build) paridad de artefactos (ver SPEC-072).

## Impacto de compliance

Ninguno.
