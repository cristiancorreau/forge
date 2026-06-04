# Skills de forge

forge incluye **14 skills** invocables como comandos slash. Cada skill encapsula un flujo de trabajo reutilizable (planificar una feature, migrar una base de datos, auditar seguridad, consultar el wiki, etc.) que se activa por un comando explícito o por triggers contextuales.

## Tabla resumen

| Skill | Comando | Categoría | Trigger principal |
|---|---|---|---|
| session-start | `/session-start` | Sesión | Abre la sesión: detecta estado del repo y enruta |
| session-close | `/session-close` | Sesión | Cierra la sesión: commit → daily note → sync → PR |
| spec | `/spec` | Flujo de desarrollo | Al crear o actualizar una spec en `docs/specs/` |
| new-feature | `/new-feature` | Flujo de desarrollo | Al comenzar cualquier feature nueva |
| security-audit | `/security-audit` | Flujo de desarrollo | Al implementar/modificar endpoints o auth |
| local2prod | `/local2prod` | Flujo de desarrollo | Al desplegar una feature terminada a producción |
| db-migrate | `/db-migrate` | Datos | Al modificar el schema / migrar la BD |
| wiki-ingest | `/wiki-ingest` | Wiki / conocimiento | Al incorporar documentación o conocimiento al wiki |
| wiki-query | `/wiki-query` | Wiki / conocimiento | Al responder preguntas con el wiki del proyecto |
| wiki-lint | `/wiki-lint` | Wiki / conocimiento | Tras un wiki-ingest o para verificar el wiki |
| browser-test | `/browser-test` | Testing / verificación | Antes de dar por terminada una tarea de UI |
| phase-kickoff | `/phase-kickoff` | Sprint | Al iniciar una nueva fase o sprint |
| aitmpl-search | `/aitmpl-search` | Catálogo | Al explorar frameworks/herramientas de agentes IA |
| obsidian-sync | `/obsidian-sync` | Integraciones | Al sincronizar el vault de Obsidian con el código |

---

## Sesión

### session-start
- **Comando:** `/session-start`
- **Propósito:** Abre la sesión de trabajo: detecta el estado del repo, identifica el escenario y enruta según corresponda. Es el primer paso del flujo de trabajo SDD, antes de cualquier edición de código.
- **Trigger:** `/session-start`, "iniciar sesión", "arrancar sesión", "empezar a trabajar"; al abrir el editor y comenzar a trabajar.

### session-close
- **Comando:** `/session-close`
- **Propósito:** Cierra la sesión de trabajo con un pipeline: commit, changeset, GitHub Projects, daily note, release notes, sync y PR. Es el último paso del flujo de trabajo SDD.
- **Trigger:** `/session-close`, "cerrar sesión", "terminar sesión", "cerrar el día"; al terminar de trabajar en una rama de feature.

---

## Flujo de desarrollo

### spec
- **Comando:** `/spec`
- **Propósito:** Redactar specs de features siguiendo la plantilla del framework forge. Se activa antes de escribir cualquier spec nueva.
- **Trigger:** `/spec`, "crear spec", "redactar spec", "nueva spec"; al crear una spec nueva en `docs/specs/`; al actualizar una spec existente tras cambios de implementación; al convertir un ticket/issue en spec formal.

### new-feature
- **Comando:** `/new-feature`
- **Propósito:** Checklist completo para implementar una feature nueva desde planificación hasta deploy. Orquesta los otros skills en el orden correcto. Asegura no saltear spec, seguridad ni deploy.
- **Trigger:** `/new-feature`, "nueva feature", "quiero agregar", "implementar"; al comenzar cualquier feature nueva, por pequeña que sea.

### security-audit
- **Comando:** `/security-audit`
- **Propósito:** Checklist de seguridad para endpoints de API y módulos que manejan autenticación, autorización o datos sensibles. Agnóstico al stack.
- **Trigger:** `/security-audit`, "auditar seguridad", "revisar endpoints", "security check"; al implementar nuevos endpoints; al modificar auth; antes de mergear un PR que toque rutas protegidas; cuando el `security-auditor` lo solicita en un review.

### local2prod
- **Comando:** `/local2prod`
- **Propósito:** Flujo completo de publicación a producción. Compatible con Vercel, Railway, Fly.io, GitHub Actions y pipelines custom. Nunca dar una tarea por terminada sin deploy en estado READY/SUCCESS. El provider sale de `project.yaml` (`deploy.provider`).
- **Trigger:** `/local2prod`; al terminar una feature y querer desplegarla a producción.

