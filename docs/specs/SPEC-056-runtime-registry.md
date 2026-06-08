# SPEC-056 Runtime Registry + Paridad de Runtimes

> Estado: IMPLEMENTED
> Responsable: forge-cli-engineer
> Creada: 2026-06-07 | Actualizada: 2026-06-08

## Contexto

Forge soportaba 4 runtimes (claude-code, opencode, codex, kiro) con lógica `if/else`
duplicada en 3 sitios del CLI: `generate.ts`, `adopt.ts` e `init.ts`. Esto hacía que
agregar un runtime nuevo requiriera editar múltiples archivos manualmente y era fácil
olvidar alguno. Además, asm (~14-18 runtimes) tiene una cobertura mucho mayor que forge.

Este spec cierra la brecha de paridad agregando un registry central de runtimes y
expandiendo el soporte a **19 runtimes totales** (4 nativos + 15 rules-based),
igualando la cobertura de asm.

## Decisión

1. **Registry central** en `packages/cli/src/lib/generators/registry.ts` que:
   - Define `RuntimeDescriptor` con `id`, `label`, `kind` y `surfaces(config)`.
   - Exporta `RUNTIMES: RuntimeDescriptor[]`, `getRuntime(id)`, `runtimeIds()`.
   - Envuelve los generadores existentes sin reescribirlos.

2. **Generador genérico** `packages/cli/src/lib/generators/rules-doc.ts` para runtimes
   `kind: 'rules'` que produce un documento Markdown con el stack, agentes y guardrails
   del proyecto en el formato convencional de cada runtime.

3. **Runtimes rules-based** registrados (kind: 'rules') con sus rutas convencionales:

   | ID | Ruta | Fuente de la ruta |
   |----|------|-------------------|
   | cursor | `.cursor/rules/forge.md` | Convención oficial Cursor (`.cursor/rules/`) |
   | windsurf | `.windsurf/rules/forge.md` | Convención oficial Windsurf (`.windsurf/rules/`) |
   | copilot | `.github/copilot-instructions.md` | Documentación oficial GitHub Copilot custom instructions |
   | gemini | `GEMINI.md` | Convención de facto Gemini CLI (raíz del repo, análogo a CLAUDE.md) |
   | zed | `.zed/rules.md` | Convención Zed AI rules (`.zed/` config dir) |
   | cline | `.clinerules` | Convención oficial Cline (archivo `.clinerules` en raíz) |
   | aider | `CONVENTIONS.md` | Convención oficial Aider (`CONVENTIONS.md` o `AGENTS.md`) |
   | continue | `.continue/rules/forge.md` | Convención Continue.dev (`.continue/rules/`) |
   | roo | `.roo/rules/forge.md` | Convención Roo Code (`.roo/rules/`) — dudosa; elegida por analogía con cursor/windsurf |
   | amp | `AGENTS.md` | Convención Amp (usa AGENTS.md, mismo que opencode) |
   | augment | `.augment/rules/forge.md` | Convención Augment Code (`.augment/rules/`) — documentación interna |
   | antigravity | `.antigravity/rules/forge.md` | Google Antigravity (IDE agéntico) — convención `.antigravity/`, runtime emergente |
   | openclaw | `.openclaw/rules/forge.md` | OpenClaw — convención comunitaria `.openclaw/rules/`, runtime nicho |
   | pi | `.pi/rules/forge.md` | Pi — config dir `.pi/` (asm usa `~/.pi`), runtime nicho |
   | hermes | `.hermes/rules/forge.md` | Hermes — config dir `.hermes/` (asm usa `~/.hermes`), runtime nicho |

4. **Refactor** de `generate.ts` y `adopt.ts` para iterar el registry en vez de if/else.
   claude-code y kiro conservan su manejo especial por complejidad de instalación.
   opencode, codex y todos los rules-based salen del registry.

5. **init.ts** integra los runtimes nuevos vía registry para el bloque de runtimes no
   especiales (rules-based genera su surface directamente).

6. **project.schema.json** enum actualizado con todos los IDs del registry.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Plugin externo por runtime | Extensible sin tocar core | Complejidad, sin runtime node nativo | Overkill para 15 runtimes |
| Mantener if/else | Sin cambios | Escala muy mal | Inaceptable con 15 runtimes |
| Un archivo por runtime kind:rules | Máximo aislamiento | 11 archivos casi idénticos | DRY: el generador genérico es suficiente |

## Criterios de aceptación

- [x] `runtimeIds()` retorna todos los IDs registrados (al menos 19)
- [x] Cada descriptor produce ≥1 surface con path y content no vacíos
- [x] claude-code → CLAUDE.md, opencode → AGENTS.md, codex → AGENTS.md, kiro → .kiro/steering/product.md
- [x] `generate.ts` itera el registry para runtimes no especiales
- [x] `adopt.ts` itera el registry para runtimes no especiales
- [x] `project.schema.json` enum sincronizado con `runtimeIds()` (test que previene drift)
- [x] Tests en `packages/cli/test/registry.test.mjs` cubren los criterios anteriores
- [x] Build pasa sin errores TypeScript
- [x] Tests existentes siguen en verde

## Notas de implementación

- `roo`: la ruta `.roo/rules/forge.md` es la convención más frecuentemente citada en
  documentación no oficial. La documentación oficial de Roo Code no es concluyente.
  Se eligió por analogía con cursor/windsurf (ambos usan `.<runtime>/rules/`).
- `amp`: Amp CLI usa `AGENTS.md` como su archivo de instrucciones primario (análogo a
  OpenAI Codex). Se diferencia de opencode en que no crea un dir `.amp/`.
- `augment`: la ruta `.augment/rules/forge.md` está basada en documentación interna del
  equipo Augment Code. Si cambia, actualizar el descriptor en registry.ts.
- claude-code conserva su instalación rica (settings.json, hooks, agents, commands) en
  init.ts; en generate.ts también se mantiene aparte por mkdirSync y lógica propia.
- kiro conserva su manejo especial (múltiples archivos bajo .kiro/steering/ y .kiro/hooks/).
- **Expansión a 19 (2026-06-08):** se agregaron antigravity, openclaw, pi y hermes para
  igualar la cobertura de asm. Son runtimes nicho/emergentes; sus rutas siguen el patrón
  `.<runtime>/rules/forge.md` y deben actualizarse si publican una convención oficial.
  En esta tanda se corrigió además una desincronización previa: el enum de
  `project.schema.json` había quedado en 4 runtimes pese a que el registry tenía 15; ahora
  un test (`project.schema.json runtime enum matches runtimeIds()`) lo mantiene en sync.
