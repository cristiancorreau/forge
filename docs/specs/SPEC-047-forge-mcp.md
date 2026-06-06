# SPEC-047 `forge mcp` — servidor MCP recortado (RFC-003)

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-06 | Actualizada: 2026-06-06

## Contexto

Implementación del RFC-003 (`docs/proposals/RFC-003-forge-mcp.md`). Un servidor MCP
"completo" rompería dos invariantes de forge (cold-start liviano de `npx`,
neutralidad multi-runtime). La versión recortada expone SOLO lo que es
genuinamente **dinámico** y no se puede precomputar en `forge generate`.

## Decisión

`forge mcp` — servidor MCP **stdio-only, opt-in**, con exactamente **2 tools
dinámicos, read-only**:
- **`guardrail_status`** — veredicto VIVO de los guardrails para un comando o un
  edit, obtenido **spawneando el hook real del proyecto** (`.claude/hooks/*`) e
  interpretando su exit code. Reusa la lógica exacta del runtime (sin duplicar →
  sin drift). Nunca ejecuta el comando.
- **`wiki_search`** — búsqueda léxica sobre `wiki/`, **confinada por
  construcción**: solo lee bajo `<projectRoot>/wiki/` y toma un STRING (nunca un
  path) → cero superficie de path-traversal.

### Mitigaciones (todas implementadas)
- **Regla de oro**: el piso estático sigue completo; MCP es estrictamente
  ADITIVO. Nada del conocimiento de forge vive solo en MCP. Enforced por un
  **test de allowlist exacto** (`MCP_TOOLS` === `[guardrail_status, wiki_search]`
  y `TOOL_DEFS ⊆ MCP_TOOLS`), no por una prueba semántica.
- **stdio-only, nunca HTTP** en v1 (sin red ni auth). HTTP/remoto se difiere.
- **Read-only + acotado**: ningún tool toma un path libre que lea; `guardrail_status`
  devuelve un veredicto, `wiki_search` solo pasajes de `wiki/`.
- **SDK lazy fuera del hot-path**: `@modelcontextprotocol/sdk` NO es dependencia
  de forge (se evita pesar el cold-start del 100% de `npx`). Se carga con
  `createRequire` SOLO dentro de `forge mcp`, resolviéndolo desde el proyecto;
  si falta, error accionable (`npm i @modelcontextprotocol/sdk`). El handler de
  CallTool tiene allowlist dura (`MCP_TOOLS.includes`).
- **Opt-in + registro explícito**: `claude mcp add -s local -t stdio forge -- forge mcp`.

### No-objetivos v1
HTTP/auth, tools de escritura, exponer estado estático (eso ya está en
`CLAUDE.md`/`AGENTS.md`), agregar el SDK como dependencia.

## Criterios de aceptación
- [ ] `lib/mcp-tools.ts` puro y testeado: `guardrailStatus` (block/allow/sin-hook), `wikiSearch` (hit/confinado).
- [ ] `forge mcp` sin el SDK → exit 1 con mensaje accionable (degradación grácil).
- [ ] Test de allowlist: exactamente 2 tools, `TOOL_DEFS ⊆ MCP_TOOLS`.
- [ ] `tsc` compila SIN el SDK instalado (lazy require tipado `any`).
- [ ] `npm run build:all` + `npm test` verdes (4 plataformas). Sin bump de versión.

## Impacto de compliance
No aplica.
