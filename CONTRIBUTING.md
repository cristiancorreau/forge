# Contribuir a forge

## Flujo spec-first (SDD)

forge se desarrolla **spec-first**: ningún cambio de código no trivial arranca
sin una spec aprobada. El gate es **backward-compatible y opt-in** (advierte por
defecto; bloquea solo en `mode: enterprise` con
`rules.require_spec_before_implementation: true`). Detalle completo en
[`docs/spec-gate-flow.md`](docs/spec-gate-flow.md).

1. **Crear la spec** — `cp docs/specs/_template.md docs/specs/<id>-<slug>.md` y
   completá Contexto, Decisión, Alternativas y Criterios de aceptación (estado
   inicial `DRAFT`).
2. **Aprobar** — pasá el encabezado a `Estado: APPROVED` (vía Planner-Critic si
   el proyecto es enterprise).
3. **Rama feature** — `git checkout -b feat/<tema>`, referenciando el spec ID en
   los mensajes de commit (ej: `[SPEC-028] ...`).
4. **Editar código** — el hook `pre-edit-check` valida que exista una spec
   APPROVED en `docs/specs/`.
5. **Abrir PR** — usá la plantilla; referenciá la spec (`docs/specs/<id>.md`).
   El check `spec-gate` lo verifica (informativo por defecto).
6. **Review** — ejecutá `/review` y mergeá solo con veredicto APPROVED.
7. **Cerrar** — pasá la spec a `Estado: IMPLEMENTED`.

## Cómo contribuir

### Reportar issues
Abre un issue en GitHub describiendo el problema, los pasos para reproducirlo y el comportamiento esperado.

### Añadir un profile Tier 2
Los profiles viven en `profiles/<nombre>/agents/<agente>.md`. Usa el CLI para generar el esqueleto:

```bash
npx @cristiancorreau/forge scaffold --name <stack> --engineer <agente>
```

El agente debe seguir el estándar en `docs/agent-standard.md` (versión actual: `1.0`).
Agrega una entrada al test de profiles (`packages/cli/test/tier2-profiles.test.mjs`) y, si corresponde, al catálogo del CLI (`packages/cli/src/commands/aitmpl-search.ts`).

### Añadir un MCP server al catálogo
Edita el catálogo del CLI en `packages/cli/src/commands/aitmpl-search.ts`. Cada entrada incluye el campo `install`:

```ts
{
  name: 'MCP — mi-server',
  category: 'mcp-server',
  install: {
    slug: 'mi-server',
    command: 'npx',
    args: ['-y', '@org/mcp-server'],
    params: [],
    env: [{ key: 'API_KEY', label: 'API key del servicio' }],
  },
},
```

### Modificar un agente core
Los agentes core están en `core/agents/`. Si cambias frontmatter o secciones obligatorias, actualiza `docs/agent-standard.md` e incrementa el `standard_version` en el frontmatter de los agentes afectados.

### Tests
```bash
cd packages/cli && npm run build:all && npm test   # debe pasar al 100%
```

## Estilo de commits
Conventional Commits en inglés: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

## Gobernanza
Proyecto mantenido por [@cristiancorreau](https://github.com/cristiancorreau). PRs bienvenidos. Para cambios grandes, abre un issue primero.
