# SPEC-031 Estructura wiki por defecto desde templates + `forge wiki init`

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

`forge wiki` (packages/cli/src/commands/wiki.ts) gestiona una knowledge base en
`<projectRoot>/wiki/` con `index.md`, `log.md` y 5 subdirectorios (`raw/`,
`concepts/`, `entities/`, `sources/`, `synthesis/`). Los subcomandos
`status`/`ingest`/`query`/`lint` son operaciones reales de filesystem y
funcionan, pero `ensureWikiStructure()` solo siembra stubs mínimos de
`index.md`/`log.md` e ignora los templates ricos que ya existen en
`templates/wiki/` (index.md, log.md y `concepts|entities|sources/_template.md`).
Faltan dos piezas:

1. No hay template de `synthesis/` y los templates existentes nunca se usan: al
   inicializar el wiki el usuario recibe stubs pobres en lugar del scaffold
   curado que ya viaja en el paquete npm (build-assets bundlea `templates/`).
2. No existe un comando explícito para crear el wiki: hoy solo se crea como
   efecto secundario de `forge wiki ingest <file>`.

Además, `forge init` no crea el wiki ni siquiera cuando el proyecto activa los
skills `wiki-*`, así que el "wiki por defecto" para proyectos wiki-enabled no
existe.

Aparte (type gap): la interfaz `ProjectYaml` en `packages/cli/src/lib/yaml.ts`
no declara el campo `integrations` aunque `core/schemas/project.schema.json` y
`templates/project.yaml.tpl` definen `integrations.obsidian` (`vault_path`,
`map`). El skill `obsidian-sync` lee esa config; el type debe existir para
acceder a ella de forma type-safe.

## Decisión

**Parte A — Estructura templada por defecto:**

- Agregar `templates/wiki/synthesis/_template.md` replicando el estilo y
  frontmatter de los templates `concepts|entities|sources/_template.md`.
- Reescribir `ensureWikiStructure(root)` para que, al crear el wiki, COPIE los
  templates bundleados: `index.md` y `log.md` desde
  `<forgeRoot>/templates/wiki/`, y siembre cada subdir
  (`concepts/entities/sources/synthesis`) con su `_template.md`. Resolver
  `<forgeRoot>` con `resolveForgeRoot()` (mismo helper que `init.ts`). Fallback
  seguro a los stubs mínimos actuales si falta un template. `raw/` queda vacío
  (almacén inmutable). No sobrescribir archivos existentes.
- Nuevo subcomando `forge wiki init` que crea explícitamente la estructura
  templada (idempotente; `--force` sobrescribe los archivos de control). Wireado
  al router y al help. Imprime un hint de próximos pasos (ingest / skills
  `/wiki-*`).
- En `forge init`: si los skills activos incluyen algún `wiki-*`
  (`wiki-ingest`/`wiki-query`/`wiki-lint`), scaffoldear el wiki con el mismo
  scaffolder templado. Si NO hay skill wiki activo, NO crear `wiki/`.

**Parte B — Type obsidian:**

- Agregar `integrations?: { obsidian?: { vault_path?: string; map?: Record<string, string> } }`
  a la interfaz `ProjectYaml`. Sin comando CLI para obsidian (es un skill).

**Parte C — Docs:**

- `docs/wiki.md` (español) documentando estructura, comandos CLI con ejemplos,
  relación con los skills `/wiki-*` y la sección obsidian-sync. Link desde el
  listado de Documentación del README y/o `docs/skills.md`.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Mantener stubs mínimos | menos código | UX pobre, templates muertos en el repo | No aprovecha assets ya bundleados |
| Crear wiki siempre en `forge init` | un solo path | fuerza `wiki/` en proyectos no-wiki | Ruido para proyectos sin wiki |
| Comando obsidian en CLI | simetría | obsidian-sync es un skill por diseño | Duplica responsabilidad del skill |

## Criterios de aceptación

- [ ] `templates/wiki/synthesis/_template.md` existe con frontmatter consistente.
- [ ] `forge wiki init` crea `index.md`/`log.md` desde los templates (texto
      distintivo presente) y los 4 `_template.md` de subdirs; `raw/` vacío.
- [ ] `ensureWikiStructure` usa los templates (no los stubs) cuando están
      disponibles, con fallback seguro.
- [ ] `forge init` scaffoldea el wiki solo si hay un skill `wiki-*` activo.
- [ ] `ProjectYaml.integrations.obsidian` round-trips desde un `project.yaml`.
- [ ] `forge wiki init` → `wiki status` muestra la estructura y `wiki lint` queda
      limpio.
- [ ] `npm run build:all && npm test` verde.

## Impacto de compliance

- No aplica (cambio interno de tooling, sin manejo de PII).

## Dependencias

- Ninguna. `build-assets.mjs` ya bundlea `templates/` en el paquete npm.

## Notas de implementación

- `resolveForgeRoot()` apunta al repo root en dev y a `assets/` en modo npm; en
  ambos casos `templates/wiki/` está presente.
- El scaffolder se exporta desde `wiki.ts` para reuso en `init.ts` (single
  source of truth del layout del wiki).
