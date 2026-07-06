# FORGE v4 — Reporte de kickoff (julio 2026)

> Generado: 2026-07-05
> Alcance: síntesis del kickoff v4 — QA de specs SPEC-074..082, estado de Fase 0 y próximos pasos según el roadmap de SPEC-074.

## 1. Tabla de specs

| Spec | Título | Fase | Estado | Score QA | Aprobada por QA |
|---|---|---|---|---|---|
| SPEC-074 | FORGE v4 — plano de control local-first (spec maestro) | — | DRAFT | n/a (no evaluada en este ciclo) | — |
| SPEC-075 | Paquete `schemas` — contratos neutrales del dominio | 0 | APPROVED | 100 (A) | Sí |
| SPEC-076 | `daemon-core` — puertos, dominio puro, modelo de datos y migraciones | 0 | APPROVED | 100 (A) | Sí |
| SPEC-077 | Registro multi-proyecto + CLI `forge projects` | 1 | APPROVED | 100 (A) | Sí |
| SPEC-078 | Daemon `forged` + gestor de sesiones tmux + drivers de runtime | 2 | APPROVED | 83 (B) | Sí |
| SPEC-079 | Router multi-runtime con failover y handoff semántico | 5 | APPROVED | 100 (A) | Sí |
| SPEC-080 | Vault de memoria compatible con Obsidian + MCP forge-memory | 4 | APPROVED | 83 (B) | Sí |
| SPEC-081 | Aprobaciones fuera de la terminal (hooks PreToolUse + MCP) | 3 | APPROVED | 83 (B) | Sí |
| SPEC-082 | API HTTP/WS (Hono sobre Bun) + UI web (Vite + React) | 3 | APPROVED | 100 (A) | Sí |

Las 8 specs derivadas pasaron QA (score mínimo 83/B) y están en estado APPROVED. Todos los hallazgos de QA fueron menores y no bloqueantes; se listan como deuda de consistencia en la sección 4.

## 2. Estado de la Fase 0 (fundaciones)

- **Rama**: `feat/v4-fase0-foundations` (commit `1acb0de`), **no pusheada al remoto** todavía.
- **Tests**: 50 tests en verde, 0 fallos (24 en `packages/schemas`, 26 en `packages/daemon-core`), sin requerir tmux ni SQLite del sistema.
- **Entregado**:
  - `packages/schemas` (SPEC-075): 9 JSON Schema draft-07 (`$id forge://schemas/v4/*`, `additionalProperties: false`), tipos generados, validadores ajv standalone precompilados (cero `new Ajv` en `src/`), API `parse<X>` / `SchemaValidationError` / `SCHEMAS` / `TASK_STATUSES`.
  - `packages/daemon-core` (SPEC-076): 9 puertos (Registry, Session, Runtime+Provider, Memory, Approval, Vcs, EventBus, Clock, Id), dominio puro (`canTransition`, `sessionName`, errores tipados), 4 casos de uso (`registerProject`, `createTask`, `openSession`, `reconcileOnBoot`), fakes en memoria vía subpath export `./testing`, migración `001-init.sql` (8 tablas, 6 índices) inlineada a `src/db/migrations.generated.ts`.
- **Verificado**: build en ambos paquetes; generación determinista e idempotente; pureza del dominio (grep sin `node:`/`bun:` en `src/` + `purity.test.mjs` detecta regresiones inyectadas); `001-init.sql` aplica limpio en SQLite `:memory:`.
- **Pendientes de Fase 0**:
  1. Agregar `"workspaces": ["packages/*"]` al `package.json` raíz (criterio de SPEC-076; hoy `daemon-core` usa `file:../schemas`).
  2. Pushear la rama y abrir PR.
  3. Divergencia deliberada en `sessions.status`: DDL de SPEC-076 (`running|done|failed|orphaned`) vs schema de SPEC-075 (`starting|running|exited|failed|orphaned`) — converger las dos specs antes de Fase 2.
  4. `ApprovalPort` es la versión mínima; SPEC-081 la supersede en Fase 3.

## 3. Specs en DRAFT y qué les falta

Solo **SPEC-074** (spec maestro) queda en DRAFT. Para pasarla a APPROVED faltan:

- Marcar sus criterios de aceptación: las specs derivadas ya están escritas y evaluadas, y la Fase 0 ya cumple los otros tres criterios (paquetes con tests en verde, `daemon-core` puro, migraciones aplicables) — falta actualizar los checkboxes y el campo Estado una vez mergeada la rama de Fase 0.
- Corregir la imprecisión de ruta heredada (`lib/generators/registry.ts` → `packages/cli/src/lib/generators/registry.ts`) señalada por QA en SPEC-076.
- Resolver la propiedad de decisiones transversales que hoy quedan ambiguas entre specs hijas (puerto 41414, rutas `/vault/notes`, ubicación de `SessionName`, campo `version` en `daemon.json`).

## 4. Deuda de consistencia entre specs (hallazgos menores de QA)

