# SPEC-076 daemon-core — puertos, dominio puro, modelo de datos y migraciones

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-07-05 | Actualizada: 2026-07-05
> Deriva de: SPEC-074 (spec maestro FORGE v4) — secciones "Puertos del dominio" y "Modelo de datos"
> Depende de: SPEC-075 (paquete `schemas`) para los tipos de entidades

## Contexto

Forge v3.11 es un CLI stateless: `packages/cli` lee `project.yaml`, genera
configuración por runtime vía `packages/cli/src/lib/generators/registry.ts`
(patrón `RuntimeDescriptor` con `surfaces(config)`) y termina. No hay proceso
residente, ni base de datos, ni estado entre invocaciones. El repo hoy tiene un
solo paquete (`packages/cli`, `@cristiancorreau/forge`), el `package.json` raíz
no declara workspaces, los tests corren con `node --test` (archivos `.test.mjs`
enumerados en el script `test` del paquete) y existe el precedente
`scripts/build-assets.mjs` para inlinear assets en TypeScript.

SPEC-074 introduce el plano de control v4 con arquitectura hexagonal estricta:
un paquete `daemon-core` con el dominio puro (puertos + casos de uso), donde
toda integración externa (tmux, git, SQLite, HTTP, filesystem) entra por
puertos y los tests corren con fakes en memoria. El maestro fija la regla dura:
`daemon-core` no importa nada de `node:`/`bun:`/sqlite/http — es el candidato a
extracción futura a otro lenguaje.

Esta spec define ese paquete para la Fase 0: las nueve interfaces de puertos,
los cuatro casos de uso iniciales, los fakes en memoria, el modelo de datos
SQLite con la migración `001-init`, y el mecanismo verificable que garantiza la
pureza del dominio. El patrón ya probado en v3 (`RuntimeDescriptor` como
contrato + implementaciones intercambiables) se generaliza aquí a todos los
efectos externos.

## Decisión

1. **Nuevo paquete `packages/daemon-core`** (`@cristiancorreau/forge-daemon-core`,
   `"private": true` en Fase 0, `"type": "module"`, build con `tsc`, tests con
   `node --test test/*.test.mjs` — mismo esquema que `packages/cli`). El
   `package.json` raíz se convierte en workspace mínimo:
   `"workspaces": ["packages/*"]`. Única dependencia de producción permitida:
   `@cristiancorreau/forge-schemas` (SPEC-075). Mientras SPEC-075 no publique
   los tipos, `daemon-core` los declara provisionalmente en `src/types.ts` y
   los re-exporta; al llegar `schemas`, `src/types.ts` pasa a ser un re-export
   puro (`export * from '@cristiancorreau/forge-schemas'`).

2. **Estructura del paquete**:

   ```
   packages/daemon-core/
   ├── package.json
   ├── tsconfig.json
   ├── migrations/
   │   └── 001-init.sql                  # fuente de verdad del DDL
   ├── scripts/
   │   └── build-migrations.mjs          # inlinea *.sql → src/db/migrations.generated.ts
   ├── src/
   │   ├── index.ts                      # export público: puertos, usecases, errores
   │   ├── types.ts                      # entidades (provisional → re-export de schemas)
   │   ├── ports/
   │   │   ├── registry.ts   session.ts   runtime.ts   memory.ts
   │   │   ├── approval.ts   vcs.ts       event-bus.ts clock.ts   id.ts
   │   ├── domain/
   │   │   ├── task-status.ts            # máquina de estados pura
   │   │   ├── session-name.ts           # forge:{project}:{task}:{role}
   │   │   └── errors.ts                 # errores tipados del dominio
   │   ├── usecases/
   │   │   ├── register-project.ts  create-task.ts
   │   │   ├── open-session.ts      reconcile-on-boot.ts
   │   ├── db/
   │   │   └── migrations.generated.ts   # generado, no editar a mano
   │   └── testing/                      # fakes en memoria (subpath export "./testing")
   │       ├── index.ts  in-memory-registry.ts  fake-session-port.ts
   │       ├── fake-runtime.ts  fake-vcs.ts  fake-memory.ts  fake-approvals.ts
   │       ├── in-memory-event-bus.ts  fake-clock.ts  seq-ids.ts
   └── test/
       ├── purity.test.mjs  task-status.test.mjs
       ├── usecases.test.mjs  migrations.test.mjs
   ```

