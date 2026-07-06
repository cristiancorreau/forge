# SPEC-077 Registro multi-proyecto + CLI forge projects

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-07-05 | Actualizada: 2026-07-05

Deriva de: SPEC-074 (spec maestro v4), componente "Registro multi-proyecto", Fase 1.
Depende de: SPEC-075 (`packages/schemas`) y SPEC-076 (`packages/daemon-core`: puertos, modelo de datos, migraciones). Esta spec **no redefine** ningún contrato de sus dependencias: los extiende de forma aditiva o los compone.

## Contexto

forge v3.11 es stateless y per-proyecto: cada comando (`init`, `generate`, `port`, …)
se ejecuta dentro de un repo, resuelve `project.yaml` con `findProjectYaml()`
(`packages/cli/src/lib/yaml.ts`) y no deja rastro global. No existe forma de
preguntar "¿qué proyectos forge hay en esta máquina y en qué estado están?".
El único paquete del monorepo hoy es `packages/cli` (Node + tsc, tests con
`node --test`, dispatcher por `switch` en `packages/cli/src/cli.ts`, help
bilingüe vía `t('help.full')` en `lib/i18n.ts`).

v4 (SPEC-074) convierte forge en un plano de control local-first. La Fase 1 es
el primer componente stateful: un **registro multi-proyecto** persistido en
SQLite (`~/.forge/forge.db`, esquema base `001-init.sql` de SPEC-076), operado
por el CLI (`forge projects add|remove|list|scan`), refrescado por un watcher
de `project.yaml` y expuesto por una API HTTP mínima. Criterio de la fase en el
maestro: **3+ proyectos registrados y visibles vía API**.

Restricción arquitectónica heredada del maestro: la lógica de dominio vive en
`daemon-core` (puro, sin imports de `node:`/`bun:`/SQLite/HTTP), toda
integración entra por puertos, y los contratos son neutrales (`schemas`).

## Decisión

1. **Contratos: extensión aditiva de `project.schema.json`** (SPEC-075, JSON
   Schema draft-07 como fuente de verdad — sin Zod). En
   `packages/schemas/schemas/project.schema.json` la entidad `Project` gana dos
   propiedades opcionales:
   - `status`: enum `active | missing | invalid` (default lógico `active`; lo
     aplica el dominio, no el schema).
   - `metadata`: objeto (`additionalProperties: false`) con el subconjunto
     cacheado de `project.yaml`: `{ language?: string; runtimes?: string[];
     frameworks?: string[]; specsDir?: string }`, definido en `$defs` del mismo
     schema como `ProjectMetadata`.
   `npm run generate` propaga tipos (`Project`, `ProjectMetadata`) y
   validadores; no se crea ningún archivo TS de contrato a mano.
   `path` es siempre absoluto, con symlinks resueltos (realpath) y sin slash
   final; la unicidad la garantiza `UNIQUE (projects.path)` que **ya existe**
   en `001-init.sql` (SPEC-076, punto 7).

