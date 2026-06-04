# SPEC-030 CLAUDE.md incluye agentes especializados (Tier 3)

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

El generador de CLAUDE.md (`packages/cli/src/lib/generators/claude-code.ts`,
función `buildAgentScopeTable`) construye la sección "## Agentes y su scope" a
partir de `agents.active` + `agents.compliance` únicamente:

```ts
const active = agents?.active ?? [];
const compliance = agents?.compliance ?? [];
const all = [...active, ...compliance];
if (all.length === 0) return '';
```

Ignora por completo `agents.specialized` (los agentes Tier 3). Para un proyecto
cuyo equipo es enteramente Tier 3 —como este mismo repo forge: 7 agentes
`forge-*` declarados en `agents.specialized` y `agents.active` vacío— la
condición `all.length === 0` es verdadera y el CLAUDE.md regenerado queda **sin
ninguna tabla de agentes**. Eso es incorrecto: el archivo que el agente lee como
contexto principal omite a todo el equipo del proyecto. Si no lo arreglamos,
cualquier proyecto que use el modelo Tier 3 (incluido el propio forge) pierde la
tabla de agentes cada vez que corre `forge init`/`forge generate`.

## Decisión

Hacer que `buildAgentScopeTable` incluya también los agentes de
`agents.specialized` dentro de la misma sección "## Agentes y su scope",
agregándolos como filas de la tabla a continuación de active+compliance.

Como los agentes especializados no tienen entrada en los mapas hardcodeados
`AGENT_TRIGGER`/`AGENT_SCOPES`, se usa un fallback sensato:

- **Scope**: desde el mapa por agente `agents.scope[<agente>]` del project.yaml si
  está presente; si no, `/`.
- **Trigger** (columna "Cuándo usarlo"): texto fijo
  `tareas de su dominio (ver \`.claude/agents/<agente>.md\`)`, que apunta al
  archivo propio del agente.

La condición de "tabla vacía" pasa de `all.length === 0` a
`all.length === 0 && specialized.length === 0`: si active+compliance+specialized
están todos vacíos, se mantiene el comportamiento actual (se omite la tabla, sin
crashear). El renderizado de los agentes active/compliance no cambia.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Sección Tier 3 separada con su propio encabezado | Distingue visualmente los tiers | Duplica el header y la nota; más ruido en CLAUDE.md | La misma tabla con filas extra es más simple y suficiente |
| Agregar cada agente forge-* al mapa hardcodeado AGENT_TRIGGER | Triggers más ricos | Acopla el generador a los agentes de un proyecto concreto; no escala a equipos custom | El fallback genérico sirve para cualquier Tier 3 |
| Dejar la tabla fuera para equipos Tier 3 | Cero cambios | Es justamente el bug: el contexto principal omite al equipo | Inaceptable |

## Criterios de aceptación

- [ ] `generateClaudeMd` renderiza un agente de `agents.specialized` en la tabla cuando `agents.active` está vacío
- [ ] El scope de un agente especializado sale de `agents.scope[<agente>]` si existe, si no `/`
- [ ] El trigger de un agente especializado es `tareas de su dominio (ver \`.claude/agents/<agente>.md\`)`
- [ ] El renderizado de agentes active/compliance no cambia
- [ ] Con active+compliance+specialized todos vacíos no se renderiza la tabla y no crashea
- [ ] Hay un test en `packages/cli/test/` que cubre el caso Tier 3 y toda la suite pasa (`npm run build:all && npm test`)
- [ ] El CLAUDE.md del repo forge, regenerado con `forge init --force`, lista los 7 agentes `forge-*`
- [ ] `forge audit` sigue en 0 warn / 0 error

## Impacto de compliance

- No aplica. Es tooling interno del CLI; no procesa datos personales ni regulados.

## Dependencias

- Ninguna. Reutiliza el generador y el tipo `ProjectAgents` existentes
  (`agents.specialized` y `agents.scope` ya están en el schema v2 y en `yaml.ts`).

## Notas de implementación

- El cambio es quirúrgico, acotado a `buildAgentScopeTable`; no se modifica la
  firma de `generateClaudeMd` ni el resto del template.
- El test importa el módulo compilado `dist/lib/generators/claude-code.js` y
  asserta sobre el markdown generado (función pura), siguiendo el estilo de la
  suite con el runner nativo `node --test`.
