# SPEC-080 Vault de memoria compatible con Obsidian + MCP forge-memory

> Estado: APPROVED — DIVIDIDA (2026-07-18)
> Responsable: forge maintainers
> Creada: 2026-07-05 | Actualizada: 2026-07-05
> Deriva de: SPEC-074 (componente "Vault de memoria compatible con Obsidian", Fase 4)
> Depende de: SPEC-075 (`packages/schemas`), SPEC-076 (`packages/daemon-core`)

> **Replanteo 2026-07-18 — split forge ↔ mingako**: forge es dueño del dominio y formato de nota (wikilinks, frontmatter, plantillas; extiende wiki.ts e integrations.obsidian); el MCP de escritura en runtime, las notas de handoff y las retros de tarea pasan a mingako. El formato de nota es el contrato compartido. Ver `docs/analysis/forge-mingako-replanteo-2026-07.md` y SPEC-083.

## Contexto

Forge v3.11 ya tiene tres piezas de memoria, pero desconectadas entre sí:

1. **El wiki de proyecto** (`<projectRoot>/wiki/` — `packages/cli/src/commands/wiki.ts`):
   scaffolding templado (`index.md`, `log.md`, `raw/`, `concepts/`, `entities/`,
   `sources/`, `synthesis/`), ingesta de fuentes y un linter que ya parsea
   wikilinks `[[ruta/nota|alias]]` con regex para detectar links rotos y páginas
   huérfanas. La búsqueda (`forge wiki query` y la tool MCP `wiki_search` en
   `packages/cli/src/lib/mcp-tools.ts`) es un escaneo lexical por archivo, sin
   índice, sin backlinks y sin tags.
2. **`integrations.obsidian` en `project.yaml`** (`vault_path` + `map`), tipado
   y con test de round-trip en `packages/cli/test/wiki.test.mjs`, pero sin
   ningún consumidor que produzca un vault real.
3. **El servidor MCP `forge mcp`** (stdio, SDK cargado lazy), que expone solo
   lectura (`guardrail_status`, `wiki_search`): un agente hoy no puede
   *escribir* memoria de forma estructurada.

SPEC-074 (Fase 4) exige cerrar el ciclo: un vault global `~/.forge/vault/` y
uno local `{proyecto}/.forge/memory/`, ambos vaults Obsidian válidos (.md +
frontmatter YAML + wikilinks), un índice SQLite FTS5 con backlinks y tags,
plantillas de nota (decisión, handoff, retro, conocimiento, perfil de agente)
y la herramienta MCP `forge-memory` (query, read, write, link). El handoff
entre runtimes (SPEC-079) y las retros de tareas dependen de este vault como
formato de estado portable. Criterio del maestro: Obsidian abre el vault sin
errores y un agente consulta y escribe notas vía MCP.

## Decisión

1. **Contratos neutrales en `packages/schemas/src/memory.ts`** (Zod con
   exportación a JSON Schema, según SPEC-075):
   - `NoteType = 'decision' | 'handoff' | 'retro' | 'knowledge' | 'agent-profile'`.
   - `NoteFrontmatter = { type: NoteType; title: string; tags: string[]; created: string; updated: string; project?: string; task?: string; runtime_from?: string; runtime_to?: string }`
     (los tres últimos solo obligatorios cuando `type === 'handoff'`).
   - `VaultId = 'global' | 'project' | 'wiki'`.
   - `NoteRef = { vault: VaultId; path: string }` — `path` siempre relativo a la
     raíz del vault, estilo POSIX.
   - `MemoryHit = { ref: NoteRef; title: string; snippet: string; score: number }`.

2. **Dominio puro en `packages/daemon-core/src/memory/`** — sin imports de
   `node:`, `bun:`, SQLite ni fs (regla de lint del maestro):
   - `wikilinks.ts`: `parseWikilinks(markdown: string): Array<{ target: string; alias?: string; heading?: string; offset: number }>`
     — soporta `[[nota]]`, `[[ruta/nota|alias]]` y `[[nota#seccion]]`; misma
     semántica que el linter actual de `wiki.ts` (el `.md` final se normaliza).
   - `frontmatter.ts`: `parseNoteFrontmatter(markdown: string): { frontmatter: NoteFrontmatter | null; body: string }`
     y `renderNote(frontmatter: NoteFrontmatter, body: string): string`.
   - `tags.ts`: `extractTags(frontmatter, body): string[]` — une `tags:` del
     frontmatter con `#tag` inline (excluyendo bloques de código).
   - `note-id.ts`: `noteFileName(type: NoteType, title: string, date: string): string`
     → `{YYYY-MM-DD}-{slug}.md` (slugify extraído del actual `wiki.ts` privado).
   - `ports.ts`: la implementación del `MemoryPort` del maestro se divide en dos
     puertos: `VaultStorePort` (`list(vault)`, `read(ref)`, `write(ref, content)`,
     `exists(ref)`) y `VaultIndexPort` (`upsert(ref, meta, body)`, `remove(ref)`,
     `search(q, filtros)`, `backlinks(ref)`, `byTag(tag)`).
   - `usecases.ts`: `queryNotes`, `readNote`, `writeNote`, `linkNotes` (agrega
     `[[target|alias]]` bajo la sección `## Relacionado`, creándola si falta) —
     solo hablan con los puertos. Fakes en memoria en
     `packages/daemon-core/test/fakes/` para testear sin fs ni SQLite.

