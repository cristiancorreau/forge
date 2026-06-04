# SPEC-034 Buscador e instalador de catálogo en el panel

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

El panel interactivo de forge (SPEC-033) es de **solo lectura**: muestra la
configuración, el monitoreo, el catálogo de skills, los hooks y los templates,
pero no permite accionar nada. Para activar una skill, agregar un profile o
crear un wiki/spec, el usuario tiene que salir del panel, editar `project.yaml`
a mano y correr comandos sueltos (`forge init`, `forge wiki init`).

Queremos que el panel sea **accionable**: que desde la misma vista se pueda
buscar en el catálogo de cosas instalables (skills, profiles, templates) e
**instalarlas** sin salir. Esto cierra el loop "descubrir → instalar" dentro de
una sola UI y baja la fricción para configurar un proyecto forge.

## Decisión

### Parte A — capa de datos de instalación (pura, testeada)

Nuevo módulo `packages/cli/src/lib/catalog-install.ts`, sin TTY ni prints,
reutilizado por el render OpenTUI, el fallback @clack y los tests:

- `searchCatalog(forgeRoot, projectRoot, query)` → búsqueda unificada sobre
  ítems instalables:
  - **skills** (de `catalog.ts` → `SKILLS`),
  - **profiles** (de `profiles/` en el forge root),
  - **templates** (wiki, spec, modes, claude-md — de `listTemplates`).

  Cada resultado: `{ type: 'skill'|'profile'|'template', id, label, description,
  installed: boolean }`. `installed` se calcula contra `project.yaml`
  (`skills[]` / `agents.profiles[]`) y/o el estado scaffolded en disco
  (p. ej. `wiki/index.md` existe, `docs/specs/<id>.md` existe).

- `installSkill(projectRoot, forgeRoot, id)` → agrega el id a `skills` en
  `project.yaml` (dedupe) y copia su slash command a `.claude/commands/` si
  existe (`adapters/claude-code/commands/<id>.md`). Idempotente.

- `installProfile(projectRoot, forgeRoot, name)` → agrega el name a
  `agents.profiles` en `project.yaml` (dedupe) e instala los agentes de ese
  profile en `.claude/agents/` (reutiliza `installCoreAgents`). Idempotente.

- `installTemplate(projectRoot, forgeRoot, id)` → scaffold del template:
  wiki → reutiliza `scaffoldWikiStructure`; spec → crea
  `docs/specs/<id>.md` desde `core/templates/spec-template.md`;
  mode/claude-md/architecture → copia el archivo a su lugar si falta.
  Idempotente.

#### Escritura de project.yaml — edición quirúrgica

`project.yaml` es un archivo escrito a mano con comentarios y listas en estilo
bloque. Para no perder formato ni comentarios, la escritura es **quirúrgica por
texto** (no `js-yaml.dump` del documento entero):

- Si la key (`skills:` o `agents.profiles:`) ya existe como lista en bloque
  (`skills:\n  - a`), se **inserta** una línea `- <item>` al final del bloque,
  respetando la indentación detectada.
- Si la key existe como lista flat (`skills: [a, b]`), se reescribe esa línea
  agregando el ítem.
- Si la key no existe, se crea de forma sensata (top-level para `skills`,
  anidada bajo `agents:` para `profiles`).

Tras cada instalación, `project.yaml` se vuelve a parsear y debe seguir pasando
`forge validate` (verificado en los tests).

### Parte B — wiring en el panel

Nueva sección **"Catálogo — buscar e instalar"** en el panel:

- Input de búsqueda en vivo (mismo patrón que la sección Skills) + lista de
  resultados etiquetados por tipo, con marca "ya instalado".
- Acción de **Instalar/Activar** sobre el ítem seleccionado (con confirmación).
- Soportado en ambos paths: OpenTUI (Bun, `tui/panel.ts`) y fallback Node
  (@clack, `commands/panel.ts`). El snapshot no-TTY no crashea.
- Tras instalar, el panel refresca los datos (config summary / flags).
- Entrada secundaria opcional: "Buscar en catálogo remoto (aitmpl)" que delega
  en `forge aitmpl-search` — solo discovery, sin instalación remota.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| `js-yaml.load` + `dump` del documento entero | Simple | Borra comentarios y reordena el YAML hecho a mano | Requisito explícito de preservar formato |
| Instalar profiles sin escribir project.yaml | Menos riesgo de YAML | El estado queda inconsistente con el schema | El source of truth es project.yaml |
| Instalación remota desde aitmpl | Más potente | Riesgo de traer assets no verificados al repo | Discovery-only en esta iteración |

## Criterios de aceptación

- [ ] `searchCatalog` encuentra una skill, un profile y un template por query y
      marca `installed` correctamente.
- [ ] `installSkill` agrega el id a `project.yaml.skills` (idempotente), el YAML
      sigue parseando y validando, y copia el command si existe.
- [ ] `installProfile` agrega el name a `agents.profiles` y escribe el/los
      archivos de agente en `.claude/agents/`.
- [ ] `installTemplate` scaffoldea (spec y wiki como mínimo) de forma idempotente.
- [ ] La edición de `project.yaml` preserva comentarios y listas en bloque.
- [ ] El panel (OpenTUI + fallback) soporta buscar → seleccionar → instalar; el
      snapshot no-TTY no crashea.
- [ ] `npm run build:all && npm test` queda verde.

## Impacto de compliance

No aplica — feature de tooling de CLI, sin manejo de PII ni datos de usuario.

## Dependencias

- Reutiliza `installCoreAgents` (init.ts), `scaffoldWikiStructure` (wiki.ts),
  `listTemplates` / `getConfigSummary` (panel-data.ts), `SKILLS` (catalog.ts).
- Construye sobre SPEC-033 (panel interactivo).

## Notas de implementación

- No hay un mapping 1:1 de skill id → archivo de slash command: solo se copia
  `adapters/claude-code/commands/<id>.md` cuando existe; el source of truth de
  una skill activa es la lista `skills` de `project.yaml`.
- `installProfile` está acotado a los profiles del enum del schema; instalar un
  profile fuera del enum haría fallar `forge validate`, así que la capa valida
  contra los profiles disponibles en el forge root.
- La edición quirúrgica de YAML cubre los casos block/flat/missing para
  `skills` y `agents.profiles`; otros estilos exóticos (anclas, multi-doc) no
  están soportados y caen al final del documento de forma segura.
