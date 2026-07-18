# SPEC-081 Aprobaciones fuera de la terminal (hooks PreToolUse + servidor MCP)

> Estado: APPROVED — DIVIDIDA (2026-07-18)
> Responsable: forge maintainers
> Creada: 2026-07-05 | Actualizada: 2026-07-05
> Deriva de: SPEC-074 (spec maestro v4), componente "Aprobaciones fuera de la terminal" — Fase 3
> Depende de: SPEC-075 (schemas), SPEC-076 (daemon-core), SPEC-078 (daemon). La UI que renderiza las cards es de SPEC-082; esta spec define el contrato completo que esa UI consume.

> **Replanteo 2026-07-18 — split forge ↔ mingako**: forge es dueño del instalador (hook pre-approval-gate.cjs fail-open, hooks-registry.yaml, clave approvals.enabled en project.yaml, supervivencia a forge generate); el circuito de aprobación (endpoint del daemon, packages/mcp con ask_user, UI, resolución) pasa a mingako. El contrato ApprovalRequest/Resolution y el shape de ~/.forge/daemon.json son compartidos vía schemas. Ver `docs/analysis/forge-mingako-replanteo-2026-07.md` y SPEC-083.

## Contexto

Hoy (v3.11) las decisiones de permiso viven atrapadas en la terminal donde
corre el runtime. Forge ya tiene tres piezas que esta spec extiende, no
reemplaza:

1. **Hooks PreToolUse en JS puro** (`core/hooks/pre-bash-check.js`,
   `pre-edit-check.js`): leen el payload por stdin, deciden localmente y
   comunican con exit code (0 = permitir/advertir, 2 = bloquear). Son
   guardrails *automáticos*: no pueden preguntarle a un humano. Si el agente
   corre en una sesión tmux gestionada por el daemon (SPEC-078), un prompt de
   permiso de Claude Code deja la tarea colgada hasta que alguien abra esa
   terminal.
2. **Instalación de hooks vía registry**: `core/hooks/hooks-registry.yaml` +
   `forge init/adopt` (`installHooks` + `buildSettings` en
   `packages/cli/src/commands/init.ts`, línea ~329) generan la sección `hooks`
   de `.claude/settings.json`. Nota clave: `mergeSettings` documenta que
   "forge gestiona `hooks` por completo" y **reemplaza** esa key en cada
   regeneración — cualquier hook de aprobación instalado por fuera del
   registry se perdería en el próximo `forge generate`.
3. **Un MCP server mínimo en la CLI** (`forge mcp`, `packages/cli/src/commands/mcp.ts`
   + `lib/mcp-tools.ts`): stdio, SDK cargado lazy, allowlist de dos tools
   read-only. Ese diseño ("golden rule": MCP estrictamente aditivo, nada
   escribe) es correcto para la CLI stateless y **no** se toca: las
   aprobaciones son stateful y viven en el paquete nuevo `packages/mcp` del
   monorepo v4.

Falta el circuito completo: hook o tool → POST al daemon → card en el
navegador → resolución humana → respuesta al runtime. Eso es esta spec.

## Decisión

### 1. Contratos neutrales en `packages/schemas`

JSON Schema draft-07 como fuente de verdad (regla de SPEC-075 — sin Zod):
`packages/schemas/schemas/approval-request.schema.json`,
`approval-card.schema.json` y `approval-resolution.schema.json`, con tipos y
validadores generados por `npm run generate` (`types.gen.ts` /
`validators.gen.mjs`). Los enums de `approval.schema.json` (entidad de la DB,
SPEC-075) ya están alineados a este contrato. Tipos resultantes:

```ts
export type ApprovalKind = 'tool_use' | 'plan' | 'question';

export interface ApprovalRequest {
  id: string;                 // IdPort
  sessionId: string;          // FK sessions.id
  kind: ApprovalKind;
  tool: string;               // 'Bash' | 'Edit' | 'ExitPlanMode' | 'AskUserQuestion' | 'ask_user' | ...
  card: ApprovalCard;         // lo que la UI renderiza, ver §5
  payload: unknown;           // tool_input crudo (auditoría)
  timeoutMs: number;
  createdAt: string;          // ISO-8601
}

export interface ApprovalResolution {
  decision: 'allow' | 'deny' | 'answer' | 'timeout';
  answer?: { optionIds?: string[]; text?: string };  // para kind question/plan
  alwaysForTask?: boolean;    // "permitir siempre para esta tarea"
  resolvedBy: 'user' | 'rule' | 'timeout';
  resolvedAt: string;
}
```

`decision: 'timeout'` mapea siempre a denegar en el lado del runtime; se
conserva distinto de `deny` para auditoría.

### 2. Dominio en `packages/daemon-core` (puro, sin I/O)

