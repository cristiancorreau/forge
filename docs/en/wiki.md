**English** · [Español](../wiki.md)

# Wiki — Project knowledge base

The wiki is the project's knowledge base: a set of Markdown files in
`<root>/wiki/` where sources are ingested, knowledge is compiled into pages,
and questions are answered by citing those pages.

There are two layers that work together:

- **The CLI (`forge wiki`)** — deterministic filesystem operations: create the
  structure, copy sources into `raw/`, count pages, search text, verify
  integrity. It does not use AI.
- **The skills (`/wiki-ingest`, `/wiki-query`, `/wiki-lint`)** — semantic
  compilation with the agent: they read the sources in `raw/`, write pages in
  `concepts/entities/sources/synthesis`, maintain the index, and answer with
  citations.

> The CLI prepares and verifies the ground; the skills generate the knowledge.

---

## Structure

```
wiki/
├── index.md          ← catálogo de páginas (actualizado por /wiki-ingest)
├── log.md            ← bitácora append-only de operaciones
├── raw/              ← almacén inmutable de fuentes originales (no editar)
├── concepts/         ← conceptos técnicos, ideas, definiciones
├── entities/         ← personas, empresas, frameworks, APIs, proyectos
├── sources/          ← resúmenes de cada fuente ingestada
└── synthesis/        ← respuestas y conclusiones razonadas sobre el wiki
```

| Piece | What it holds |
|-------|------------|
| `index.md` | Table of contents by section (Concepts, Entities, Sources, Synthesis). |
| `log.md` | Append-only record of every ingest/operation. Never edited or deleted. |
| `raw/` | Literal copy of each ingested source (`YYYY-MM-DD-slug.md`). Immutable. |
| `concepts/` | One page per concept, with `[[concepts/other]]` cross-references. |
| `entities/` | One page per entity relevant to the project. |
| `sources/` | Structured summary of each source: key facts, concepts, and entities mentioned. |
| `synthesis/` | Synthesis: answers to project questions backed by the sources. |

Every subdirectory (except `raw/`) ships with a `_template.md` as a starting
point for the expected format and frontmatter. Those templates do not count as
pages: they do not appear in the index, nor are they reported by
`forge wiki lint`.

---

## CLI commands

### `forge wiki init [--force]`

Creates the complete wiki structure from the bundled templates
(`templates/wiki/`). Idempotent: it does not overwrite existing files.

- Copies `index.md` and `log.md` from the templates.
- Creates the 5 subdirectories and seeds each one (except `raw/`) with its `_template.md`.
- `--force` rewrites the control files (`index.md`, `log.md`); the
  `_template.md` files are never rewritten.

```bash
forge wiki init
# → wiki/ con index.md, log.md, raw/, concepts/, entities/, sources/, synthesis/
```

### `forge wiki status`

Shows the wiki's status: number of files per subdirectory, last modification,
presence of the control files, and index coverage.

```bash
forge wiki status
```

### `forge wiki ingest <file>`

Copies a source into `wiki/raw/` (named `YYYY-MM-DD-slug.md`), records the
operation in `log.md`, and initializes the wiki if it did not exist. Knowledge
compilation is done afterward by the `/wiki-ingest` skill.

```bash
forge wiki ingest ./paper.md
forge wiki ingest /ruta/a/notas.txt
```

### `forge wiki query <text>`

Simple text-match search over the wiki pages (excludes `raw/`, the control
files, and the `_template.md` files). For a reasoned, cited answer, use the
`/wiki-query` skill.

```bash
forge wiki query "rate limiting"
```

### `forge wiki lint`

Verifies the wiki's structural integrity: control files present, broken
`[[...]]` wikilinks, orphaned pages (not referenced by the index), and
freshness of `log.md`. Returns exit code 1 only if there are errors (not for
warnings).

```bash
forge wiki lint
```

---

## Relationship with the `/wiki-*` skills

The CLI is deterministic and does not reason about the content; the skills do.
The typical flow combines both:

1. `forge wiki ingest <file>` — the CLI stores the source in `raw/` and records it.
2. `/wiki-ingest` — the skill reads the source, compiles pages in
   `concepts/entities/sources`, and updates `index.md`.
3. `/wiki-query <question>` — the skill answers by citing the relevant pages and
   optionally archives the answer in `synthesis/`.
4. `forge wiki lint` or `/wiki-lint` — verifies integrity; the skill also
   auto-repairs what it can.

| Layer | Tool | Responsibility |
|------|-------------|-----------------|
| CLI | `forge wiki ingest/status/query/lint/init` | Filesystem operations, scaffolding, verification. |
| Skill | `/wiki-ingest`, `/wiki-query`, `/wiki-lint` | Semantic compilation, page writing, cited answers. |

The `wiki-*` skills are enabled by adding them to `skills:` in `project.yaml`.
When any `wiki-*` is active, `forge init` scaffolds the wiki automatically;
projects without wiki skills do not get a `wiki/` directory.

---

## obsidian-sync (integration, not a CLI command)

`obsidian-sync` is a **slash-command skill** (`/obsidian-sync`), not a CLI
command. It keeps an Obsidian vault synced with the project code via Obsidian's
Local REST API.

**Prerequisites:**

- Obsidian running with the **Local REST API** plugin installed and enabled.
- API token in `OBSIDIAN_TOKEN` (in `.env.local`, never in `project.yaml`).
- `integrations.obsidian.vault_path` configured in `project.yaml`, and
  optionally `integrations.obsidian.map` (code area → vault note mapping).

```yaml
# project.yaml
integrations:
  obsidian:
    vault_path: "docs/mi-vault"   # relativo a la raíz del repo
    map:
      api: "03-api/endpoints.md"
      database: "02-base-de-datos/migraciones.md"
      decisions: "08-decisiones/log-decisiones.md"
```

It is invoked with `/obsidian-sync` in Claude Code. **There is no
`forge obsidian`**: synchronization is the skill's responsibility by design.
