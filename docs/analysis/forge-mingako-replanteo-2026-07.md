# Replanteo forge ↔ mingako — julio 2026

> Documento de análisis. Producido por un equipo de investigación multi-agente
> (referentes: Metaharness de Cognitum, Mastra, ecosistema de interoperabilidad
> AGENTS.md/MCP/Skills/Agent SDK, más análisis interno de las specs v4).
> Adoptado por el dueño del proyecto el 2026-07-18.
> Deriva en: banners de replanteo en SPEC-074..082 y la nueva SPEC-083.

**Tesis**: la separación decidida coincide con el patrón dominante del ecosistema. Metaharness lo formula explícito ("la fábrica de harnesses y el orquestador son productos distintos conectados por contratos"), Mastra separa definición (código tipado) de ejecución (server/Cloud), y los orquestadores de sesiones (Vibe Kanban, Conductor, Mux, Emdash) **no definen agentes: heredan la configuración del repo**. El repo es la interfaz. Forge escribe el repo; mingako lo ejecuta. La regla de dependencia es unidireccional: `mingako → forge` (npm + archivos generados), nunca al revés.

## 1. Nueva definición de límites

| Capacidad (spec v4) | Queda en forge | Va a mingako | Compartida |
|---|---|---|---|
| **SPEC-074** — visión "control plane" | Principios 1–4 (spec-first, hexagonal, contratos neutrales, Markdown portable) como doctrina | El plano de control completo (daemon + SQLite + tmux + web UI) es la definición de mingako | La doctrina; el master spec se re-escribe como spec de mingako |
| **SPEC-075** — `packages/schemas` | Entidades de **generación**: `common` + `Project` (+ project.yaml, manifiesto de agentes, perfiles, catálogo — hoy sin schema) | Entidades de **ejecución**: Task, Session, Harness, Approval, Event, TeamRole (7 de 8 entidades son de orquestación, según el análisis interno) | Sí — el paquete npm publicado es el contrato #1. Forge publica; mingako consume. Ver decisión abierta sobre el split del paquete |
| **SPEC-076** — `daemon-core` (9 puertos, usecases, DDL) | — | Entero. Es dominio puro de orquestación, nadie en el CLI lo importa, y su test de pureza hace el trasplante trivial (copiar carpeta + workspace) | — |
| **SPEC-077** — registro multi-proyecto (SQLite, watcher, API HTTP) | Un `forge projects list/scan` liviano y **sin daemon** (JSON plano o lectura directa), útil para operar init/audit en lote | El registro SQLite con watcher y API: el análisis interno muestra que se diseñó *para* el daemon; su dueño natural es mingako | El schema de `Project` (vía forge-schemas). Mingako descubre proyectos leyendo project.yaml/manifiesto de forge |
| **SPEC-078** — daemon `forged` + tmux + drivers | — | Entero. "Forge nunca ejecuta un runtime, solo genera su config" | — |
| **SPEC-079** — failover router + handoff | La parte estática ya existe como `forge port` (SPEC-073): estado portable = spec + Markdown + git. Forge puede declarar la cadena de fallback como config en project.yaml | Ejecución del failover (pool de harnesses, rate limits, `selectHarness`, handoff en vivo). Mastra demuestra que esto se resuelve simple a nivel aplicación | El formato del paquete de handoff (nota Markdown + frontmatter) |
| **SPEC-080** — vault Obsidian + MCP memory | Dominio y formato de nota (wikilinks, frontmatter, plantillas) — extiende `wiki.ts` e `integrations.obsidian` existentes; un `forge memory` standalone sin daemon tiene valor propio | MCP de escritura en runtime, notas de handoff, retros de tarea | Sí — el formato de nota es el contrato; es la spec más divisible según el análisis |
| **SPEC-081** — approvals fuera de terminal | El **instalador**: hook `pre-approval-gate.cjs` fail-open, hooks-registry.yaml, `approvals.enabled` en project.yaml, supervivencia a `forge generate`. Es exactamente el negocio de forge: generar config que apunta a un servicio externo | El circuito: daemon endpoint, `packages/mcp` con `ask_user`, ApprovalCards, resolución | El contrato ApprovalRequest/Resolution y el shape de `~/.forge/daemon.json` (schemas compartidos) |
| **SPEC-082** — API HTTP/WS + web UI | Tokens visuales "ember" (ya usados por desktop/ y vscode-extension/) | API, WS, terminal, UI React entera | `ApiErrorCode` si se quiere panel unificado; tokens ember como paquete CSS extraíble |

## 2. Fase 4 replanteada: "Compatibilidad mingako"

Lo que forge construye, en orden de prioridad (costo/valor según los tres informes externos):

