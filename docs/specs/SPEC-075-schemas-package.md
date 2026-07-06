# SPEC-075 Paquete schemas — contratos neutrales del dominio

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-07-05 | Actualizada: 2026-07-05
> Deriva de: SPEC-074 (Principio 3 — contratos en esquema neutral; Modelo de datos) | Fase 0

## Contexto

FORGE v4 introduce un plano de control stateful (daemon + daemon-core) cuyo
dominio debe ser puro y extraíble a otro lenguaje (SPEC-074, Principio 2). Eso
exige que los tipos del dominio — Project, Harness, Team, TeamRole, Task,
Session, Approval, Event — vivan en un contrato neutral que no dependa de
TypeScript (Principio 3).

El repo v3.11 ya tiene precedente y también el anti-patrón que esta spec corrige:

- `core/schemas/project.schema.json` es un JSON Schema draft-07 escrito a mano
  para `project.yaml`, validado con `ajv` + `ajv-formats` en
  `packages/cli/src/commands/validate.ts` (vía `createRequire`).
- Los tipos TS de ese mismo contrato están duplicados a mano en
  `packages/cli/src/lib/yaml.ts` (`ProjectYaml` y compañía). Schema y tipos ya
  han derivado: el enum de `agents.profiles` tuvo que borrarse en runtime en
  `validate.ts` (issue #71) porque el schema manual quedó desactualizado.
- `packages/cli/package.json` ya declara `ajv ^8.20.0` y `ajv-formats ^3.0.1`;
  no hay Zod ni ninguna otra librería de validación en el repo.

Para v4 no se puede repetir la duplicación manual: 8 entidades × (schema +
tipo + validador) mantenidos a mano garantizan drift. `packages/schemas` es la
fuente única: JSON Schema como fuente de verdad, tipos TS y validadores
**generados** desde los schemas, publicable a npm para que `daemon-core`,
`daemon`, `web` y `mcp` consuman el mismo contrato.

**Decisión JSON Schema puro vs Zod:** JSON Schema puro. Razones: (a) el
Principio 3 exige que nada del contrato dependa de TypeScript — con Zod la
fuente de verdad sería código TS y el JSON Schema un artefacto derivado, lo
inverso de lo pedido; (b) el repo ya opera ajv/ajv-formats y draft-07, cero
dependencias nuevas de validación; (c) los `.schema.json` son consumibles tal
cual por un futuro core en otro lenguaje, por SQLite CHECK constraints
derivadas (SPEC-076) y por la UI (SPEC-082) sin puente alguno.

## Decisión

1. **Nuevo paquete `packages/schemas`**, nombre npm
   `@cristiancorreau/forge-schemas`, versión inicial `0.1.0`, `"type": "module"`,
   licencia Apache-2.0, `engines.node >= 20`. Mismo estilo de build que
   `packages/cli`: `tsc` con `target ES2022`, `module NodeNext`, `declaration`.
   El repo no usa npm workspaces y esta spec no los introduce: los consumidores
   locales (SPEC-076+) referencian `"@cristiancorreau/forge-schemas": "file:../schemas"`.

2. **Estructura del paquete** (rutas exactas):

   ```
   packages/schemas/
   ├── package.json
   ├── tsconfig.json
   ├── schemas/                      # FUENTE DE VERDAD (draft-07, a mano)
   │   ├── common.schema.json        # $defs compartidos
   │   ├── project.schema.json
   │   ├── harness.schema.json
   │   ├── team.schema.json
   │   ├── team-role.schema.json
   │   ├── task.schema.json
   │   ├── session.schema.json
   │   ├── approval.schema.json
   │   └── event.schema.json
   ├── scripts/generate.mjs          # genera tipos + validadores
   ├── src/
   │   ├── index.ts                  # API pública (a mano)
   │   ├── types.gen.ts              # GENERADO — no editar
   │   └── validators.gen.mjs        # GENERADO — no editar (+ validators.gen.d.mts)
   └── test/schemas.test.mjs         # node --test, estilo de la casa
   ```

   `core/schemas/project.schema.json` (el schema de `project.yaml` v2) **no se
   mueve ni se toca**: describe el archivo de configuración por proyecto, no la
   entidad `Project` del registro del daemon. Son contratos distintos.

3. **Convenciones de schema** (aplican a los 9 archivos, verificadas por test):
   - `"$schema": "http://json-schema.org/draft-07/schema#"` — consistente con
     `core/schemas/project.schema.json` y con el modo default de `new Ajv()`
     en ajv 8. Migrar a 2020-12 queda explícitamente fuera de alcance.
   - `"$id": "forge://schemas/v4/<entidad>"` (p. ej. `forge://schemas/v4/task`).
   - `"additionalProperties": false` en todo objeto de entidad.
   - Nombres de propiedad en **camelCase**. El mapeo a snake_case de las
     columnas SQLite (`created_at`, `rate_limited_until`, …) es responsabilidad
     de los repositorios de `daemon-core` (SPEC-076), no del contrato.
   - `common.schema.json` define en `$defs`:
     - `forgeId`: string, patrón `^(prj|hrn|tm|rol|tsk|ses|apr)_[0-9A-HJKMNP-TV-Z]{26}$`
       (prefijo de entidad + ULID Crockford). Los genera `IdPort` (SPEC-076).
     - `timestamp`: string con `"format": "date-time"` (ISO 8601 UTC).
     - `absolutePath`: string, `minLength: 1`.
     - `sha`: string, patrón `^[0-9a-f]{7,40}$`.

4. **Contratos por entidad** (mapeo 1:1 con el modelo de datos de SPEC-074;
   `?` = opcional/nullable):

   | Entidad | Campos requeridos | Campos opcionales | Enums |
   |---|---|---|---|
   | `Project` | `id`, `name`, `path` (absolutePath), `createdAt` | `vcsRemote`, `profile`, `lastSeenAt` | — |
   | `Harness` | `id`, `runtime`, `label`, `homeDir`, `priority` (integer ≥ 0), `status`, `createdAt` | `rateLimitedUntil` | `status: active \| rate_limited \| disabled` |
   | `Team` | `id`, `name` | `description` | — |
   | `TeamRole` | `id`, `teamId`, `roleName` | `runtimePref`, `systemPromptRef`, `tierPermissions` | — |
   | `Task` | `id`, `projectId`, `title`, `status`, `createdAt`, `updatedAt` | `teamId`, `specRef`, `worktreePath`, `baseSha` | `status` (ver abajo) |
   | `Session` | `id`, `taskId`, `harnessId`, `status`, `startedAt`, `tokensIn`, `tokensOut` (integers ≥ 0) | `roleName`, `tmuxSession`, `transcriptRef`, `endedAt`, `handoffFrom` (forgeId de session) | `status: starting \| running \| exited \| failed \| orphaned` |
   | `Approval` | `id`, `sessionId`, `kind`, `payload` (object libre) | `resolution`, `resolvedAt` | `kind: tool_use \| plan \| question`; `resolution: allow \| deny \| answer \| timeout` (enums alineados con SPEC-081, dueña del contrato de aprobaciones) |
   | `Event` | `id` (integer ≥ 1, rowid append-only), `ts`, `kind`, `entity`, `entityId` | `payload` (object libre) | `entity: project \| harness \| team \| team_role \| task \| session \| approval`; `kind` con patrón `^[a-z_]+\.[a-z_]+$` (p. ej. `task.created`) |

   - **Enum de `Task.status`** (literal de SPEC-074, orden fijo):
     `backlog | queued | running | needs_input | review | done | failed | orphaned`.
   - `Harness.runtime` es string libre (`minLength: 1`), NO enum: los 19
     runtimes del catálogo evolucionan con cada release del CLI; anclar el
     contrato a esa lista lo rompería en cada alta. La validación contra el
     catálogo vive en el daemon, no en el schema.
   - `TeamRole.tierPermissions`: objeto `{ allow?: string[], deny?: string[] }`
     con `additionalProperties: false` (patrones de herramientas permitidas o
     denegadas por rol).

5. **Generación (`scripts/generate.mjs`, comando `npm run generate`)**, dos
   salidas deterministas:
   - `src/types.gen.ts` con **json-schema-to-typescript** (devDependency):
     una interface/type por entidad (`Project`, `Harness`, `Team`, `TeamRole`,
     `Task`, `Session`, `Approval`, `Event`) más los union types de enums
     (`TaskStatus`, `SessionStatus`, `HarnessStatus`, `ApprovalKind`,
     `ApprovalResolution`, `EventEntity`). Banner `/* GENERADO por
     scripts/generate.mjs — NO EDITAR */`.
   - `src/validators.gen.mjs` con **ajv standalone** (`code: { source: true,
     esm: true }` + `ajv-formats`): una función precompilada por entidad
     (`validateProject`, …, `validateEvent`), cada una `(data: unknown) =>
     boolean` con la propiedad `errors` estándar de ajv. Ningún consumidor
     compila schemas en runtime: se elimina el patrón `createRequire` +
     `ajv.compile()` de `validate.ts`. `ajv` y `ajv-formats` quedan como
     `dependencies` del paquete (helpers de runtime del código standalone);
     son JS puro sin I/O, así que no violan la pureza de `daemon-core`
     (la regla de SPEC-074 prohíbe node:/bun:/sqlite/http, no libs puras).

6. **API pública (`src/index.ts`)** — superficie exacta:

   ```ts
   export type { Project, Harness, Team, TeamRole, Task, Session, Approval, Event,
                 TaskStatus, SessionStatus, HarnessStatus, ApprovalKind,
                 ApprovalResolution, EventEntity } from './types.gen.js';

   export { validateProject, validateHarness, validateTeam, validateTeamRole,
            validateTask, validateSession, validateApproval, validateEvent }
     from './validators.gen.mjs';

   export type EntityName = 'project' | 'harness' | 'team' | 'teamRole'
     | 'task' | 'session' | 'approval' | 'event';

   /** Schemas crudos (JSON importado), para SPEC-076/082 y tooling externo. */
   export const SCHEMAS: Readonly<Record<EntityName, object>>;

   /** Enum de Task.status extraído del schema — única fuente, sin duplicar. */
   export const TASK_STATUSES: readonly TaskStatus[];

   export class SchemaValidationError extends Error {
     readonly entity: EntityName;
     readonly errors: ReadonlyArray<{ instancePath: string; message: string }>;
   }

   /** parse<X>(data): valida y retorna tipado, o lanza SchemaValidationError. */
   export function parseProject(data: unknown): Project;
   export function parseHarness(data: unknown): Harness;
   export function parseTeam(data: unknown): Team;
   export function parseTeamRole(data: unknown): TeamRole;
   export function parseTask(data: unknown): Task;
   export function parseSession(data: unknown): Session;
   export function parseApproval(data: unknown): Approval;
   export function parseEvent(data: unknown): Event;
   ```

7. **Publicación**: `files: ["dist", "schemas", "README.md"]` en
   `package.json`; `exports` con `"."` → `dist/index.js` y
   `"./schemas/*.json"` → `./schemas/*.json` para consumo directo de los JSON.
   `prepublishOnly: "npm run generate && npm run build && npm test"`.

8. **Alcance**: esta spec NO migra `validate.ts` ni `core/schemas/` al nuevo
   paquete, NO crea `daemon-core` (SPEC-076) y NO define migraciones SQL. Solo
   entrega el paquete con contratos, generación, validadores y tests.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Zod como fuente + `zod-to-json-schema` | DX de TS, refinements | Invierte la fuente de verdad: el contrato pasaría a depender de código TS; dependencia runtime nueva en un repo que ya opera ajv; el JSON Schema exportado sale con `anyOf`/refs poco legibles para consumidores externos | SPEC-074 admite Zod solo con exportación a JSON Schema, pero en la práctica la fuente sería código TS — JSON Schema puro cumple el Principio 3 de forma más directa y sin deps nuevas |
| Interfaces TS como fuente + `typescript-json-schema` | Parte de tipos que ya existen (estilo `yaml.ts`) | Es exactamente el patrón que ya causó drift entre `ProjectYaml` y `project.schema.json` (issue #71); generación frágil con genéricos/uniones; contrato sigue anclado a TS | Repite el anti-patrón v3 |
| Solo `.schema.json` + `ajv.compile()` en runtime en cada consumidor | Sin paso de generación | Cada consumidor repite el boilerplate `createRequire`/compile de `validate.ts`; sin tipos TS el dominio queda en `unknown`; costo de compilación en cada arranque del daemon | Sin tipos no hay contrato usable en daemon-core |

## Criterios de aceptación

- [ ] `ls packages/schemas/schemas/*.schema.json | wc -l` → 9 (common + 8 entidades, nombres exactos de la Decisión 2).
- [ ] Test: cada schema declara `$schema` draft-07, `$id` con prefijo `forge://schemas/v4/` y `additionalProperties: false` en el objeto raíz de entidad.
- [ ] Test: el enum de `Task.status` en `task.schema.json` es exactamente `["backlog","queued","running","needs_input","review","done","failed","orphaned"]` y `TASK_STATUSES` exporta esa misma lista.
- [ ] `cd packages/schemas && npm run generate && npm run generate && git diff --exit-code src/` → sin diff (generación determinista e idempotente).
- [ ] `cd packages/schemas && npm run build` → exit 0; existen `dist/index.js` y `dist/index.d.ts`.
- [ ] `grep -rn "ajv.compile\|new Ajv" packages/schemas/src/` → sin resultados (ninguna compilación de schemas en runtime; solo `scripts/generate.mjs` instancia Ajv).
- [ ] Test por entidad (fixture válido → `validateX` true) para las 8 entidades, en `test/schemas.test.mjs` con `node --test`.
- [ ] Test negativos: `validateTask` rechaza `status: "in_progress"`, un objeto sin `projectId` y un objeto con propiedad extra `foo`; `validateSession` rechaza `tokensIn: -1`; `validateProject` rechaza `createdAt: "ayer"` (format date-time); `validateEvent` rechaza `entity: "user"` y `kind: "TaskCreated"`.
- [ ] Test: `parseTask(invalido)` lanza `SchemaValidationError` con `entity === 'task'` y al menos un error con `instancePath`.
- [ ] Test: `SCHEMAS.task` deep-equal al contenido de `schemas/task.schema.json`.
- [ ] `cd packages/schemas && npm test` → verde, sin tmux ni SQLite instalados (Fase 0 de SPEC-074).
- [ ] `cd packages/schemas && npm pack --dry-run` incluye `dist/` y `schemas/*.schema.json`.
- [ ] Ningún archivo fuera de `packages/schemas/` modificado (`git status` limpio en `packages/cli`, `core/`, `docs/` salvo esta spec).

## Riesgos e impacto

| Riesgo | Mitigación |
|---|---|
| Drift entre `.schema.json` y artefactos generados si alguien edita `*.gen.*` a mano | Banner NO EDITAR + criterio de idempotencia (`generate` dos veces → sin diff) ejecutable en CI |
| El modelo de datos de SPEC-074 evoluciona durante Fase 0-2 (columnas nuevas) | Los schemas son la fuente única: el cambio se hace una vez en `schemas/` y `npm run generate` propaga tipos y validadores; SPEC-076 deriva sus migraciones de este contrato |
| `ajv` como dependencia transitiva de daemon-core genera dudas sobre la pureza | Documentado en Decisión 5: la regla de pureza (SPEC-074) prohíbe node:/bun:/sqlite/http; ajv standalone es JS puro sin I/O. La lint rule de SPEC-076 lo verifica |
| Anclar `Harness.runtime` como string libre permite registrar runtimes inexistentes | Deliberado: el catálogo de runtimes es del daemon (dato vivo), no del contrato (dato estático); el daemon valida contra el registry al crear el harness |
| Doble "project schema" (`core/schemas/project.schema.json` vs `schemas/project.schema.json`) confunde | Son contratos distintos ($id distinto, README del paquete lo aclara): config `project.yaml` v2 vs entidad del registro v4. Unificación fuera de alcance |

Impacto en v3.11: ninguno. No se toca `packages/cli`, ni `core/`, ni el flujo
`forge validate`. El paquete es aditivo y no se publica hasta cerrar Fase 0.
