# SPEC-074 FORGE v4 — plano de control local-first (spec maestro)

> Estado: DRAFT — REPLANTEADA (2026-07-18)
> Responsable: forge maintainers
> Creada: 2026-07-05 | Actualizada: 2026-07-05
> Alternativa A: evolución del proyecto existente en TypeScript/Bun
> Versión objetivo: 4.0.0 | Stack: TypeScript, Bun, SQLite, React, tmux

> **Replanteo 2026-07-18 — split forge ↔ mingako**: el plano de control (daemon, SQLite, sesiones tmux, web UI) pasa al proyecto separado mingako. Forge conserva los principios 1–4 como doctrina y toda la capa de generación spec-first. Las fases 1–3 y 5 se transfieren o dividen según el banner de cada spec derivada; la Fase 4 se redefine como compatibilidad con mingako en SPEC-083. Ver `docs/analysis/forge-mingako-replanteo-2026-07.md` y SPEC-083.

## Contexto

Forge v3.x es un generador de configuración per-proyecto (stateless). v4 lo
evoluciona a un **plano de control local-first** (stateful) que gestiona
múltiples proyectos, múltiples equipos de agentes y múltiples runtimes desde
una interfaz web, manteniendo intacta la capa actual de generación spec-first
y adapters.

La instalación en una máquina habilita:

1. Registro y control de N proyectos desde una UI web local.
2. Equipos de agentes con roles, corriendo en sesiones tmux gestionadas.
3. Uso simultáneo de Claude Code, Codex CLI y otros runtimes, con failover
   automático cuando un runtime o cuenta agota tokens.
4. Memoria persistente en archivos .md organizados como vault compatible con Obsidian.
5. Aprobaciones de acciones de agentes desde el navegador.

## Principios de diseño

1. **Spec-first se mantiene.** El project.yaml sigue siendo la fuente de verdad
   por proyecto. El daemon no lo reemplaza, lo consume.
2. **Arquitectura hexagonal estricta.** Dominio puro sin dependencias de
   framework. Toda integración externa (tmux, runtimes, filesystem, SQLite)
   entra por puertos. Habilita extracción futura del core a otro lenguaje.
3. **Contratos en esquema neutral.** Tipos del dominio en JSON Schema (o Zod
   con exportación a JSON Schema). Nada del contrato depende de TypeScript.
4. **Markdown como estado portable.** El estado transferible entre runtimes no
   es la sesión: es el spec + los archivos de memoria + el estado de git.
5. **Local-first, seguro por defecto.** API solo en 127.0.0.1, token bearer por
   lanzamiento, sin telemetría.
6. **ACP como contrato de agentes.** Runtimes vía Agent Client Protocol cuando
   lo soporten; adaptadores propios solo donde ACP no alcance.

## Decisión — estructura del monorepo

```
forge/
├── packages/
│   ├── cli/             # existente: se agregan comandos daemon/projects
│   ├── schemas/         # NUEVO: contratos JSON Schema + tipos Zod
│   ├── daemon-core/     # NUEVO: dominio puro del plano de control
│   ├── daemon/          # NUEVO: forged, infraestructura + API HTTP/WS
│   ├── web/             # NUEVO: UI web (Vite + React)
│   └── mcp/             # NUEVO: servidor MCP de Forge (aprobaciones, board)
├── core/                # existente: hooks, agentes, assets (raíz del repo)
├── docs/specs/          # specs SDD por feature
└── ...
```

Nota de mapeo al repo real: la capa de generación vive hoy en `packages/cli`
(lib/generators, registry) y `core/` en la raíz; v4 no la mueve, la consume.

`daemon-core` no importa nada de Bun, Node, SQLite ni HTTP. Solo tipos de
`schemas` y puertos. Es el candidato a extracción futura.

## Puertos del dominio (daemon-core)

| Puerto | Responsabilidad | Implementación de infraestructura |
|---|---|---|
| `RegistryPort` | CRUD de proyectos registrados y su metadata | SQLite en ~/.forge/forge.db |
| `SessionPort` | Ciclo de vida de sesiones de agente | tmux control mode + node-pty |
| `RuntimePort` | Lanzar, pausar, consultar estado de un runtime | Drivers: claude-code, codex, opencode (ACP o JSONL) |
| `MemoryPort` | Leer/escribir notas, wikilinks, backlinks | Filesystem .md + índice SQLite |
| `ApprovalPort` | Solicitudes de permiso de herramientas | Hooks PreToolUse + MCP |
| `VcsPort` | Worktrees, checkpoints, commits WIP | git CLI |
| `EventBus` | Eventos del dominio hacia UI y logs | WebSocket/SSE broadcast |
| `ClockPort`, `IdPort` | Determinismo para testing | Trivial |