---

## Datos

### db-migrate
- **Comando:** `/db-migrate`
- **Propósito:** Flujo seguro para ejecutar migraciones de base de datos. Compatible con Prisma, Drizzle, ActiveRecord (Rails), Alembic (Python) y Goose (Go).
- **Trigger:** `/db-migrate`, "migrar schema", "actualizar base de datos", "migrar BD"; al modificar el schema; antes/después de agregar modelos, columnas o índices; al resolver conflictos de migración entre branches.

---

## Wiki / conocimiento

> Estructura del wiki, comandos `forge wiki` (init/status/ingest/query/lint) y su
> relación con estos skills: ver [docs/wiki.md](wiki.md).

### wiki-ingest
- **Comando:** `/wiki-ingest`
- **Propósito:** Ingesta una fuente nueva en el wiki del proyecto. Almacena el original en `raw/`, compila conocimiento en páginas wiki, actualiza el índice y registra la operación.
- **Trigger:** `/wiki-ingest`, "ingestar", "agregar al wiki", "aprender de"; al incorporar documentación/papers/specs/decisiones; al leer código de dependencias; cuando el usuario dice "recordá esto" o "guarda esto en el wiki".

### wiki-query
- **Comando:** `/wiki-query`
- **Propósito:** Responde preguntas usando el wiki del proyecto como base de conocimiento, citando las páginas relevantes. Opcionalmente archiva la respuesta como página de síntesis.
- **Trigger:** `/wiki-query`; antes de implementar algo que el wiki podría ya tener documentado; para responder preguntas sobre decisiones pasadas, conceptos técnicos o regulación; cuando el usuario pregunta por conocimiento acumulado del proyecto.

### wiki-lint
- **Comando:** `/wiki-lint`
- **Propósito:** Verifica la integridad estructural del wiki: índice, links, huérfanos y salud general. Auto-repara lo que puede y reporta lo que necesita decisión humana.
- **Trigger:** `/wiki-lint`, "lint wiki", "verificar wiki", "revisar wiki"; después de un wiki-ingest; periódicamente (inicio de cada sprint); cuando se sospechan links rotos o páginas huérfanas.

---

## Testing / verificación

### browser-test
- **Comando:** `/browser-test`
- **Propósito:** Automatización de navegador (agent-browser, CLI en Rust sobre CDP) para verificar UI en desarrollo, testear flujos críticos, capturar evidencia y diffs visuales, y testear responsive.
- **Trigger:** `/browser-test`, "abrir en browser", "screenshot de", "verificar que renderiza", "testear visualmente", "navegar a", "probar el flujo de", "ver cómo se ve", "revisar esta URL", "capturar pantalla de", "test visual", "open <url>"; antes de dar una tarea de UI por terminada; al inspeccionar una URL; al capturar evidencia de compliance.

---

## Sprint

### phase-kickoff
- **Comando:** `/phase-kickoff`
- **Propósito:** Protocolo para iniciar una nueva fase de desarrollo en un proyecto forge. Se activa al comienzo de cada sprint o fase nueva.
- **Trigger:** `/phase-kickoff`; al iniciar trabajo en una nueva fase o sprint del proyecto.

---

## Catálogo

### aitmpl-search
- **Comando:** `/aitmpl-search`
- **Propósito:** Busca en el catálogo curado de forge: frameworks de agentes IA, MCP servers instalables, profiles de stack y herramientas. Búsqueda offline (catálogo local), opcionalmente extensible a GitHub con `--github`.
- **Trigger:** `/aitmpl-search`; al explorar frameworks/herramientas de agentes IA; antes de diseñar un agente Tier 2 nuevo (ver si ya existe profile); al instalar un MCP server; para explorar patrones de arquitectura reutilizables.

---

## Integraciones

### obsidian-sync
- **Comando:** `/obsidian-sync`
- **Propósito:** Mantiene un vault de Obsidian sincronizado con el código del proyecto. Skill de integración: requiere Obsidian corriendo con el plugin Local REST API, token configurado y `vault_path` en `project.yaml`.
- **Trigger:** `/obsidian-sync`, "actualizar obsidian", "sync vault", "documentar cambios".
