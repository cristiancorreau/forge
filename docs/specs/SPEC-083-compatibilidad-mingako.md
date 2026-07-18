# SPEC-083 Compatibilidad mingako (Fase 4 replanteada)

> Estado: APPROVED (adoptada por el dueño del proyecto el 2026-07-18)
> Responsable: forge maintainers
> Creada: 2026-07-18 | Actualizada: 2026-07-18
> Reemplaza a: Fase 4 del roadmap v4 (SPEC-074)
> Análisis fuente: `docs/analysis/forge-mingako-replanteo-2026-07.md`

## Contexto

El orquestador de agentes será un proyecto separado: **mingako**. Forge sigue
siendo lo que es —generador de configuración multi-runtime, metodología SDD,
catálogo y auditoría— con mejoras para ser **compatible** con mingako, no un
reemplazo ni un orquestador.

El patrón dominante del ecosistema respalda esta separación: los orquestadores
de sesiones (Vibe Kanban, Conductor, Mux) no definen agentes, **heredan la
configuración del repo**. El repo es la interfaz: forge escribe el repo,
mingako lo ejecuta.

## Principios

1. **Dependencia unidireccional**: `mingako → forge` (paquetes npm + archivos
   generados). Forge nunca importa ni conoce a mingako.
2. **Forge declara, mingako ejecuta**: la configuración (cadena de fallback,
   `approvals.enabled`, política MCP) vive en `project.yaml` y en los archivos
   generados; la semántica en runtime es de mingako.
3. **Sin estado de ejecución en forge**: nada de daemon, SQLite, sesiones ni
   API HTTP. El CLI es un paso de pipeline (stdin/argv → stdout/exit code).
4. **Estándares antes que formatos propios**: AGENTS.md (Linux Foundation),
   Skills (agentskills.io), MCP, `.claude/agents/`. Forge converge hacia
   ellos; no multiplica variantes.

## Entregas (en orden de prioridad)

### P1 — Salida 100% estándar

Garantizar conformidad estricta de todo lo que forge genera, para que
cualquier orquestador lo herede sin integración:

- AGENTS.md conforme al estándar (incluida precedencia anidada en monorepos).
- Skills generadas validadas contra la spec de agentskills.io.
- Agentes `.claude/agents/*.md` con frontmatter completo (`tools`, `model`,
  `skills`, `mcpServers` cuando aplique).
- Test de conformidad en CI por cada emisor (los 19 runtimes no necesitan
  paridad total, pero los 4 nativos sí conformidad verificable).

**Criterio de aceptación**: suite de conformidad que valida el output de
`forge generate` contra los schemas/specs de cada estándar; verde en CI.

### P2 — `forge export --json` + schemas publicados

- Publicar `@cristiancorreau/forge-schemas` a npm (SemVer estricto desde la
  primera versión pública; los JSON crudos van en el pack).
- Nuevo comando `forge export --json`: emite el **modelo resuelto** del
  proyecto — agentes + tools + skills + MCP servers por runtime — como
  manifiesto machine-readable estable (schema `export.schema.json` en
  forge-schemas). Es el equivalente serializable de `AgentDefinition`:
  mingako puede inyectarlo directo en `query({agents})` del Agent SDK.

**Criterio de aceptación**: `forge export --json | <validador>` pasa contra
`export.schema.json`; round-trip documentado (project.yaml → export → mismo
resultado tras regenerar).

### P3 — `--json` + exit codes estables

`audit`, `recommend`, `doctor` y `port` aceptan `--json` con salida
versionada (campo `schemaVersion`) y exit codes documentados y estables.
Patrón `doctor|validate|score`: un orquestador pregunta programáticamente
"¿este proyecto está sano/apto para agentes?" antes de lanzar un team, y corre
`forge generate` al provisionar un worktree.

**Criterio de aceptación**: tabla de exit codes en la doc de cada comando;
tests que fijan el contrato JSON (snapshot + schema).

### P4 — MCP server de forge

`forge mcp serve` (stdio) expone:

- **resources**: specs de `docs/specs/`, estado del proyecto, resultado de la
  última auditoría.
- **prompts**: agentes y comandos del catálogo como templates.
- **tools**: `forge_audit`, `forge_recommend`, `forge_generate`.

Apuntar a la revisión stateless 2026-07 de MCP. Con esto mingako y cualquier
orquestador (LangGraph, CrewAI, OpenAI Agents SDK) consumen catálogo y
metodología SDD en runtime sin acoplarse al CLI. Forge actúa como "registry
local curado + auditado", coherente con el no-go de marketplace.

**Criterio de aceptación**: server MCP conectable desde Claude Code
(`claude mcp add`); tests de handshake + listado de resources/prompts/tools.

### P5 — Política MCP escaneable + provenance

- Emitir la política MCP efectiva (allowlist de servers, timeouts, permisos,
  default-deny) en un archivo escaneable generado (`.forge/mcp-policy.json`
  o equivalente), con schema en forge-schemas.
- `forge audit --mcp` como escáner de esa política.
- Fase posterior: hash/lockfile de la config generada + detección de drift,
  para que mingako verifique que la config que ejecuta es la que forge generó.

**Criterio de aceptación**: archivo generado validado por schema; el escáner
detecta una edición manual (drift) en un test.

### P6 — Instalador de approvals (mitad forge de SPEC-081)

Hook `pre-approval-gate.cjs` **fail-open**, registrado en hooks-registry.yaml,
activado por `approvals.enabled` en project.yaml, y que sobrevive a
`forge generate`. El hook apunta al circuito externo (mingako) vía
`~/.forge/daemon.json`; si no hay daemon, no bloquea nada.

**Criterio de aceptación**: con `approvals.enabled: true` el hook queda
instalado y regenerable; sin daemon activo, los flujos existentes no cambian
(fail-open verificado por test).

## No-goals

- Daemon, SQLite, sesiones tmux, failover en runtime, web UI, API HTTP/WS
  (todo eso es mingako; ver banners en SPEC-076..082).
- Manifiesto de agente "universal" propio: se usan los estándares existentes.
- Marketplace público (no-go ya decidido).

## Decisiones adoptadas (del análisis §5)

1. **Split de schemas**: forge-schemas retiene `common` + `Project` + los
   nuevos schemas de esta spec (export, mcp-policy). Las 7 entidades de
   ejecución nacerán en mingako-schemas (namespace `mingako://`) cuando
   exista ese repo; una copia inicial no es drift.
2. **SQLite**: mingako es dueño único de su base (`~/.mingako/`); forge no
   usa SQLite.
3. **`forge projects` liviano** (sin daemon, JSON plano): se evalúa como spec
   aparte solo si muestra uso real; no es parte de esta spec.
4. **Piezas anfibias** (hook de approvals, shape de `daemon.json`, claves
   `daemon.*`/`approvals.enabled`): forge es dueño del **schema**; mingako de
   la **semántica en runtime**.
5. **CI de contrato cruzado**: cuando exista mingako, un job suyo corre
   contra `forge-schemas@next` en cada publish.

## Plan de PRs

1. PR docs: este replanteo (banners SPEC-074..082 + SPEC-083 + análisis).
2. PR P2+P3: `forge export --json` + `--json`/exit codes estables (comparten
   la infraestructura de salida machine-readable).
3. PR P1: suite de conformidad de salida estándar.
4. PR P4: MCP server.
5. PR P5: política MCP + escáner.
6. PR P6: instalador de approvals.
7. (Cuando exista el repo mingako) PR de transplante: retirar
   `packages/daemon-core` del workspace y de CI; transplantar el branch
   `archive/v4-fase1-for-mingako`.