3. **Layout de los vaults.** `forge memory init` crea ambos, idempotente
   (mismo patrón que `scaffoldWikiStructure`):
   - `~/.forge/vault/` (global): `decisions/`, `handoffs/`, `retros/`,
     `knowledge/`, `agents/`, `templates/`.
   - `{proyecto}/.forge/memory/` (local): mismos subdirectorios.
   - Forge NO crea `.obsidian/` (Obsidian lo genera al abrir el vault; una
     carpeta de `.md` con frontmatter YAML válido ya es un vault válido).
   - Plantillas empaquetadas en `templates/memory/{decision,handoff,retro,knowledge,agent-profile}.md`
     del repo (junto a `templates/wiki/`), copiadas a `<vault>/templates/` en
     el init — compatibles con el plugin core "Templates" de Obsidian.
   - `wiki/` existente NO se migra ni se mueve: se registra como tercer vault
     de **solo lectura** (`VaultId 'wiki'`) en el índice. `/wiki-ingest`,
     `/wiki-lint` y `forge wiki` siguen funcionando sin cambios.

4. **Índice SQLite FTS5** en `~/.forge/memory-index.db` (separado de
   `forge.db` del daemon; mismo esquema que el daemon reutilizará vía
   `VaultIndexPort` en fases posteriores). Implementación de infraestructura en
   `packages/cli/src/lib/memory-index.ts` usando `node:sqlite` (import lazy;
   sin dependencias nativas nuevas). Esquema (migración `001_memory.sql`):

   ```sql
   notes(vault TEXT, path TEXT, type TEXT, title TEXT, created TEXT,
         updated TEXT, mtime_ms INTEGER, PRIMARY KEY (vault, path));
   links(src_vault TEXT, src_path TEXT, target TEXT, alias TEXT,
         resolved_path TEXT);
   tags(vault TEXT, path TEXT, tag TEXT);
   CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, vault UNINDEXED, path UNINDEXED);
   ```

   Reindex incremental por `mtime_ms`; `forge memory reindex` fuerza el
   reescaneo completo. Si `node:sqlite` no está disponible (Node < 22.5), la
   búsqueda degrada al escaneo lexical actual de `wiki_search` y lo reporta.

5. **Comando `forge memory <init|status|query|reindex|mcp>`** en
   `packages/cli/src/commands/memory.ts`, registrado en `cli.ts` y en el help
   (ES+EN). `query` acepta `--vault global|project|wiki|all`, `--type`, `--tag`,
   `--json`.

6. **Servidor MCP `forge-memory`**: `forge memory mcp` (stdio, mismo lazy-load
   del SDK que `commands/mcp.ts`) expone 4 tools implementadas en
   `packages/cli/src/lib/memory-mcp-tools.ts`, que delegan en los casos de uso
   de `daemon-core` con las implementaciones fs/SQLite de los puertos:
   - `query({ q, vault?, type?, tag?, limit? = 10 })` → `MemoryHit[]` (ranking bm25).
   - `read({ vault, path })` → `{ frontmatter, body }`.
   - `write({ vault, type, title, body, tags? })` → crea la nota desde la
     plantilla del tipo, devuelve `NoteRef` y actualiza el índice. Rechaza
     `vault: 'wiki'` y cualquier path fuera de la raíz del vault (confinamiento
     por construcción, mismo patrón que `wikiSearch`).
   - `link({ vault, path, target, alias? })` → inserta el wikilink en
     `## Relacionado` y reindexa la nota.

   Registro sugerido: `claude mcp add -s local -t stdio forge-memory -- forge memory mcp`.

7. **Doc**: sección "Memoria" en `docs/` que explica los dos vaults, los cinco
   tipos de nota y el flujo con Obsidian (abrir `~/.forge/vault/` como vault).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| SQLite como fuente de verdad (notas en DB, export .md) | Consultas triviales, sin drift | Rompe "Markdown como estado portable" del maestro; el vault deja de ser editable con Obsidian/git como primario | Contradice el principio 4 de SPEC-074 |