3. **Puertos — interfaces TypeScript** (una por archivo en `src/ports/`; los
   tipos `Project`, `Harness`, `Task`, `Session`, `Approval`, `DomainEvent`,
   etc. vienen de `src/types.ts`):

   ```ts
   // ports/registry.ts — persistencia; la impl SQLite vive en packages/daemon
   export interface Repo<T extends { id: string }> {
     insert(row: T): Promise<void>;
     byId(id: string): Promise<T | null>;
     list(): Promise<T[]>;
     update(row: T): Promise<void>;
     remove(id: string): Promise<void>;
   }
   export interface RegistryPort {
     projects: Repo<Project> & { byPath(path: string): Promise<Project | null> };
     harnesses: Repo<Harness> & { available(nowIso: string): Promise<Harness[]> };
     teams: Repo<Team>;
     tasks: Repo<Task> & {
       byProject(projectId: string): Promise<Task[]>;
       byStatus(status: TaskStatus): Promise<Task[]>;
     };
     sessions: Repo<Session> & {
       active(): Promise<Session[]>;            // status = 'running'
       byTask(taskId: string): Promise<Session[]>;
     };
     approvals: Repo<Approval> & { pending(): Promise<Approval[]> };
     events: {
       append(e: DomainEvent): Promise<void>;   // append-only, sin update/remove
       since(tsIso: string, limit?: number): Promise<DomainEvent[]>;
     };
   }

   // ports/session.ts — ciclo de vida tmux (impl: control mode, SPEC-078)
   export interface SessionPort {
     open(spec: { name: string; cwd: string; command: RuntimeCommand }): Promise<void>;
     sendPrompt(name: string, prompt: string): Promise<void>;
     kill(name: string): Promise<void>;
     isAlive(name: string): Promise<boolean>;
     listLive(prefix: string): Promise<string[]>;  // nombres con prefijo 'forge:'
   }

   // ports/runtime.ts — driver por runtime (claude-code, codex, opencode…)
   export interface RuntimeCommand { argv: string[]; env: Record<string, string>; cwd: string }
   export interface RuntimePort {
     readonly runtime: string;                       // id, ej. 'claude-code'
     buildCommand(input: { harness: Harness; task: Task; roleName: string; prompt: string }): RuntimeCommand;
     parseTranscriptLine(line: string): RuntimeEvent | null;
     detectExhaustion(chunk: string): { retryAfterIso: string | null } | null;
   }
   export interface RuntimeProvider { get(runtime: string): RuntimePort | null }

   // ports/memory.ts — vault .md (impl: filesystem + FTS5, SPEC-080)
   export interface MemoryPort {
     read(ref: string): Promise<{ ref: string; frontmatter: Record<string, unknown>; body: string } | null>;
     write(note: { ref: string; frontmatter: Record<string, unknown>; body: string }): Promise<void>;
     query(q: { text?: string; tags?: string[]; limit?: number }): Promise<string[]>;  // refs
     backlinks(ref: string): Promise<string[]>;
   }

   // ports/approval.ts — versión mínima de Fase 0. SPEC-081 (dueña del
   // contrato de aprobaciones) la SUPERSEDE con la interfaz completa
   // (insert/resolve/get/listPending/insertRule/matchRule) y enums
   // allow|deny|answer|timeout; al implementar SPEC-081 se reemplaza esta
   // firma y sus fakes en el mismo PR (política de extensión de Riesgos).
   export interface ApprovalPort {
     request(req: { sessionId: string; kind: string; payload: unknown }): Promise<string>; // approvalId
     resolve(approvalId: string, resolution: 'allow' | 'deny' | 'always'): Promise<void>;
     onRequest(handler: (approval: Approval) => void): () => void;
   }

   // ports/vcs.ts — git (impl: git CLI, SPEC-078)
   export interface VcsPort {
     currentSha(repoPath: string): Promise<string>;
     createWorktree(repoPath: string, branch: string, baseSha: string): Promise<string>; // worktreePath
     removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
     commitWip(worktreePath: string, message: string): Promise<string>;                  // sha
     isDirty(worktreePath: string): Promise<boolean>;
   }

   // ports/event-bus.ts
   export interface EventBus {
     publish(e: DomainEvent): void;
     subscribe(kinds: string[] | '*', handler: (e: DomainEvent) => void): () => void;
   }

   // ports/clock.ts y ports/id.ts — determinismo en tests
   export interface ClockPort { nowIso(): string }
   export interface IdPort { newId(): string }
   ```