**P1 — Salida 100% estándar (costo bajo, valor máximo).** El informe de ecosistema es categórico: los orquestadores de sesiones heredan AGENTS.md, `.claude/agents/`, skills y MCP config del repo sin integración alguna. Forge ya genera todo esto; el trabajo es garantizar conformidad estricta: AGENTS.md con precedencia anidada (Linux Foundation), skills validadas contra la spec de agentskills.io, agentes `.claude/agents/` con frontmatter completo (`tools`, `model`, `skills`, `mcpServers`). Bonus clave del Claude Agent SDK: los agentes programáticos **pisan** a los del filesystem con el mismo nombre → mingako puede consumir los archivos de forge tal cual e inyectar overrides (modelo, effort, permisos) sin regenerarlos.

**P2 — `forge export --json` + JSON Schemas publicados.** Publicar `@cristiancorreau/forge-schemas` a npm (ya diseñado para eso: `$id`, generación determinista, JSON crudos en el pack) y agregar un comando que emita el **modelo resuelto**: agentes + tools + skills + MCP servers por runtime — el equivalente al `AgentDefinition` serializable, inyectable directo en `query({agents})`. Es el "manifiesto de salida" que el informe de metaharness identifica como faltante (forge tiene fuente de verdad de entrada, `project.yaml`, pero no manifiesto machine-readable de salida tipo `.harness/manifest.json`).

**P3 — `--json` + exit codes estables en `audit`, `recommend`, `doctor`, `port`.** Patrón `harness doctor|validate|score` de metaharness: un orquestador necesita preguntar programáticamente "¿este proyecto está sano/apto para agentes?". Mingako corre `forge audit --json` antes de lanzar un team y `forge generate` al provisionar un worktree (modelo worktree-por-agente de Conductor/Vibe Kanban). CLI como paso de pipeline, **no** API/daemon.

**P4 — MCP server de forge (diferenciador).** Exponer: `resources` (specs de `docs/specs/`, estado, resultado de auditoría), `prompts` (agentes/comandos del catálogo como templates — patrón ya soportado por OpenAI Agents SDK, que genera instructions desde prompts MCP), `tools` (`forge_audit`, `forge_recommend`, `forge_generate`). Así mingako *y cualquier orquestador* (LangGraph, CrewAI, OpenAI SDK) consumen catálogo y metodología SDD en runtime sin acoplarse al CLI. Apuntar a la revisión stateless 2026-07 de MCP. Cubre además el hueco que Mastra deja abierto (no tiene registry propio, delega en terceros): forge como "registry local curado + auditado", coherente con el no-go de marketplace ya decidido.

**P5 — Política de herramientas escaneable + provenance liviano.** Emitir la política MCP efectiva (allowlist, timeouts, permisos, default-deny) en archivo escaneable estilo `.harness/mcp-policy.json`, con `forge audit --mcp` como escáner; mingako la consume para sandboxing/approval gates sin re-derivarla. Más adelante: hash/lockfile de la config generada + detección de drift (estilo `harness upgrade`), para que mingako verifique que la config que ejecuta es la que forge generó.

**P6 — Instalador de approvals** (la mitad forge de SPEC-081, ya descrita en §1).

## 3. Impacto en las fases pendientes

| Fase | Decisión | Justificación |
|---|---|---|
| **Fase 1** (SPEC-077, projects registry) | **Transformar + partir** | El registro con watcher/API se diseñó para el daemon → mingako. Forge conserva a lo sumo un `forge projects` liviano sin daemon. Es "el momento más barato de la historia del proyecto para decidir" (análisis interno: 0 commits, ningún consumidor). |
| **Fase 2** (SPEC-078, daemon+tmux) | **Mover a mingako** | Cero costo: solo existen las specs. Copiar los .md, reescribir rutas y corregir los drifts detectados al portar (enum de `sessions.status` desalineado entre SPEC-075/076/079; referencias a "tipos Zod" que contradicen el JSON Schema puro de SPEC-075). |
| **Fase 3** (SPEC-082, API+web) | **Mover a mingako** | Ídem. Forge retiene tokens ember; extraer paquete CSS si mingako los quiere. |
| **Fase 5** (SPEC-079 failover, SPEC-080 vault, SPEC-081 approvals) | **Partir en tres**: failover → mingako; vault → dominio/formato en forge, consumo runtime en mingako; approvals → instalador en forge, circuito en mingako | Según la divisibilidad documentada en el análisis interno. La cadena de fallback y `approvals.enabled` quedan como *config declarada* en project.yaml (forge declara, mingako ejecuta — la frontera exacta de metaharness/ruFlo). |

**Branch `feat/v4-fase1-projects-registry`** (~19 archivos sin commitear en `.claude/worktrees/wf_3286209c-b98-1`): **no mergear como está** — mezcla las dos mitades. Partirlo:
- *Rescatar hacia mingako*: `packages/daemon/` entero (`sqlite-registry`, `fs-manifest`, `git-vcs`, `manifest-watcher`, `api/*`, `forged.ts`), migración `002-projects-metadata.sql`, `ports/manifest.ts`, `usecases/projects.ts`. Commitear en una rama de archivo (`archive/v4-fase1-for-mingako`) para transplantar cuando exista el repo mingako, y cerrar el worktree.
- *Evaluar para forge*: la extensión de `project.schema.json` (status/metadata) solo si el `Project` compartido la necesita; si es metadata del registro, va con mingako.