Regla: ningún caso de uso del dominio llama directamente a tmux, git ni fetch.
Todo pasa por puertos. Los tests del dominio corren con fakes en memoria, sin
tmux instalado.

## Modelo de datos

SQLite única en `~/.forge/forge.db`, migraciones SQL numeradas.

```sql
projects(id, name, path, vcs_remote, profile, created_at, last_seen_at)
harnesses(id, runtime, label, home_dir, priority, status,
          rate_limited_until, created_at)
teams(id, name, description)
team_roles(id, team_id, role_name, runtime_pref, system_prompt_ref,
           tier_permissions)
tasks(id, project_id, team_id, title, spec_ref, status, worktree_path,
      base_sha, created_at, updated_at)
-- status: backlog | queued | running | needs_input | review | done | failed | orphaned
sessions(id, task_id, harness_id, role_name, tmux_session, transcript_ref,
         status, started_at, ended_at, tokens_in, tokens_out, handoff_from)
approvals(id, session_id, kind, payload_json, resolution, resolved_at)
events(id, ts, kind, entity, entity_id, payload_json)
```

## Componentes

### Registro multi-proyecto
- `forge projects add|remove|list|scan`. `scan` detecta project.yaml en rutas dadas.
- Daemon cachea metadata y observa cambios del project.yaml con watcher.
- UI: dashboard con estado por proyecto (sesiones activas, tareas en cola, eventos).

### Gestor de sesiones tmux
- Nombres: `forge:{project}:{task}:{role}`.
- tmux control mode; prompts con load-buffer + paste-buffer + send-keys.
- Streaming: Claude Code → tail del transcript JSONL de `~/.claude/projects/`;
  runtimes ACP → stream nativo; fallback pipe-pane.
- Terminal embebida: node-pty backend, xterm.js frontend, WebSocket.
- **Reconciliación al boot**: matar sesiones tmux huérfanas con prefijo forge:
  sin fila activa; marcar `orphaned` toda sesión running sin proceso vivo.

### Router multi-runtime con failover (diferenciación principal)
- **Pool de destinos** = harnesses por prioridad; harness = (runtime × cuenta)
  con HOME aislado.
- **Detección de agotamiento**: códigos de salida y patrones de rate limit en
  stderr/JSONL por runtime (catálogo por driver); eventos de usage; al detectar,
  marcar `harnesses.rate_limited_until` (backoff con reintento programado).
- **Protocolo de handoff (checkpoint semántico)**: (1) congelar sesión origen;
  commit WIP `forge-checkpoint:`; (2) nota de handoff en markdown en el vault
  (objetivo, spec, completado, decisiones, pendiente, archivos, comandos);
  (3) encolar en el siguiente harness con prompt de reanudación (nota + diff);
  (4) registrar `sessions.handoff_from`.
- **Políticas configurables**: orden de preferencia, tareas sin failover
  (requieren aprobación humana), presupuesto de tokens por tarea.

### Vault de memoria compatible con Obsidian
- `~/.forge/vault/` (global) + `{proyecto}/.forge/memory/` (local), ambos
  vaults Obsidian válidos (.md + frontmatter YAML + wikilinks `[[nota]]`).
- Extiende el paquete wiki existente: parser de wikilinks, índice de backlinks
  y tags en SQLite (FTS5), API de consulta para agentes.
- Tipos de nota con plantillas: decisión, handoff, retro de tarea, conocimiento
  de proyecto, perfil de agente.
- UI: browser de notas, backlinks, grafo (d3-force) opcional.
- Agentes leen/escriben vía MCP `forge-memory` (query, read, write, link).

### Aprobaciones fuera de la terminal
- Instalador de hooks PreToolUse por proyecto que hace POST al daemon.
- Servidor MCP `forge` que expone ask_user y captura ExitPlanMode/AskUserQuestion.
- UI: cards estructuradas (radio, checkbox, texto libre) con "permitir siempre
  para esta tarea". Timeout configurable con acción por defecto (denegar).

### API y UI web
- Hono sobre Bun. REST para CRUD, WebSocket para eventos y terminales, SSE fallback.
- Bind exclusivo 127.0.0.1. Token bearer aleatorio por lanzamiento. CORS cerrado.
- UI: Vite + React + Tailwind. Vistas: Dashboard, Board de tareas, Detalle de
  sesión (transcript + terminal), Harnesses y consumo, Vault, Aprobaciones, Config.
- Acceso remoto fuera de alcance; se documenta Tailscale/VPN.

## Plan de reciclaje (clonar, refactorizar, reescribir)

Proceso por módulo: (1) clonar y leer, (2) refactor local como ejercicio de
comprensión, (3) documentar decisiones en spec SDD propio, (4) reescribir desde
el spec sin el código fuente a la vista.