4. **Dominio puro en `src/domain/`**:
   - `task-status.ts`: `type TaskStatus = 'backlog' | 'queued' | 'running' |
     'needs_input' | 'review' | 'done' | 'failed' | 'orphaned'` (idéntico al
     enum del maestro) y `canTransition(from: TaskStatus, to: TaskStatus):
     boolean` — función pura con la tabla de transiciones válidas; `done` es
     terminal, `failed`/`orphaned` solo pueden volver a `queued`.
   - `session-name.ts`: `sessionName(project: string, task: string, role:
     string): string` → `forge:{project}:{task}:{role}` con sanitización
     `[a-z0-9-]` por segmento. Es el contrato que usa la reconciliación.
   - `errors.ts`: `class DomainError extends Error { readonly code: string }` y
     subclases `DuplicateProjectPathError`, `ProjectNotFoundError`,
     `TaskNotFoundError`, `HarnessNotFoundError`, `InvalidTransitionError`.

5. **Casos de uso iniciales en `src/usecases/`** — funciones puras respecto a
   efectos: reciben puertos como primer argumento, jamás instancian
   infraestructura. Firmas:

   ```ts
   // register-project.ts — el parsing de project.yaml lo hace el adapter en daemon
   export async function registerProject(
     deps: { registry: RegistryPort; clock: ClockPort; ids: IdPort; bus: EventBus },
     input: { path: string; name: string; profile: string; vcsRemote?: string },
   ): Promise<Project>;
   // Lanza DuplicateProjectPathError si registry.projects.byPath(input.path) existe.
   // Emite evento kind='project.registered' y lo persiste en registry.events.

   // create-task.ts
   export async function createTask(
     deps: { registry: RegistryPort; clock: ClockPort; ids: IdPort; bus: EventBus },
     input: { projectId: string; title: string; teamId?: string; specRef?: string },
   ): Promise<Task>;
   // Valida proyecto (ProjectNotFoundError). status inicial: 'backlog'. Evento 'task.created'.

   // open-session.ts
   export async function openSession(
     deps: { registry: RegistryPort; sessions: SessionPort; runtimes: RuntimeProvider;
             vcs: VcsPort; clock: ClockPort; ids: IdPort; bus: EventBus },
     input: { taskId: string; harnessId: string; roleName: string; prompt: string },
   ): Promise<Session>;
   // 1) valida task y harness; 2) si task.worktreePath es null, crea worktree
   //    (branch `forge/{taskId}`, base task.baseSha ?? vcs.currentSha) y actualiza task;
   // 3) sessions.open con sessionName(...) y runtimes.get(harness.runtime).buildCommand(...);
   // 4) persiste session status='running', task → 'running' (via canTransition);
   // 5) evento 'session.opened'.

   // reconcile-on-boot.ts
   export async function reconcileOnBoot(
     deps: { registry: RegistryPort; sessions: SessionPort; clock: ClockPort; bus: EventBus },
   ): Promise<{ killedTmux: string[]; orphanedSessions: string[] }>;
   // a) sessions.listLive('forge:'): toda sesión tmux sin fila 'running' → kill (evento 'session.reaped');
   // b) toda fila 'running' sin tmux vivo → status 'orphaned', endedAt=nowIso,
   //    y su task → 'orphaned' si no le quedan sesiones activas (evento 'session.orphaned').
   ```

6. **Fakes en memoria en `src/testing/`**, publicados como subpath export
   `"./testing"` para que `daemon`, `cli` y futuros paquetes los reusen:
   - `InMemoryRegistry implements RegistryPort` — Maps por tabla; `events.append`
     acumula en array.
   - `FakeSessionPort implements SessionPort` — registro de llamadas (`opened`,
     `killed`, `prompts`) y set mutable `live` para simular sesiones vivas/muertas.
   - `FakeRuntime implements RuntimePort` + `FakeRuntimeProvider`.
   - `FakeVcs implements VcsPort` — shas secuenciales `sha-1`, `sha-2`…
   - `FakeMemory`, `FakeApprovals` — Maps simples.
   - `InMemoryEventBus implements EventBus` — entrega síncrona + array `published`.
   - `FakeClock` — `nowIso()` fijo, método `advance(ms)`.
   - `SeqIds implements IdPort` — `id-0001`, `id-0002`…