2. **Dominio en `packages/daemon-core`** — reusa los puertos de SPEC-076 tal
   cual y agrega solo lo aditivo:
   - **`RegistryPort` (SPEC-076) sin cambios**: los casos de uso usan
     `registry.projects` (`Repo<Project> & { byPath }`).
   - **Puerto nuevo** `src/ports/manifest.ts` (no existe en SPEC-076; aditivo):
     ```ts
     export type ManifestResult =
       | { status: 'ok'; manifest: ProjectManifest }
       | { status: 'missing' }
       | { status: 'invalid'; error: string };
     export interface ManifestPort {
       load(path: string): Promise<ManifestResult>;
       scan(roots: string[], maxDepth: number): Promise<string[]>; // rutas con project.yaml
     }
     // ProjectManifest = { name: string; profile?: string; metadata: ProjectMetadata }
     ```
   - **`VcsPort` (SPEC-076): extensión aditiva** — se agrega el método
     `remoteUrl(repoPath: string): Promise<string | null>` a
     `src/ports/vcs.ts`, siguiendo la política de extensión declarada en los
     riesgos de SPEC-076 ("extensión aditiva: métodos nuevos primero"). Las
     firmas existentes (`currentSha`, `createWorktree`, `commitWip`,
     `isDirty`, `removeWorktree`) no cambian; `FakeVcs` se actualiza en el
     mismo PR.
   - **Casos de uso** en `src/usecases/projects.ts`:
     ```ts
     export interface ProjectsDeps {
       registry: RegistryPort; manifests: ManifestPort; vcs: VcsPort;
       clock: ClockPort; ids: IdPort; bus: EventBus;
     }
     export async function addProject(deps, input: { path: string }): Promise<Project>;
     export async function removeProject(deps, input: { ref: string }): Promise<boolean>; // ref = id o path
     export async function listProjects(deps): Promise<Project[]>;
     export async function scanForProjects(deps, input: { roots: string[]; maxDepth?: number }): Promise<ScanCandidate[]>;
     export async function refreshProject(deps, input: { id: string }): Promise<Project | null>;
     ```
     **`addProject` compone `registerProject` (SPEC-076), no lo redefine**:
     primero `registry.projects.byPath(path)`; si el proyecto ya existe,
     delega en `refreshProject` (idempotencia a nivel comando: conserva `id` y
     `createdAt`); si no existe, valida el manifest (`missing`/`invalid` →
     error de dominio tipado `ProjectError('manifest-missing' |
     'manifest-invalid')`) y llama a `registerProject`, cuyo contrato con
     `DuplicateProjectPathError` queda intacto como primitiva.
     `refreshProject` recalcula `metadata`, `status` y `lastSeenAt`.
     `ScanCandidate = { path: string; name: string | null; alreadyRegistered: boolean }`.
     **Eventos igual que SPEC-076**: cada caso de uso persiste
     (`registry.events.append`) **y** publica (`bus.publish`) los eventos
     `project.added` / `project.removed` / `project.updated`.

3. **Adaptadores de infraestructura en `packages/daemon/src/infra/`**
   (`@cristiancorreau/forge-daemon`):
   - `sqlite-registry.ts` — `SqliteRegistry implements RegistryPort` (la
     interfaz agregada de SPEC-076; en esta fase implementa `projects` y
     `events` completos, el resto de repos llega con SPEC-078) sobre
     `node:sqlite` (`DatabaseSync`), sin dependencias nativas de npm; funciona
     en Node >= 22.5 y Bun >= 1.2. Abre `$FORGE_HOME/forge.db` (default
     `~/.forge/forge.db`; `FORGE_HOME` existe para aislar tests) con
     `journal_mode=WAL` y `busy_timeout=5000` para convivencia CLI/daemon.
     Mapea camelCase (contrato) ↔ snake_case (columnas), regla de SPEC-075.
   - `fs-manifest.ts` — `FsManifest implements ManifestPort`: `load` parsea
     `<path>/project.yaml` con `js-yaml` (dependencia propia de
     `packages/daemon`). **Prohibido importar desde `packages/cli`**: la
     dirección de dependencia del monorepo es `cli → daemon`, nunca al revés
     (elimina el riesgo de ciclo). `scan` recorre en anchura hasta `maxDepth`
     (default 3) e ignora `node_modules`, `.git`, `vendor`, `dist`, `build`.
   - `git-vcs.ts` — `GitVcs implements VcsPort`: `remoteUrl` =
     `git -C <path> config --get remote.origin.url`, `null` si falla.
   - `manifest-watcher.ts` — `startManifestWatcher(deps, registry)`:
     `fs.watch` sobre el directorio de cada `project.yaml` registrado,
     debounce 300 ms, en cada cambio invoca `refreshProject`. Detecta
     alta/baja de proyectos suscribiéndose a `project.added` /
     `project.removed` en el `EventBus`.

4. **Migración `packages/daemon-core/migrations/002-projects-metadata.sql`** —
   misma carpeta, dueño y convención `NNN-nombre.sql` que `001-init.sql`
   (SPEC-076 es dueño del DDL; esta spec solo agrega la segunda migración):
   `ALTER TABLE projects ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';`
   y `ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
   CHECK (status IN ('active','missing','invalid'))`. No crea índice de
   `path`: el `UNIQUE (projects.path)` ya viene de `001-init.sql`.
   `scripts/build-migrations.mjs` (SPEC-076) la inlinea automáticamente.