| Fuente | Licencia | Qué estudiar | Destino en Forge |
|---|---|---|---|
| Agetor | MIT | claude-tmux.ts, orchestrator, interactions, hook-installer, MCP server, migraciones | SessionPort impl, ApprovalPort impl |
| Vibe Kanban | Apache-2.0 | Modelo de attempts, board como servidor MCP, executor plugin | Modelo de tasks/sessions, paquete mcp |
| Kandev | revisar | Adopción de ACP, workflows multi-agente por etapa | RuntimePort, pipelines de teams |
| Gastown | revisar | Patrón beads: memoria git-backed consultable | Diseño del vault + índice |
| amux | MIT | Watchdog auto-reparador, reconciliación mínima sobre tmux | Reconciliación y health checks |
| cmux | verificar stack | Arquitectura daemon si confirma TypeScript | Posible donante principal alternativo |

## Roadmap por fases

Cada fase cierra con spec SDD APPROVED, tests del dominio en verde y demo funcional.

- **Fase 0 (1 semana): fundaciones.** Paquete schemas con contratos JSON Schema.
  Esqueleto daemon-core con puertos y fakes. Migraciones iniciales. → SPEC-075, SPEC-076
- **Fase 1 (1-2 semanas): registro multi-proyecto.** CRUD, scan, watcher.
  CLI `forge projects`. Criterio: 3+ proyectos registrados y visibles vía API. → SPEC-077
- **Fase 2 (2-3 semanas): daemon + tmux.** SessionPort con tmux, driver
  claude-code con tailer JSONL, reconciliación al boot, eventos por WS.
  Criterio: lanzar, observar y matar una sesión de Claude Code desde la API. → SPEC-078
- **Fase 3 (2-3 semanas): UI web.** Dashboard, board, detalle de sesión,
  aprobaciones. Criterio: operar una tarea completa sin tocar la terminal. → SPEC-082
- **Fase 4 (2 semanas): vault.** Migración del wiki actual, backlinks, MCP
  forge-memory, browser. Criterio: Obsidian abre el vault sin errores; un agente
  consulta y escribe notas vía MCP. → SPEC-080
- **Fase 5 (2-3 semanas): harnesses + router de failover.** HOME aislado,
  catálogo de rate limit, handoff, políticas. Criterio: simular rate limit en
  Claude Code y ver la tarea continuar en Codex con nota de handoff. → SPEC-079
- **Fase 6 (continua): equipos de agentes.** Plantillas de teams con roles,
  asignación por tarea, pipelines por etapa con runtime distinto por rol.

## Requisitos no funcionales

- 20 proyectos registrados y 10 sesiones concurrentes en 16 GB RAM sin
  degradación perceptible de la UI.
- Latencia de eco en terminal web < 50 ms en localhost.
- El daemon se recupera de un kill -9 sin estado corrupto (reconciliación +
  events append-only).
- Cero dependencias de servicios cloud para operar.
- Distribución: `bun build --compile` para binario único + npm como canal alternativo.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Formato JSONL de Claude Code cambia sin aviso | Encapsular en driver versionado; preferir ACP cuando esté disponible |
| Detección de rate limit frágil entre versiones de CLIs | Catálogo de patrones por versión + test de contrato por driver |
| Scope creep de la UI | La UI solo consume la API pública; ninguna lógica de negocio en frontend |
| Deriva del dominio hacia dependencias TS | Lint rule: daemon-core no puede importar de daemon ni de node/bun builtins |
| Competencia con tracción masiva (vibe-kanban, cmux) | No competir en board genérico; foco en failover + vault + spec-first |

## Criterios de aceptación (del spec maestro)

- [ ] Specs derivadas SPEC-075..SPEC-082 escritas y evaluadas con `forge spec-probe`.
- [ ] Fase 0 implementada: `packages/schemas` + `packages/daemon-core` (puertos +
      fakes en memoria) con tests en verde sin tmux/SQLite instalados.
- [ ] `daemon-core` sin imports de node:/bun:/sqlite/http (verificable por lint/test).
- [ ] Migraciones SQL iniciales numeradas presentes y aplicables en SQLite vacía.

## Specs derivadas

| Spec | Componente | Fase |
|---|---|---|
| SPEC-075 | Paquete `schemas` — contratos neutrales | 0 |
| SPEC-076 | `daemon-core` — puertos, dominio, modelo de datos y migraciones | 0 |
| SPEC-077 | Registro multi-proyecto + `forge projects` | 1 |
| SPEC-078 | Daemon + gestor de sesiones tmux + drivers de runtime | 2 |
| SPEC-079 | Router multi-runtime con failover y handoff | 5 |
| SPEC-080 | Vault de memoria compatible con Obsidian + MCP forge-memory | 4 |
| SPEC-081 | Aprobaciones fuera de la terminal (hooks + MCP) | 3 |
| SPEC-082 | API HTTP/WS + UI web | 3 |
