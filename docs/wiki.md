[English](en/wiki.md) · **Español**

# Wiki — Knowledge base del proyecto

El wiki es la base de conocimiento del proyecto: un conjunto de archivos Markdown
en `<raíz>/wiki/` donde se ingestan fuentes, se compila conocimiento en páginas
y se responden preguntas citando esas páginas.

Hay dos capas que trabajan juntas:

- **El CLI (`forge wiki`)** — operaciones de filesystem deterministas: crear la
  estructura, copiar fuentes a `raw/`, contar páginas, buscar texto, verificar
  integridad. No usa IA.
- **Los skills (`/wiki-ingest`, `/wiki-query`, `/wiki-lint`)** — compilación
  semántica con el agente: leen las fuentes de `raw/`, escriben páginas de
  `concepts/entities/sources/synthesis`, mantienen el índice y responden con
  citas.

> El CLI prepara y verifica el terreno; los skills generan el conocimiento.

---

## Estructura

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

| Pieza | Qué guarda |
|-------|------------|
| `index.md` | Tabla de contenidos por sección (Conceptos, Entidades, Fuentes, Síntesis). |
| `log.md` | Registro append-only de cada ingest/operación. Nunca se edita ni se borra. |
| `raw/` | Copia literal de cada fuente ingestada (`YYYY-MM-DD-slug.md`). Inmutable. |
| `concepts/` | Una página por concepto, con cross-referencias `[[concepts/otro]]`. |
| `entities/` | Una página por entidad relevante al proyecto. |
| `sources/` | Resumen estructurado de cada fuente: hechos clave, conceptos y entidades mencionados. |
| `synthesis/` | Síntesis: respuestas a preguntas del proyecto apoyadas en las fuentes. |

Cada subdirectorio (excepto `raw/`) trae un `_template.md` como punto de partida
del formato y frontmatter esperado. Esos templates no cuentan como páginas: no
aparecen en el índice ni los reporta `forge wiki lint`.

---

## Comandos del CLI

### `forge wiki init [--force]`

Crea la estructura completa del wiki desde los templates bundleados
(`templates/wiki/`). Idempotente: no sobrescribe archivos existentes.

- Copia `index.md` y `log.md` desde los templates.
- Crea los 5 subdirectorios y siembra cada uno (salvo `raw/`) con su `_template.md`.
- `--force` reescribe los archivos de control (`index.md`, `log.md`); los
  `_template.md` nunca se reescriben.

```bash
forge wiki init
# → wiki/ con index.md, log.md, raw/, concepts/, entities/, sources/, synthesis/
```

### `forge wiki status`

Muestra el estado del wiki: cantidad de archivos por subdirectorio, última
modificación, presencia de los archivos de control y cobertura del índice.

```bash
forge wiki status
```

### `forge wiki ingest <archivo>`

Copia una fuente a `wiki/raw/` (con nombre `YYYY-MM-DD-slug.md`), registra la
operación en `log.md` e inicializa el wiki si no existía. La compilación del
conocimiento la hace después el skill `/wiki-ingest`.

```bash
forge wiki ingest ./paper.md
forge wiki ingest /ruta/a/notas.txt
```

### `forge wiki query <texto>`

Búsqueda simple por coincidencia de texto sobre las páginas del wiki (excluye
`raw/`, los archivos de control y los `_template.md`). Para una respuesta
razonada y con citas, usar el skill `/wiki-query`.

```bash
forge wiki query "rate limiting"
```

### `forge wiki lint`

Verifica la integridad estructural del wiki: archivos de control presentes,
wikilinks `[[...]]` rotos, páginas huérfanas (no referenciadas por el índice) y
frescura del `log.md`. Devuelve exit code 1 solo si hay errores (no por
advertencias).

```bash
forge wiki lint
```

---

## Relación con los skills `/wiki-*`

El CLI es determinista y no razona sobre el contenido; los skills sí. El flujo
típico combina ambos:

1. `forge wiki ingest <archivo>` — el CLI guarda la fuente en `raw/` y la registra.
2. `/wiki-ingest` — el skill lee la fuente, compila páginas en
   `concepts/entities/sources` y actualiza `index.md`.
3. `/wiki-query <pregunta>` — el skill responde citando las páginas relevantes y
   opcionalmente archiva la respuesta en `synthesis/`.
4. `forge wiki lint` o `/wiki-lint` — verifica integridad; el skill además
   auto-repara lo que puede.

| Capa | Herramienta | Responsabilidad |
|------|-------------|-----------------|
| CLI | `forge wiki ingest/status/query/lint/init` | Operaciones de filesystem, scaffolding, verificación. |
| Skill | `/wiki-ingest`, `/wiki-query`, `/wiki-lint` | Compilación semántica, escritura de páginas, respuestas con citas. |

Los skills `wiki-*` se activan agregándolos a `skills:` en `project.yaml`. Cuando
algún `wiki-*` está activo, `forge init` scaffoldea el wiki automáticamente; los
proyectos sin skills wiki no reciben un directorio `wiki/`.

---

## obsidian-sync (integración, no es un comando CLI)

`obsidian-sync` es un **slash-command skill** (`/obsidian-sync`), no un comando
del CLI. Mantiene un vault de Obsidian sincronizado con el código del proyecto
vía la Local REST API de Obsidian.

**Prerrequisitos:**

- Obsidian corriendo con el plugin **Local REST API** instalado y habilitado.
- Token de la API en `OBSIDIAN_TOKEN` (en `.env.local`, nunca en `project.yaml`).
- `integrations.obsidian.vault_path` configurado en `project.yaml`, y
  opcionalmente `integrations.obsidian.map` (mapeo área de código → nota del vault).

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

Se invoca con `/obsidian-sync` en Claude Code. **No existe `forge obsidian`**: la
sincronización es responsabilidad del skill por diseño.