| Integrar vía plugin/REST API de Obsidian (obsidian-local-rest-api) | Reutiliza el parser real de Obsidian | Requiere Obsidian abierto; no funciona headless ni en CI; dependencia externa frágil | El agente debe operar sin GUI |
| Migrar `wiki/` al vault local y deprecar `forge wiki` | Un solo sistema de memoria | Rompe `/wiki-ingest`, `/wiki-lint`, `wiki_search` y los tests de SPEC-031 en v3.x; migración destructiva prematura | Convivencia read-only primero; unificación se decide con datos de uso |
| `better-sqlite3` como dependencia del CLI | API madura, síncrona | Binario nativo por plataforma: complica la distribución npm del CLI que hoy no tiene deps nativas | `node:sqlite` cubre FTS5 sin costo de instalación |

## Criterios de aceptación

- [ ] `forge memory init` crea `~/.forge/vault/` y `{proyecto}/.forge/memory/`
      con los 6 subdirectorios y las 5 plantillas en `templates/`; re-ejecutarlo
      no sobreescribe nada (test en `packages/cli/test/memory.test.mjs`).
- [ ] `parseWikilinks` resuelve `[[nota]]`, `[[ruta/nota|alias]]` y
      `[[nota#seccion]]`; `parseNoteFrontmatter` + `renderNote` hacen round-trip
      exacto (tests unitarios en `packages/daemon-core/test/memory-domain.test.mjs`,
      corriendo solo con fakes, sin fs ni SQLite).
- [ ] `packages/daemon-core/src/memory/` no importa `node:`, `bun:`, `fs`,
      `sqlite` ni `http` (verificable con la regla de lint de SPEC-074 o un
      grep en el test).
- [ ] Tras `forge memory reindex`, `forge memory query <término> --json`
      encuentra una nota por texto del cuerpo vía FTS5, y `backlinks(ref)`
      devuelve exactamente las notas que la enlazan (test de índice).
- [ ] `forge memory mcp` expone `query`, `read`, `write` y `link`; `write` crea
      un archivo cuyo frontmatter valida contra el JSON Schema de
      `packages/schemas`; `write` sobre `vault: 'wiki'` o con path traversal
      (`../`) devuelve error sin tocar el disco (test
      `packages/cli/test/memory-mcp.test.mjs` con cliente stdio del SDK).
- [ ] `link` agrega el wikilink bajo `## Relacionado` y el backlink aparece en
      el índice en la misma llamada (test).
- [ ] `wiki/` queda indexado como vault `'wiki'` y sus páginas aparecen en
      `query --vault wiki`; `forge wiki lint` y `test/wiki.test.mjs` siguen en
      verde sin modificaciones.
- [ ] Toda nota generada por plantilla tiene frontmatter YAML parseable y
      nombre de archivo `{YYYY-MM-DD}-{slug}.md` sin caracteres inválidos
      (test sobre las 5 plantillas). Verificación manual documentada: abrir
      `~/.forge/vault/` con Obsidian y confirmar que carga sin errores y
      muestra los backlinks de una nota enlazada.
- [ ] Sin `node:sqlite` disponible, `query` degrada a escaneo lexical con aviso
      y exit 0 (test con Node forzado sin el módulo o flag interno).
- [ ] Suite completa verde (`npm test` en `packages/cli` y tests nuevos de
      `daemon-core`).

## Riesgos e impacto

| Riesgo | Mitigación |
|--------|------------|
| Drift entre archivos .md e índice (ediciones directas en Obsidian) | Índice siempre reconstruible: reindex incremental por `mtime_ms` en cada operación MCP + `forge memory reindex`; el .md es la fuente de verdad, el índice es cache |
| Escrituras concurrentes agente ↔ Obsidian sobre la misma nota | Notas append-mostly por diseño (link agrega, write crea archivos nuevos con fecha+slug); last-write-wins documentado; sin locks |
| `node:sqlite` requiere Node ≥ 22.5 | Import lazy + degradación a escaneo lexical (paridad con `wiki_search` actual); el requisito se documenta en el help |
| Dialecto de wikilinks divergente del de Obsidian (embeds `![[...]]`, bloques `^id`) | Alcance explícito: solo `[[target]]`, alias y heading; embeds/bloques se indexan como links normales; ampliación en spec futura si hace falta |
| Doble sistema wiki + vault confunde a usuarios | `wiki/` = conocimiento compilado del proyecto (read-only para MCP); vault = memoria operativa de agentes; la doc y el help lo explicitan; unificación se evalúa post-Fase 4 |

Impacto de compliance: ninguno. Todo es local (fs + SQLite en `~/.forge/` y el
repo), sin red, sin telemetría, sin LLM. El servidor MCP es stdio-only, igual
que `forge mcp`.