**`packages/daemon-core` (mergeado)**: **mover a mingako** como carpeta completa (única dep: forge-schemas; test de pureza garantiza cero enredos). Mantenerlo en forge tiene "alto costo de oportunidad: dominio de orquestación en un repo que decidió no orquestar confunde el scope y arrastra CI". Retirarlo del workspace y del CI de forge (#192) en el mismo PR del transplante.

## 4. Qué gana mingako de los referentes

1. **Agente vs workflow como primitivas distintas** (Mastra): tareas abiertas → agente; procesos repetibles → grafo determinista con suspend/resume. El flujo SDD (spec → aprobación → implementación → review) mapea a un workflow con pasos human-in-the-loop, no a "una sesión de agente" genérica.
2. **Consumir el repo, no inventar formato propio** (ecosistema): lanzar CLIs autenticados en worktrees aislados que heredan AGENTS.md/`.claude/`/skills (patrón Vibe Kanban/Conductor), con overrides programáticos vía Agent SDK sobre la base en filesystem. No crear un manifiesto de agente "universal" — los estándares que ganaron son AGENTS.md, Skills y MCP.
3. **Failover a nivel aplicación, no gateway** (Mastra + metaharness): string `provider/model` + cadena ordenada de fallbacks con reintentos, más cascada cheap→frontier como palanca de costo ("orchestration as a cost lever, not an accuracy lever" — el router de metaharness logra 56× menos costo).
4. **UI que nace como playground sobre API REST autodescriptiva** (Mastra Studio + Swagger local): approvals en browser y dashboard como herramienta de desarrollo sobre `localhost`, no como producto aparte. Sumar `requireToolApproval` por servidor MCP como patrón concreto de aprobación.
5. **Approval gates con presupuesto retenido y provenance** (MaaS/RVF): acciones irreversibles pausan la sesión en `awaiting-approval` (timeout = rechazo), y a futuro atestación de acciones (aunque sea log firmado con hash, no Ed25519 día uno). Memoria con capas resource/thread + compresión observacional de fondo (Mastra) como modelo para el vault.

## 5. Riesgos y decisiones abiertas

1. **¿Un paquete de schemas o dos?** Riesgo: `forge://schemas/v4/*` describiendo entidades de mingako es "deuda semántica desde el día 1"; copiar los JSON reintroduce el drift que SPEC-075 vino a matar (issue #71). **Recomendación**: partir — `forge-schemas` retiene `common` + `Project` (+ nuevos schemas de project.yaml/manifiesto/export); `mingako-schemas` nace copiando los 7 .schema.json de ejecución (portables por diseño) con namespace `mingako://`, y depende de `forge-schemas` para `Project`. Una sola copia inicial no es drift; drift sería mantener dos fuentes vivas.
2. **¿Quién es dueño de `~/.forge/forge.db`?** El riesgo mayor según el análisis (FKs cruzadas entre projects/tasks/sessions; dos repos escribiendo el mismo archivo = migraciones descoordinadas). **Recomendación**: mingako es dueño único de su SQLite (con TODAS las tablas, en `~/.mingako/`); forge no usa SQLite — si retiene `forge projects`, con JSON plano. Nunca DB compartida.
3. **¿Forge retiene un comando `forge projects`?** **Recomendación**: sí, versión mínima sin daemon (add/list/scan sobre JSON) — habilita audit/init en lote y no compite con mingako. Si en 2 sprints no muestra uso real, eliminarlo.
4. **Dueños de las piezas anfibias**: hook `pre-approval-gate.cjs`, shape de `~/.forge/daemon.json`, claves `daemon.*`/`approvals.enabled` en project.yaml. **Recomendación**: forge es dueño del *schema* de todas (viven en project.yaml y en forge-schemas); mingako es dueño de la *semántica en runtime*. Documentar esta regla en ambos repos para evitar tickets cruzados.
5. **CI de contrato cruzado**: sin él, cada breaking change de `Project` se detecta en producción de mingako (ya no existe el "mismo PR" que prometía SPEC-076). **Recomendación**: job en mingako que corre sus tests contra `forge-schemas@next` en cada publish, + SemVer estricto en forge-schemas desde la primera versión pública.
6. **Seguimiento de la Agentic AI Foundation**: AGENTS.md ya está bajo su gobernanza; Skills y MCP orbitan cerca. **Recomendación**: asignar un chequeo periódico (parte de `forge doctor` o del ciclo de release) para que los 19 emisores converjan hacia esos estándares en vez de multiplicar variantes propias — es la condición para que "el repo es la interfaz" siga siendo cierta a medida que más runtimes los lean nativamente.