- **Puerto** `packages/daemon-core/src/ports/approval.ts` — esta interfaz
  **supersede** la versión mínima de Fase 0 de SPEC-076
  (`request/resolve/onRequest`, ya anotado allí): al implementar esta spec se
  reemplaza la firma y sus fakes en el mismo PR, según la política de
  extensión de puertos de SPEC-076:

```ts
export interface ApprovalPort {
  insert(req: ApprovalRequest): Promise<void>;
  resolve(id: string, res: ApprovalResolution): Promise<ApprovalRequest & { resolution: ApprovalResolution }>;
  get(id: string): Promise<StoredApproval | null>;
  listPending(sessionId?: string): Promise<StoredApproval[]>;
  insertRule(rule: ApprovalRule): Promise<void>;
  matchRule(taskId: string, tool: string, payloadDigest: string): Promise<ApprovalRule | null>;
}
```

- **Caso de uso** `packages/daemon-core/src/usecases/request-approval.ts`:
  `requestApproval(deps, input) → Promise<ApprovalResolution>`. Flujo:
  (1) si `matchRule` encuentra una regla "always" para la tarea, resuelve
  `allow` con `resolvedBy: 'rule'` sin crear card; (2) si no, persiste vía
  `ApprovalPort`, emite `approval.created` por `EventBus` y espera la
  resolución; (3) al vencer `timeoutMs` (medido con `ClockPort`, testeable con
  fake) resuelve `{decision: 'timeout', resolvedBy: 'timeout'}` y emite
  `approval.resolved`. **Default: denegar.**
- **Caso de uso** `resolve-approval.ts`: valida que esté pendiente (resolver
  dos veces → error de dominio `ApprovalAlreadyResolved`), y si
  `alwaysForTask === true` inserta la regla `(taskId, tool, patternDigest)`.
- Regla hexagonal: ningún archivo de `daemon-core` importa `node:*`, `bun:*`,
  HTTP ni SQLite. Fakes en memoria en `packages/daemon-core/test/fakes/`.

### 3. Persistencia y API del daemon (`packages/daemon`)

- Tabla `approvals` ya definida en SPEC-076
  (`approvals(id, session_id, kind, payload_json, resolution, resolved_at)`);
  esta spec agrega la migración
  `packages/daemon-core/migrations/004-approval-rules.sql` (convención y
  carpeta de SPEC-076; tomar el siguiente número libre al implementar):
  `approval_rules(id, task_id, tool, pattern_digest, created_at)` con índice
  único `(task_id, tool, pattern_digest)`.
- Rutas Hono (mismo bind 127.0.0.1 + bearer token del maestro):
  - `POST /api/v1/approvals` → 201 `{id}`. Body: `ApprovalRequest` sin `id`/`createdAt`.
  - `GET  /api/v1/approvals?status=pending[&sessionId=]` → lista para la UI.
  - `GET  /api/v1/approvals/:id/wait?timeoutMs=` → long-poll; responde la
    `ApprovalResolution` al resolverse o `{decision:'timeout',...}` al vencer.
  - `POST /api/v1/approvals/:id/resolve` → body `ApprovalResolution` parcial
    (decision, answer, alwaysForTask); 409 si ya estaba resuelta.
- Eventos `approval.created` / `approval.resolved` salen por el WebSocket de
  eventos (SPEC-082) y se registran en la tabla `events`.

### 4. Hook `pre-approval-gate.cjs` + instalador por proyecto

- **Archivo** `core/hooks/pre-approval-gate.cjs` (JS puro, cero dependencias,
  mismo estilo que `pre-bash-check.js`). Comportamiento:
  1. Lee stdin JSON (`tool_name`, `tool_input`, `session_id`).
  2. Descubre el daemon leyendo `~/.forge/daemon.json` — el archivo global
     `{pid, port, token, startedAt}` que ya escriben SPEC-078/082 al arrancar
     `forged` (url = `http://127.0.0.1:<port>`); no existe archivo de discovery
     per-proyecto. Fallback: `FORGE_DAEMON_URL` / `FORGE_DAEMON_TOKEN`.
  3. `POST /api/v1/approvals` y long-poll `GET /api/v1/approvals/:id/wait`.
  4. Responde con el JSON estructurado de PreToolUse de Claude Code:
     `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"|"deny","permissionDecisionReason":"..."}}`
     y exit 0. Para `ExitPlanMode`/`AskUserQuestion`, la respuesta humana viaja
     en `permissionDecisionReason` (deny con la respuesta) para que el agente
     la incorpore.
  5. **Fail-open explícito**: si `daemon.json` no existe, el daemon no responde
     o responde ≠2xx en <2s, exit 0 sin output — el flujo de permisos normal de
     la terminal sigue funcionando y el hook nunca rompe un proyecto sin
     daemon. El fail-open se loguea a stderr solo con `DEBUG`.
