# SPEC-029 Dogfooding: implementar forge en el propio repo

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-03 | Actualizada: 2026-06-03

## Contexto

El repo declara `mode: enterprise` con `rules.require_spec_before_implementation: true`,
pero NO tiene instalados los guardrails de forge: faltan `.claude/hooks/`,
`.claude/commands/`, `.claude/architecture.rules`, el registry de hooks en
`.claude/settings.json` y el `.forge/manifest.json` no lista los 7 agentes
especializados. Es decir, forge predica el gate spec-first pero no se lo aplica a
sí mismo. Hacer dogfooding (correr `forge init` sobre el propio repo) destapa dos
bugs reales en `packages/cli/src/commands/init.ts` y varias inconsistencias en la
configuración del proyecto. Si no lo resolvemos, el repo queda fuera de
conformidad con su propia metodología y los bugs siguen afectando a cualquier
proyecto que use `forge init` sobre una config ya existente.

## Decisión

Aplicar los guardrails de forge al propio repo y corregir, en el mismo paso, lo
que el dogfooding deja al descubierto:

**Parte A — bugs en `init.ts`**

1. Preservación de settings: al escribir `.claude/settings.json`, si el archivo
   ya existe, MERGEAR los settings generados con el archivo existente preservando
   las top-level keys que forge no gestiona (especialmente `env`) y las entradas
   previas de `permissions.allow`. Hoy se sobrescribe y se destruye `env`.
2. Manifest incluye Tier 3: el build de `.forge/manifest.json` solo lista los
   agentes `active`+`compliance`. Debe incluir también
   `.claude/agents/<agente>.md` por cada agente en `agents.specialized`, más los
   hooks instalados (`.claude/hooks/*`) y los slash commands (`.claude/commands/*`)
   cuando existan.

**Parte B — correr el CLI corregido** con `forge init --force` para instalar
hooks, commands, `architecture.rules`, registry de hooks en `settings.json`
(preservando `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`), regenerar el manifest
con los 7 agentes forge-* y CLAUDE.md.

**Parte C — inconsistencias**

1. `forge-quality-reviewer.md`: agregar sección `## Reglas` (el estándar de agente
   la requiere; `forge audit` la reporta faltante).
2. `project.yaml`: `stack.testing` usa `vitest` pero el CLI corre con `node --test`
   → cambiar a `node-test` (y agregarlo al enum del schema). `agents.by_role`
   usa pins inventados (`claude-opus-4-7`/`claude-sonnet-4-6`) → cambiar a
   `opus`/`sonnet` para coincidir con el frontmatter `model:`.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Sobrescribir settings.json siempre | Simple | Destruye `env` y permisos del usuario | Es justamente el bug que dogfooding destapa |
| Instalar a mano los hooks sin correr el CLI | Rápido | No prueba el path real de `forge init`; los bugs quedan vivos | No es dogfooding real |
| Dejar `vitest` en project.yaml | Cero cambios al schema | La config miente sobre el runner real (`node --test`) | Inconsistencia real a corregir |

## Criterios de aceptación

- [ ] `forge init --force` merge-a `.claude/settings.json` preservando `env` y `permissions.allow` previos
- [ ] El manifest incluye `.claude/agents/<agente>.md` por cada `agents.specialized`, más hooks y commands instalados
- [ ] Tests cubren ambos fixes (env preservado al re-init; manifest incluye un agente especializado) y pasan
- [ ] El repo tiene instalados `.claude/hooks/`, `.claude/commands/`, `.claude/architecture.rules` y el registry de hooks en `settings.json`
- [ ] `.claude/settings.json` mantiene `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` y sigue siendo JSON válido
- [ ] `.forge/manifest.json` lista los 7 agentes forge-* especializados
- [ ] `forge-quality-reviewer.md` tiene sección `## Reglas`
- [ ] `project.yaml`: `stack.testing` usa `node-test`/`pytest`; `agents.by_role` usa `opus`/`sonnet`
- [ ] `forge validate` → OK; `forge audit` → 0 warn, 0 error y "hooks" ya no se reporta como faltante

## Impacto de compliance

- Ninguno. Es tooling interno del repo; no procesa datos personales ni regulados.

## Dependencias

- Ninguna. Reutiliza el CLI TypeScript existente (`forge init`/`validate`/`audit`).

## Notas de implementación

- Para que `forge validate` siga pasando con `node-test`, se agrega `node-test` al
  enum `stack.testing` del schema (`core/schemas/project.schema.json`), porque el
  CLI valida contra el schema del propio forge root.
