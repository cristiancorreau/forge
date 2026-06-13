# SPEC-062 Artefacto `.forge/state/` — re-anclaje de contexto determinístico

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

Del análisis vs Open GSD (`docs/analysis/forge-vs-gsd-2026-06.md`): GSD ataca el
"context rot" con artefactos durables (`.planning/` STATE/ROADMAP/PLAN) que el
agente relee. forge no aborda la persistencia del "big picture": solo tiene
`project.yaml` (config) y el manifest de instalación.

forge no es orquestador (no observa la ejecución en vivo), así que no replica la
orquestación fresh-context de GSD. Pero sí puede dar al modelo un **punto de
re-anclaje determinístico**: un artefacto Markdown regenerable desde la fuente de
verdad que forge ya tiene.

## Decisión

1. **Generador `lib/generators/state.ts`** — función pura que, desde `project.yaml`
   + las specs en `docs/specs/`, emite:
   - `.forge/state/STATE.md` — sprint/fase activa, mode, runtime, agentes activos.
   - `.forge/state/PLAN.md` — specs por estado (APPROVED / DRAFT / IMPLEMENTED) con su título.
   - `.forge/state/CONTEXT.md` — stack, misión, comandos frecuentes (resumen para re-anclaje).
2. Se registra en `generators/registry.ts` como una superficie más; lo emite
   `forge generate` y `forge init`/`adopt`. Entra al manifest SHA-256 (drift en `audit`).
3. El hook `session-start.js` (que ya lee `project.yaml`) se extiende para inyectar
   un resumen de `.forge/state/STATE.md` al iniciar sesión.
4. El artefacto es **derivado y regenerable** (no editable a mano); el header lo declara.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Replicar `.planning/` + orquestación fresh-context de GSD | Cierra el gap completo | Requiere runtime de ejecución; forge es compilador | Fuera del modelo de forge |
| No hacer nada | Cero esfuerzo | Deja el gap de mayor severidad abierto | El re-anclaje es adoptable hoy |

## Criterios de aceptación

- [ ] `generateState(config, specs)` es puro y determinístico (mismo input → misma salida).
- [ ] `forge generate` emite `.forge/state/{STATE,PLAN,CONTEXT}.md`.
- [ ] El artefacto se incluye en el manifest y `audit` detecta drift.
- [ ] `session-start.js` inyecta el resumen de STATE.md.
- [ ] El header del artefacto marca que es generado (no editar a mano).
- [ ] Tests del generador + suite completa verde.

## Impacto de compliance

Ninguno. Solo lee config/specs locales y escribe Markdown.