- **Registro en el registry, no a mano**: `core/hooks/hooks-registry.yaml`
  gana la sección `approvals:` con la entrada
  `{hook: pre-approval-gate.cjs, event: PreToolUse, matcher: "Bash|Edit|Write|ExitPlanMode|AskUserQuestion"}`.
  `buildSettings` (init.ts) la incluye **solo** si `project.yaml` declara
  `approvals.enabled: true`. Así el hook sobrevive a `forge generate`
  (recordar: `mergeSettings` reemplaza `hooks` por completo).
- **Comando** `forge approvals <install|uninstall|status>` en
  `packages/cli/src/commands/approvals.ts`, registrado en `cli.ts` y en el
  help ES+EN (patrón de `forge port`, SPEC-073). `install` setea
  `approvals.enabled: true`, copia el hook a `.claude/hooks/` y regenera
  settings por el code path existente; `status` reporta hook instalado,
  daemon alcanzable y timeout efectivo.
- **Timeout configurable**: `project.yaml` → `approvals.timeout_seconds`
  (default 300). El hook lo manda como `timeoutMs`; el daemon lo acota a un
  máximo de 3600.

### 5. Servidor MCP `packages/mcp` y cards estructuradas

- Paquete nuevo `packages/mcp` (`@cristiancorreau/forge-mcp`, bin `forge-approvals-mcp`),
  stdio, con `@modelcontextprotocol/sdk` como dependencia **real** (a
  diferencia del lazy-load de `forge mcp`, que no se modifica). Entry
  `packages/mcp/src/server.ts`; lógica pura separada en
  `packages/mcp/src/lib/ask-user.ts` para testear sin SDK.
- **Tool única** `ask_user`:

```ts
ask_user(input: {
  question: string;
  kind: 'radio' | 'checkbox' | 'text';
  options?: { id: string; label: string }[];   // requerido si kind != 'text'
  timeout_s?: number;
}) → { answered: boolean; optionIds?: string[]; text?: string }
```

  Crea un approval `kind: 'question'` vía `POST /api/v1/approvals` (misma
  discovery `daemon.json`/env que el hook) y espera con long-poll. Timeout →
  `{answered: false}`.
- **`ApprovalCard`** (en `packages/schemas/src/approval.ts`) es el contrato de
  render de la UI:

```ts
export interface ApprovalCard {
  title: string;                       // "Bash quiere ejecutar…"
  body: string;                        // markdown: comando, diff, plan
  control: 'confirm' | 'radio' | 'checkbox' | 'text';
  options?: { id: string; label: string }[];
  offerAlwaysForTask: boolean;         // muestra el checkbox "permitir siempre para esta tarea"
}
```

  `tool_use` genera `control:'confirm'` + `offerAlwaysForTask:true`;
  `ExitPlanMode` genera `control:'confirm'` con el plan en `body`;
  `AskUserQuestion` y `ask_user` mapean `kind` → `radio`/`checkbox`/`text` y
  `offerAlwaysForTask:false`. La construcción de la card es una función pura
  `buildApprovalCard(toolName, toolInput)` en
  `packages/daemon-core/src/usecases/build-card.ts`.

### 6. "Permitir siempre para esta tarea"

Resolución con `alwaysForTask: true` inserta en `approval_rules` el digest del
patrón (`tool` + hash estable del comando normalizado / path). El auto-allow
ocurre en el **dominio** (`requestApproval`, paso 1), nunca en el hook: el
hook siempre pregunta al daemon y el daemon contesta al instante si hay regla.
Las reglas mueren con la tarea (FK a `tasks.id`); no hay "always" global en
esta spec.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Extender `forge mcp` (CLI) con `ask_user` en vez de crear `packages/mcp` | Un solo server MCP | Rompe la golden rule del allowlist read-only de RFC-003; acopla la CLI stateless al daemon | El maestro ya separa `packages/mcp`; la CLI queda intacta |
| Solo MCP, sin hook PreToolUse | Menos piezas | El agente decide cuándo preguntar; un `rm -rf` por Bash jamás pasaría por la tool. Sin intercepción no hay control plane | El hook es la única captura involuntaria y cubre ExitPlanMode/AskUserQuestion |
| Fail-closed cuando el daemon no responde (exit 2) | Más seguro en apariencia | Deja inutilizable todo proyecto con `approvals.enabled` al apagar el daemon; los guardrails locales (pre-bash/pre-edit) ya cubren lo destructivo | Fail-open + guardrails existentes es el balance correcto |
| Reglas "always" evaluadas en el hook (cache local) | Ahorra un round-trip | Duplica estado fuera de SQLite; invalidación frágil; el hook deja de ser tonto | Toda decisión vive en el dominio (hexagonal) |

## Criterios de aceptación