7. **Modelo de datos y migración `migrations/001-init.sql`** — DDL literal del
   maestro con tipos, claves foráneas, CHECK de enums e índices:
   tablas `projects`, `harnesses`, `teams`, `team_roles`, `tasks`, `sessions`,
   `approvals`, `events` con las columnas exactas de SPEC-074 (§ Modelo de
   datos). Reglas del DDL:
   - `id TEXT PRIMARY KEY` en todas; timestamps `TEXT` ISO-8601 UTC.
   - `tasks.status` con `CHECK (status IN ('backlog','queued','running','needs_input','review','done','failed','orphaned'))`;
     `sessions.status` con `CHECK (status IN ('running','done','failed','orphaned'))`.
   - FKs: `team_roles.team_id → teams`, `tasks.project_id → projects`,
     `tasks.team_id → teams`, `sessions.task_id → tasks`,
     `sessions.harness_id → harnesses`, `approvals.session_id → sessions`.
   - `UNIQUE (projects.path)`.
   - Índices: `idx_tasks_project (tasks.project_id)`, `idx_tasks_status
     (tasks.status)`, `idx_sessions_task (sessions.task_id)`,
     `idx_sessions_status (sessions.status)`, `idx_events_ts (events.ts)`,
     `idx_approvals_session (approvals.session_id)`.
   - `001-init.sql` es DDL plano aplicable a una SQLite vacía; la tabla de
     control `schema_migrations` y la ejecución son responsabilidad del runner
     en `packages/daemon` (SPEC-078). `daemon-core` solo es dueño del contenido.

8. **Migraciones sin romper la pureza**: como el dominio no puede leer
   filesystem, `scripts/build-migrations.mjs` (mismo patrón que
   `packages/cli/scripts/build-assets.mjs`) inlinea `migrations/*.sql` en
   `src/db/migrations.generated.ts`:

   ```ts
   export const MIGRATIONS: ReadonlyArray<{ id: number; name: string; sql: string }> = [
     { id: 1, name: '001-init', sql: `...` },
   ];
   ```

   El script corre en `prebuild`. `test/migrations.test.mjs` falla si el
   `.sql` y el `.generated.ts` divergen (comparación de contenido normalizado).

9. **Regla dura de pureza — verificación por test de lint**
   (`test/purity.test.mjs`, corre en la suite normal, sin herramientas extra):
   - Recorre recursivamente `src/**/*.ts` (excluye `test/`; el test mismo sí usa
     `node:fs`, es infraestructura de test, no dominio).
   - Extrae todo `import ... from '<spec>'`, `export ... from '<spec>'`,
     `import('<spec>')` y `require('<spec>')`.
   - Falla si `<spec>` empieza con `node:` o `bun:`, o es uno de los builtins
     desnudos (`fs`, `path`, `os`, `child_process`, `http`, `https`, `net`,
     `crypto`, `url`, `stream`, `util`, `events`, `worker_threads`), o contiene
     `sqlite`, o resuelve a un paquete distinto de
     `@cristiancorreau/forge-schemas`.
   - Además valida que `package.json` de `daemon-core` no tenga más
     `dependencies` que `@cristiancorreau/forge-schemas`.
   - Verificación manual equivalente:
     `grep -rE "from ['\"](node:|bun:)" packages/daemon-core/src` → sin resultados.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Meter puertos y casos de uso en `packages/cli/src/lib/daemon/` sin paquete nuevo | Cero cambios de workspace; reusa build y CI existentes | El límite de pureza queda difuso (cli importa `node:` por todos lados); imposible acotar el lint; bloquea la extracción futura que el maestro exige | Viola el principio 2 de SPEC-074 (hexagonal estricta) |
| Un `StoragePort` genérico clave-valor en lugar de `RegistryPort` tipado por entidad | Interfaz mínima, impl trivial | Pierde contratos por tabla (finders como `byPath`, `active()`), empuja la semántica SQL al dominio o a strings sin tipo; los fakes no detectan errores de forma | Contratos débiles = tests débiles |
| ORM (Drizzle/Kysely) con esquema en TS y migraciones autogeneradas | Tipos derivados del esquema, menos SQL manual | Acopla el dominio (o al menos el modelo) a una dependencia de infraestructura TS; migraciones autogeneradas opacas para 8 tablas | SQL numerado manual es auditable y suficiente; el contrato neutral es el `.sql`, no un DSL |