5. **API HTTP mínima en `packages/daemon`** (Hono; la superficie completa y
   sus reglas — bind, token, errores — las fija SPEC-082 y esta spec las
   adopta): subcomando `forged serve [--port N]` (solo foreground en esta
   fase; el ciclo de vida start/stop/status llega en SPEC-078). Bind exclusivo
   `127.0.0.1`, puerto default `41414` (el de SPEC-082; override `--port` o
   `FORGE_DAEMON_PORT`). Al arrancar escribe `~/.forge/daemon.json` (modo
   0600) con `{ pid, port, token, startedAt }` — mismo archivo y shape que
   SPEC-078/082. Rutas en `packages/daemon/src/api/projects.ts`, bajo
   `/api/v1` (prefijo de SPEC-082), todas con `Authorization: Bearer <token>`
   (401 si falta o no coincide):
   - `GET /api/v1/projects` → `{ projects: Project[] }`
   - `GET /api/v1/projects/:id` → `Project` | 404
   - `POST /api/v1/projects` body `{ path }` → 201 | 422 (manifest inválido/ausente)
   - `DELETE /api/v1/projects/:id` → 204 | 404
   `forged serve` también arranca el watcher del punto 3.

6. **Comando CLI `packages/cli/src/commands/projects.ts`** exportando
   `projects(args: string[]): Promise<number>`, registrado en el `switch` de
   `packages/cli/src/cli.ts` (`case 'projects'`) y en el help ES+EN de
   `lib/i18n.ts` (la prueba `i18n-parity` obliga a ambos). El CLI opera la DB
   directamente (adaptadores del punto 3 vía dependencia workspace a
   `@cristiancorreau/forge-daemon`), sin requerir daemon corriendo —
   local-first. Subcomandos:
   - `forge projects add [path]` — default `process.cwd()`; exit 1 si no hay
     `project.yaml` en la ruta.
   - `forge projects remove <path|id>` — exit 1 si la referencia no existe.
   - `forge projects list [--json]` — tabla con name, path, status, runtimes;
     `--json` emite `Project[]` estable.
   - `forge projects scan <root...> [--depth N] [--yes] [--json]` — lista
     candidatos y pide confirmación para registrarlos; `--yes` registra todos
     sin prompt; marca los ya registrados.
   - `-h/--help` por subcomando, mismo patrón que `commands/port.ts`.
   Los npm workspaces en la raíz son entregable de Fase 0 (SPEC-076, punto 1);
   esta spec los asume.

7. **Regla hexagonal**: sin cambios — la verifica `test/purity.test.mjs` de
   SPEC-076 (punto 9), que ya cubre los archivos nuevos de esta spec por
   recorrer `src/**/*.ts` completo.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Registro en JSON plano `~/.forge/projects.json` | Cero dependencias, trivial de inspeccionar | No escala al modelo de datos de fases 2+ (tasks, sessions, events comparten la misma DB); migrar después duplica trabajo | El maestro fija SQLite única con migraciones; adoptarla desde Fase 1 evita una migración de formato |
| CLI habla solo vía API del daemon (daemon obligatorio) | Un único escritor de la DB, sin concurrencia | `forge projects list` fallaría sin `forged` corriendo; rompe el principio local-first y complica CI | Acceso directo a la DB con WAL + busy_timeout resuelve la concurrencia con menos fricción |
| Watcher con chokidar | API más ergonómica, madurez cross-platform | Dependencia extra con binarios opcionales; el caso de uso es N archivos puntuales, no árboles enteros | `fs.watch` nativo alcanza para archivos conocidos; revisable si aparecen problemas reales en macOS/Linux |
| `better-sqlite3` como driver | API síncrona probada | Dependencia nativa (node-gyp, prebuilds por plataforma); rompe la meta de binario único con `bun build --compile` | `node:sqlite` es builtin en Node >= 22.5 y Bun >= 1.2; cero deps nativas |
| `addProject` como upsert que reemplaza a `registerProject` | Una sola función | Redefiniría el contrato APPROVED de SPEC-076 (`DuplicateProjectPathError`) y rompería sus tests | Composición: `addProject` = byPath → refresh o `registerProject`; ambos contratos conviven |

## Criterios de aceptación