Ninguno bloquea implementación; conviene resolverlos en el PR de la fase correspondiente:

| Tema | Specs involucradas | Resolver en |
|---|---|---|
| Nombres de eventos de proyecto (`project.registered` vs `project.added/removed/updated`) | 076 ↔ 077 | Fase 1 |
| `remoteUrl` requerido en `VcsPort` vs política "métodos opcionales primero" | 076 ↔ 077 | Fase 1 (mismo PR actualiza `FakeVcs`) |
| Dónde vive `SessionName` (`packages/schemas` vs dominio de `daemon-core`) | 075 ↔ 076 ↔ 078 | Fase 2 |
| `agent-event.schema.json` no declarado en SPEC-075 | 075 ↔ 078 | Fase 2 (registrar extensión aditiva) |
| Campo `version` en `~/.forge/daemon.json` (superset de SPEC-082) | 078 ↔ 082 | Fase 2 |
| Rutas de schemas (`src/*.schema.json` vs `schemas/`) y ubicación de `rate-limit-catalog.ts` | 079 ↔ 075/078 | Fase 5 |
| SPEC-079 no menciona ACP pese a la delegación de SPEC-078 | 078 ↔ 079 | Fase 5 |
| Propiedad del puerto 41414 (redacción circular) y rutas `/vault/notes` | 077/078/080 ↔ 082 | Fase 3 |
| Instalación de hooks "vía registry" vs arrays hardcodeados en `init.ts`; resolución `sessionId → taskId` implícita | 081 | Fase 3 |
| Fachada `DaemonCore` citada por SPEC-082 pero no definida en SPEC-076 | 076 ↔ 082 | Fase 3 |
| `~/.forge/memory-index.db` separada vs "SQLite única" del maestro (desviación declarada) | 074 ↔ 080 | Fase 4 (documentar en maestro) |

## 5. Próximos pasos (orden del roadmap de SPEC-074)

### Cierre de Fase 0 (inmediato)
- Aplicar `"workspaces": ["packages/*"]` en el `package.json` raíz, pushear `feat/v4-fase0-foundations` y abrir PR.
- Converger `sessions.status` entre SPEC-075 y SPEC-076.
- Pasar SPEC-074 a APPROVED con los checkboxes actualizados.
- **Criterio de cierre**: PR mergeado, 50 tests en verde en CI, `daemon-core` sin imports de `node:`/`bun:`, migraciones aplicables en SQLite vacía.

### Fase 1 (1-2 semanas) — Registro multi-proyecto → SPEC-077
- CRUD de proyectos, `forge projects add|remove|list|scan`, watcher de `project.yaml`.
- Resolver de paso: nombres de eventos (076↔077) y `remoteUrl` en `VcsPort` + `FakeVcs`.
- **Criterio de cierre**: 3+ proyectos registrados y visibles vía API.

### Fase 2 (2-3 semanas) — Daemon + tmux → SPEC-078
- `SessionPort` con tmux control mode, driver claude-code con tailer JSONL, reconciliación al boot, eventos por WS.
- Resolver de paso: ubicación de `SessionName`, registrar `agent-event.schema.json` en SPEC-075, converger `daemon.json` con SPEC-082.
- **Criterio de cierre**: lanzar, observar y matar una sesión de Claude Code desde la API.

### Fase 3 (2-3 semanas) — UI web + aprobaciones → SPEC-082 + SPEC-081
- Hono sobre Bun (bind 127.0.0.1, token bearer), UI Vite+React (dashboard, board, detalle de sesión, aprobaciones), hooks PreToolUse + MCP `forge`.
- Resolver de paso: propiedad del puerto 41414 y de `/vault/notes`, fachada `DaemonCore`, registry de hooks vs `init.ts`, mapeo `sessionId → taskId`.
- **Criterio de cierre**: operar una tarea completa sin tocar la terminal.

### Fase 4 (2 semanas) — Vault de memoria → SPEC-080
- Vault Obsidian-compatible global + local, índice de backlinks/tags (FTS5), MCP `forge-memory`, browser de notas.
- Documentar en SPEC-074 la desviación `memory-index.db` y la decisión de convivencia read-only con el wiki actual (sin migración).
- **Criterio de cierre**: Obsidian abre el vault sin errores; un agente consulta y escribe notas vía MCP.

### Fase 5 (2-3 semanas) — Harnesses + router de failover → SPEC-079
- HOME aislado por harness, catálogo de rate limit por driver, protocolo de handoff con checkpoint semántico, políticas configurables.
- Resolver de paso: rutas de schemas, ubicación de `rate-limit-catalog.ts`, cobertura ACP delegada por SPEC-078.
- **Criterio de cierre**: simular rate limit en Claude Code y ver la tarea continuar en Codex con nota de handoff.

### Fase 6 (continua) — Equipos de agentes
- Plantillas de teams con roles, asignación por tarea, pipelines por etapa con runtime distinto por rol. Sin spec dedicada aún; derivarla cuando Fase 3 esté cerrada.