## Criterios de aceptación

- [ ] `packages/daemon-core` existe con la estructura del punto 2; raíz con `"workspaces": ["packages/*"]`; `npm install` en la raíz enlaza el workspace sin errores.
- [ ] Los 9 puertos (`RegistryPort`, `SessionPort`, `RuntimePort`+`RuntimeProvider`, `MemoryPort`, `ApprovalPort`, `VcsPort`, `EventBus`, `ClockPort`, `IdPort`) compilan con las firmas del punto 3 y se exportan desde `src/index.ts` (verificable: `tsc --noEmit` en el paquete + inspección de exports).
- [ ] `test/purity.test.mjs` existe, pasa, y detecta regresiones: agregar temporalmente `import 'node:fs'` a `src/index.ts` lo hace fallar (verificación manual documentada en el propio test).
- [ ] `grep -rE "from ['\"](node:|bun:)" packages/daemon-core/src` no devuelve resultados; `dependencies` del paquete ⊆ `{@cristiancorreau/forge-schemas}`.
- [ ] `test/task-status.test.mjs`: cubre transiciones válidas e inválidas de `canTransition` (mínimo: `backlog→queued`, `queued→running`, `running→done`, `done→*` rechazado, `orphaned→queued` permitido) y la sanitización de `sessionName`.
- [ ] `test/usecases.test.mjs` con fakes: `registerProject` feliz + `DuplicateProjectPathError`; `createTask` feliz + `ProjectNotFoundError`; `openSession` crea worktree cuando falta, nombra la sesión `forge:{project}:{task}:{role}` y deja task/session en `running`; `reconcileOnBoot` mata tmux huérfanas y marca `orphaned` las filas sin proceso — todo verificando los eventos emitidos.
- [ ] La suite completa del paquete (`npm test` en `packages/daemon-core`) pasa en una máquina **sin tmux ni SQLite instalados** (solo Node ≥ 20).
- [ ] `migrations/001-init.sql` aplica limpio sobre SQLite vacía: `sqlite3 ":memory:" < packages/daemon-core/migrations/001-init.sql` sale con código 0 (o el test condicional equivalente con `node:sqlite`, que se salta si no está disponible).
- [ ] El DDL contiene las 8 tablas del maestro, `UNIQUE` en `projects.path`, los `CHECK` de status y los 6 índices del punto 7 (inspección del `.sql`).
- [ ] `test/migrations.test.mjs` falla si `migrations/001-init.sql` y `src/db/migrations.generated.ts` divergen; `node scripts/build-migrations.mjs` los re-sincroniza.
- [ ] Los fakes se importan vía `@cristiancorreau/forge-daemon-core/testing` (subpath export declarado en `package.json` y usado por los propios tests).
- [ ] Ningún archivo fuera de `packages/daemon-core/`, `package.json` raíz y esta spec cambia (inspección del diff).

## Riesgos e impacto

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Duplicación SQL (`.sql` vs `.generated.ts`) se desincroniza | Migración aplicada ≠ contrato del dominio | Test de sincronía obligatorio + generación en `prebuild` |
| Los puertos se quedan cortos al implementar tmux/drivers reales (SPEC-078) | Cambios de interfaz en cascada | Extensión aditiva: métodos nuevos opcionales primero; los fakes viven junto al puerto y se actualizan en el mismo PR |
| SPEC-075 (`schemas`) se retrasa | `daemon-core` bloqueado | Tipos provisionales en `src/types.ts` con la misma forma; el corte a re-export es mecánico |
| El lint por regex de `purity.test.mjs` no cubre imports exóticos (dynamic import calculado) | Fuga de pureza silenciosa | La regla también limita `dependencies` en `package.json`; en CI se puede sumar `eslint-plugin-import` más adelante sin cambiar el contrato |
| Convertir la raíz a workspaces afecta el flujo actual de `packages/cli` | Ruido en build/publish de v3.x | Cambio mínimo (una línea); `cli` no depende de los paquetes nuevos y su `npm publish` usa su propio `package.json` |

**Impacto**: cero en runtime de v3.x — `daemon-core` es privado, no se publica
ni se importa desde `cli` en Fase 0. Sin red, sin LLM, sin telemetría. Habilita
SPEC-077/078 (registro y daemon) que consumirán estos puertos.