- [ ] `packages/schemas/schemas/project.schema.json` incluye `status` (enum `active|missing|invalid`) y `metadata` (`$defs/ProjectMetadata`, `additionalProperties: false`); `npm run generate` en `packages/schemas` es idempotente y `validateProject` acepta un fixture con `metadata` y rechaza `status: "gone"`.
- [ ] `forge projects add` en un directorio con `project.yaml` → exit 0 y fila visible con `sqlite3 ~/.forge/forge.db "SELECT name, path, status FROM projects"`; repetir el mismo `add` no duplica filas (mismo `id`, mismo `created_at`).
- [ ] `forge projects add` en un directorio sin `project.yaml` → exit 1 y mensaje en stderr; la DB no cambia.
- [ ] `forge projects list --json` emite un array que valida contra `project.schema.json`; `list` refleja `status: missing` si la ruta registrada ya no existe.
- [ ] `forge projects remove <path>` y `forge projects remove <id>` eliminan el registro; referencia inexistente → exit 1.
- [ ] `forge projects scan <root> --yes` registra todos los candidatos, ignora `node_modules`/`.git`/`vendor`/`dist`/`build` y respeta `--depth` (fixture de directorios anidados en test).
- [ ] Con `forged serve` corriendo, editar el `name` en el `project.yaml` de un proyecto registrado actualiza `metadata_json` y `last_seen_at` en la DB en < 2 s (test de watcher con archivo temporal).
- [ ] Criterio de Fase 1 del maestro: con 3 proyectos registrados, `curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:41414/api/v1/projects` devuelve los 3; sin header → 401; el socket solo escucha en 127.0.0.1 (verificable con `lsof -iTCP -sTCP:LISTEN`).
- [ ] `POST /api/v1/projects` con ruta sin manifest → 422; `DELETE /api/v1/projects/:id` inexistente → 404.
- [ ] Tests de dominio `packages/daemon-core/test/projects.test.mjs` en verde usando solo los fakes de SPEC-076 (sin SQLite, filesystem ni red): `addProject` idempotente por composición (segunda llamada no duplica y conserva `createdAt`), `registerProject` directo sigue lanzando `DuplicateProjectPathError`, add con manifest missing/invalid, remove por id y por path, scan con candidatos ya registrados, refresh que degrada a `missing`/`invalid` — verificando eventos persistidos en `registry.events` y publicados en el bus.
- [ ] `test/purity.test.mjs` (SPEC-076) sigue en verde con los archivos nuevos (`ports/manifest.ts`, `usecases/projects.ts`, extensión de `ports/vcs.ts`).
- [ ] Tests de infraestructura nuevos en verde: `packages/daemon/test/sqlite-registry.test.mjs` (contra DB temporal vía `FORGE_HOME`), `packages/daemon/test/api-projects.test.mjs` (forged en puerto efímero, auth, CRUD).
- [ ] `grep -rn "packages/cli" packages/daemon/src` → sin resultados (dirección de dependencia cli → daemon, nunca al revés).
- [ ] Test CLI `packages/cli/test/projects.test.mjs` agregado al script `test` de `packages/cli/package.json` y en verde; la suite completa existente sigue verde.
- [ ] `forge --help` muestra `projects` en ES y EN; `i18n-parity.test.mjs` en verde.
- [ ] `002-projects-metadata.sql` aplica limpio sobre una DB recién migrada con `001-init.sql`; `test/migrations.test.mjs` (SPEC-076) sigue en verde con la migración inlineada.

## Riesgos e impacto

| Riesgo | Mitigación |
|--------|------------|
| Escritores concurrentes (CLI + daemon) sobre `forge.db` | WAL + `busy_timeout=5000` en ambos adaptadores; transacciones cortas; el watcher solo hace refresh idempotentes |
| `node:sqlite` requiere Node >= 22.5 | Declarar `engines.node >= 22.5` en los paquetes nuevos; `forge doctor` puede avisar; el CLI v3 existente no cambia sus requisitos hasta integrar la dependencia |
| `fs.watch` inconsistente entre plataformas (rename, editores que escriben con tmp+rename) | Observar el directorio contenedor, no el archivo; debounce 300 ms; `refreshProject` es idempotente, un evento de más no corrompe estado |
| Parser YAML duplicado (js-yaml en daemon, parser propio en cli) | Deliberado: evita el ciclo cli↔daemon; ambos consumen el mismo `project.yaml` y el contrato lo fija `core/schemas/project.schema.json`; unificación en un helper compartido queda para cuando exista un tercer consumidor |
| Proyectos movidos o borrados dejan filas huérfanas | `status: missing` visible en `list` y en la API; no se borra automáticamente — decisión explícita del usuario con `remove` |
| Token en `~/.forge/daemon.json` legible por otros procesos del usuario | Modo 0600, token rotado en cada lanzamiento, bind solo loopback; el modelo de amenaza local-first del maestro no cubre procesos maliciosos del mismo usuario |

Impacto en v3.x: nulo para los comandos existentes; `projects` es aditivo, no
toca generadores ni `project.yaml`. Sin red externa, sin LLM, sin telemetría.