- [ ] `packages/schemas` exporta `ApprovalRequest`, `ApprovalResolution` y
      `ApprovalCard` con JSON Schema generado; test de snapshot del schema en
      `packages/schemas/test/approval.test.mjs`.
- [ ] `requestApproval` con fakes en memoria: (a) sin regla crea el approval y
      emite `approval.created`; (b) con regla resuelve `allow`/`rule` sin card;
      (c) al avanzar el `ClockPort` fake más allá de `timeoutMs` resuelve
      `timeout` (denegar) y emite `approval.resolved`. Test:
      `packages/daemon-core/test/request-approval.test.mjs`, corre sin SQLite
      ni red (`node --test`).
- [ ] `resolveApproval` sobre un approval ya resuelto lanza
      `ApprovalAlreadyResolved`; con `alwaysForTask: true` inserta la regla y
      un segundo `requestApproval` idéntico auto-resuelve. Mismo archivo de test.
- [ ] `grep -rE "from 'node:|from 'bun:|sqlite|http" packages/daemon-core/src`
      no devuelve resultados (regla hexagonal del maestro).
- [ ] Migración `approval_rules` numerada, aplicable sobre SQLite vacía, con
      índice único `(task_id, tool, pattern_digest)`.
- [ ] `core/hooks/pre-approval-gate.cjs` existe, sin `require` de paquetes
      externos, y ante stdin con `tool_name: 'Bash'` y un daemon fake HTTP en
      puerto efímero que responde `allow`, imprime el JSON con
      `permissionDecision: "allow"` y sale 0. Test:
      `packages/cli/test/hook-approval-gate.test.mjs` (patrón de
      `hook-guardrail.test.mjs`).
- [ ] Mismo test: sin `daemon.json` ni env vars el hook sale 0 sin output
      (fail-open); con daemon que responde `deny`, imprime
      `permissionDecision: "deny"` y sale 0.
- [ ] `forge approvals install` en un proyecto con `project.yaml`: setea
      `approvals.enabled: true`, copia el hook y `.claude/settings.json` queda
      con la entrada PreToolUse de matcher
      `Bash|Edit|Write|ExitPlanMode|AskUserQuestion`; un `forge generate`
      posterior **la preserva**. Test: `packages/cli/test/approvals-install.test.mjs`.
- [ ] Con `approvals.enabled` ausente o `false`, `buildSettings` no
      registra el hook (verificado en el mismo test).
- [ ] `forge approvals status` reporta hook/daemon/timeout; exit 1 fuera de un
      proyecto forge.
- [ ] `packages/mcp`: `buildAskUserRequest()` puro mapea `kind` →
      `ApprovalCard.control` correcto y valida `options` requerido para
      radio/checkbox. Test: `packages/mcp/test/ask-user.test.mjs`.
- [ ] Rutas del daemon: `POST /api/v1/approvals` sin bearer token → 401; `resolve`
      dos veces → 409; `wait` devuelve la resolución publicada por `resolve`
      concurrente. Test de integración: `packages/daemon/test/approvals-api.test.mjs`.
- [ ] Timeout configurable: `approvals.timeout_seconds: 5` en `project.yaml`
      llega como `timeoutMs: 5000` en el POST del hook (visible en el daemon
      fake del test del hook).
- [ ] Suite completa verde (`node --test` por paquete) y help ES+EN de
      `forge approvals` presente (test de paridad `i18n-parity.test.mjs`).

## Riesgos e impacto

| Riesgo | Mitigación |
|--------|------------|
| Claude Code cambia el formato `hookSpecificOutput` de PreToolUse | Único punto de emisión en `pre-approval-gate.cjs`; test de contrato con el JSON exacto; documentar versión mínima soportada |
| Fail-open percibido como agujero de seguridad | Los guardrails locales (`pre-bash-check`, `pre-edit-check`) siguen activos e independientes; el approval gate agrega supervisión humana, no la reemplaza. `forge approvals status` hace visible el estado |
| Long-poll colgado si el daemon muere a mitad de espera | Timeout duro en el cliente HTTP del hook = `timeoutMs + 5s`; al vencer, mismo camino fail-open |
| Digest de "always" demasiado laxo (allow de más) o estricto (cards repetidas) | Digest por herramienta: Bash normaliza espacios y hace hash del comando completo (no por prefijo); Edit/Write usan el path. Empezar estricto; relajar con datos |
| Regeneración de settings pisa el hook | Resuelto por diseño: el hook entra por `hooks-registry.yaml` + flag en `project.yaml`, nunca por edición manual de settings |
| Doble server MCP (CLI `forge mcp` + `packages/mcp`) confunde a usuarios | Nombres distintos (`forge` vs `forge-approvals-mcp`), docs cruzadas; la CLI no cambia su allowlist |

Impacto en compliance: el hook y la tool solo hablan con 127.0.0.1 (daemon
local, bearer token). Sin red externa, sin LLM, sin telemetría.
