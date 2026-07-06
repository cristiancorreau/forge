# SPEC-082 API HTTP/WS (Hono sobre Bun) + UI web (Vite+React)

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-07-05 | Actualizada: 2026-07-05

## Contexto

Deriva de SPEC-074 (spec maestro v4), componente "API y UI web" y Fase 3.
Depende de SPEC-075 (`packages/schemas`), SPEC-076 (`packages/daemon-core`),
SPEC-077 (registro de proyectos) y SPEC-078 (daemon + sesiones tmux).
SPEC-081 (aprobaciones) define el contrato de aprobaciones que esta superficie
expone.

Forge v3.11 ya tiene dos superficies GUI: el webview de VS Code
(`vscode-extension/media/`) y la app Electron (`desktop/renderer/`), ambas con
el mismo sistema visual "ember" (tokens CSS duplicados a mano: `--ember:
#ff9f1c`, `--bg: #0e0e12`, `--panel: #1d1d27`, `--text: #e8e8f0`, misma
tipografía y spacing). Pero ambas son wizards de configuración per-proyecto:
hablan con el CLI por IPC/child_process, no con un daemon, y no pueden
observar ni operar sesiones de agentes en vivo.

El plano de control v4 introduce `forged` con dominio puro en
`packages/daemon-core` y puertos hacia tmux, SQLite y git (SPEC-076/078).
Falta la capa que lo expone: una API HTTP/WS local-first y una UI web que
permita operar una tarea completa —crear, lanzar, observar transcript y
terminal, aprobar herramientas, cerrar— sin tocar la terminal del sistema
(criterio de cierre de Fase 3 del maestro).

Restricciones heredadas de SPEC-074: REST para CRUD, WebSocket para eventos y
terminales con SSE como fallback; bind exclusivo en 127.0.0.1; token bearer
por lanzamiento inyectado en la UI; CORS cerrado; ninguna lógica de negocio en
el frontend; acceso remoto fuera de alcance (se documenta Tailscale/VPN).
NFRs: 20 proyectos y 10 sesiones concurrentes sin degradación perceptible,
eco de terminal < 50 ms en localhost, recuperación de `kill -9` sin estado
corrupto.

## Decisión

### API HTTP/WS (`packages/daemon`)

1. **App Hono como adapter fino.** `packages/daemon/src/api/app.ts` exporta
   `createApp(deps: ApiDeps): Hono`, donde
   `interface ApiDeps { core: DaemonCore; token: string; events: EventBus; ui?: UiAssets }`,
   `DaemonCore` es la fachada de casos de uso de `daemon-core` (SPEC-076) y
   `EventBus` es el puerto homónimo de SPEC-076. Los handlers solo validan
   entrada con los validadores generados de `@cristiancorreau/forge-schemas`
   (SPEC-075), llaman a un caso de uso y serializan la salida. Prohibido
   importar `bun:sqlite`, tmux o git en `packages/daemon/src/api/**` (misma
   regla de lint que protege a `daemon-core`).
2. **Arranque y bind.** `packages/daemon/src/server.ts` exporta
   `startServer(opts: { port?: number }): Promise<ServerHandle>` que llama a
   `Bun.serve({ hostname: "127.0.0.1", port })`. Puerto por defecto `41414`
   (el que ya fijan SPEC-077/078); si está ocupado, escanea `41415..41424`.
   No existe opción de hostname: `0.0.0.0` es inexpresable por construcción.
3. **Token por lanzamiento.** `packages/daemon/src/api/auth.ts` exporta
   `generateToken(): string` (32 bytes de `crypto.getRandomValues`, hex) y el
   middleware `bearerAuth(token: string)`. El ciclo de vida del archivo de
   descubrimiento es de SPEC-078: `~/.forge/daemon.json` (modo `0600`) con
   `{ port, token, pid, version, startedAt }`, regenerado en cada arranque.
   Toda ruta `/api/*` y `/ws/*` exige `Authorization: Bearer <token>`; única
   excepción: `GET /api/v1/health` (responde `{ status, version }`, sin datos
   sensibles). Sin token o token inválido → `401` con el contrato del punto 6.
4. **CORS cerrado e inyección del token en la UI.** No se registra middleware
   CORS ni se emite ningún header `Access-Control-Allow-*`: la UI se sirve
   desde el mismo origen. El daemon sirve los estáticos de
   `packages/web/dist` y, al servir `index.html`, reemplaza el marcador
   `<!--__FORGE_BOOTSTRAP__-->` por
   `<script>window.__FORGE__={token:"…",apiBase:"/api/v1",wsBase:"/ws"}</script>`
   (`packages/daemon/src/api/ui.ts`, función
   `renderIndexHtml(html: string, boot: UiBootstrap): string`). El token nunca
   viaja en query strings.
5. **Rutas REST v1** (todas bajo `/api/v1`, JSON, tipos de
   `@cristiancorreau/forge-schemas`). Esta spec es dueña del prefijo, la auth
   y el contrato de error; las rutas ya definidas en specs hermanas se adoptan
   sin renombrar:

   | Método y ruta | Caso de uso | Dueña |
   |---|---|---|
   | `GET /health` | estado + versión (sin auth) | esta spec |
   | `GET /projects` · `POST /projects` · `GET /projects/:id` · `DELETE /projects/:id` | RegistryPort | SPEC-077 |
   | `GET /tasks?projectId=&status=` · `POST /tasks` · `PATCH /tasks/:id` | CRUD de tareas; `PATCH` solo acepta transiciones válidas del dominio (`backlog→queued→running→…`), inválidas → `409` | esta spec |
   | `POST /tasks/:id/start` · `POST /tasks/:id/stop` | lanzar/detener la sesión de la tarea (usa los casos de uso de sesión de SPEC-078) | esta spec |
   | `POST /sessions` · `GET /sessions/:id` · `POST /sessions/:id/prompt` · `DELETE /sessions/:id` · `GET /sessions/:id/events` (SSE de `AgentEvent`) | sesiones | SPEC-078 |
   | `GET /sessions?taskId=` · `GET /sessions/:id/transcript?after=` | listado y transcript paginado por offset de evento | esta spec |
   | `GET /harnesses` · `PATCH /harnesses/:id` | prioridad/estado; consumo de tokens en la respuesta de `GET` | esta spec (modelo en SPEC-079) |
   | `POST /approvals` · `GET /approvals?status=pending` · `GET /approvals/:id/wait` · `POST /approvals/:id/resolve` | aprobaciones (`ApprovalResolution` parcial en el body de resolve) | SPEC-081 |
   | `GET /vault/notes?q=` · `GET /vault/notes/*path` · `PUT /vault/notes/*path` | MemoryPort | SPEC-080 |
   | `GET /events?since=<eventId>&limit=` | replay del log append-only `events` | esta spec |
   | `GET /config` · `PUT /config` | config del daemon (políticas de failover, timeouts de aprobación) | esta spec |

6. **Contrato de errores.** Toda respuesta no-2xx es
   `{ error: { code: string, message: string } }` con `code` del enum
   `ApiErrorCode` agregado a `@cristiancorreau/forge-schemas`
   (`unauthorized`, `not_found`, `invalid_transition`, `validation_failed`,
   `conflict`, `unprocessable`, `internal`). Nunca se serializa `stack` ni el
   `message` de excepciones internas (throw no controlado →
   `{error:{code:"internal",message:"internal error"}}`).
7. **WebSocket.** Dos endpoints sobre el upgrade nativo de Bun
   (`packages/daemon/src/api/ws.ts`):
   - `GET /ws/events` — broadcast de eventos del dominio. La clase
     `WsEventBridge implements EventBus` (puerto de SPEC-076) re-emite cada
     evento como frame JSON `{ id, ts, kind, entity, entityId, payload }`
     (mismo shape que la entidad `Event` de SPEC-075).
   - `GET /ws/terminal/:sessionId` — passthrough binario bidireccional al
     pty-bridge de SPEC-078 (node-pty + `tmux attach-session`). Frames de
     entrada: bytes crudos al pty; frame de control JSON
     `{ type: "resize", cols, rows }`.
   La autenticación del upgrade usa el subprotocolo
   `Sec-WebSocket-Protocol: forge.bearer.<token>` (el token no aparece en la
   URL). Upgrade sin subprotocolo válido → `401` antes del handshake.
8. **Fallback SSE.** `GET /api/v1/events/stream` (`text/event-stream`) emite
   los mismos frames que `/ws/events`, con `id:` = `events.id` (rowid
   append-only) y soporte de `Last-Event-ID` para reanudar. Esto, junto con
   la reconciliación al boot (SPEC-078), hace la recuperación de `kill -9`
   transparente para la UI: reconectar y reanudar por id sin pérdida.

### UI web (`packages/web`)

9. **Stack.** Paquete nuevo `packages/web` (`@cristiancorreau/forge-web`):
   Vite + React 19 + TypeScript + Tailwind. Sin SSR, sin backend propio:
   `vite build` produce estáticos que el daemon sirve (punto 4) y que el
   binario `bun build --compile` embebe. En dev, `vite dev` proxya `/api` y
   `/ws` a `127.0.0.1:41414` (`packages/web/vite.config.ts`).
10. **Sistema visual ember.** `packages/web/src/styles/ember.css` porta los
    tokens de `desktop/renderer/style.css` (paleta, spacing, radios,
    tipografía) y Tailwind los mapea como theme. Criterio de coherencia: los
    valores de `--ember`, `--ember-hover`, `--ember-press`, `--bg`, `--panel`
    y `--text` son byte-idénticos a los del desktop (que ya coinciden con
    `vscode-extension/media/style.css`).
11. **Cero lógica de negocio en el frontend.** La UI solo consume la API:
    - `packages/web/src/lib/api.ts` — cliente REST tipado:
      `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` que inyecta
      el bearer desde `window.__FORGE__` y parsea el contrato de error del
      punto 6.
    - `packages/web/src/lib/ws.ts` — `connectEvents(onEvent): Disposable` y
      `connectTerminal(sessionId): TerminalSocket`, con reconexión por
      backoff exponencial (250 ms → 8 s), degradación automática a
      `/api/v1/events/stream` si el WS falla dos veces seguidas, y refetch de
      queries al reconectar.
    - Datos remotos con TanStack Query; estado local mínimo con hooks.
    - Regla de lint (`eslint no-restricted-imports`): `packages/web/src` solo
      puede importar tipos de `@cristiancorreau/forge-schemas`; prohibido
      `@cristiancorreau/forge-daemon-core` y `@cristiancorreau/forge-daemon`.
      Las transiciones de estado válidas, el orden del board y toda regla de
      dominio llegan ya resueltas por la API (`409` como única validación).
12. **Rutas y vistas** (react-router, `packages/web/src/views/`):

    | Ruta | Vista | Contenido |
    |---|---|---|
    | `/` | `Dashboard.tsx` | cards por proyecto: sesiones activas, tareas en cola, últimos eventos |
    | `/board` | `Board.tsx` | kanban de tareas por `status`; drag optimista — si la API responde `409 invalid_transition`, la card revierte |
    | `/sessions/:id` | `SessionDetail.tsx` | transcript virtualizado (`AgentEvent` paginado por `?after=`) + terminal xterm.js vía `/ws/terminal/:id` + acciones stop/prompt/aprobar |
    | `/harnesses` | `Harnesses.tsx` | pool de harnesses, prioridad, `rate_limited_until`, consumo de tokens |
    | `/vault` y `/vault/*path` | `Vault.tsx` | browser de notas, render markdown, backlinks |
    | `/approvals` | `Approvals.tsx` | cards estructuradas (radio/checkbox/texto libre) con "permitir siempre para esta tarea" (contrato SPEC-081); badge global con conteo pendiente alimentado por `/ws/events` |
    | `/config` | `Config.tsx` | config del daemon vía `GET/PUT /config` |

13. **Terminal embebida.** xterm.js + `@xterm/addon-fit` sobre
    `connectTerminal()`. Los bytes del pty van directo a `term.write()` sin
    parseo intermedio, para cumplir el NFR de eco < 50 ms.
14. **Comando de apertura.** `forge ui` (nuevo, en
    `packages/cli/src/lib/daemon-client.ts`, registrado en `cli.ts` y en el
    help ES+EN) lee `~/.forge/daemon.json`, verifica que el pid viva y abre
    `http://127.0.0.1:<port>/` en el navegador; si el daemon no corre, exit 1
    sugiriendo `forge daemon start`. El token no va en la URL: lo inyecta el
    daemon al servir `index.html` (punto 4).
15. **Acceso remoto: documentado, no implementado.** `docs/daemon.md`
    (archivo nuevo de esta spec) incluye la sección "Acceso remoto": el
    daemon jamás escucha fuera de 127.0.0.1 y el camino soportado es
    Tailscale/VPN (tailnet + navegador apuntando a la IP del nodo). No se
    agrega ningún flag de bind.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| tRPC end-to-end en lugar de REST + JSON Schema | Tipado automático cliente-servidor | Acopla el contrato a TypeScript; rompe el principio de contratos neutrales del maestro y complica clientes no-TS (MCP, CLI, futuros) | Viola el principio 3 de SPEC-074 |
| Next.js / SSR para la UI | Ecosistema, routing integrado | Requiere servidor Node propio; el artefacto de v4 es un binario `bun build --compile` que sirve estáticos — SSR no aporta nada local-first y duplica servidores | La UI debe ser estáticos embebibles en el daemon |
| Extender la app Electron (`desktop/`) como UI de v4 | Reusa código existente | El desktop es un launcher de configuración per-proyecto; empaquetar Chromium para una UI que ya corre en cualquier navegador local duplica distribución | Se reusa el sistema visual ember, no el shell Electron |
| socket.io para eventos y terminal | Reconexión y fallback integrados | Dependencia pesada, protocolo propio sobre WS, complica la auth por subprotocolo y el passthrough binario del pty | WS nativo de Bun + SSE manual cubren ambos casos con menos superficie |

## Criterios de aceptación

- [ ] `bun test packages/daemon/test/api.auth.test.ts`: request a `/api/v1/projects` sin header → `401` con `{error:{code:"unauthorized"}}`; con token correcto → `200`; `GET /api/v1/health` sin token → `200`.
- [ ] `bun test packages/daemon/test/api.bind.test.ts`: el servidor acepta conexiones en `127.0.0.1:<port>` y las rechaza en la IP LAN de la máquina; inspección de `startServer` confirma que no existe opción de hostname.
- [ ] `bun test packages/daemon/test/api.routes.test.ts`: CRUD de projects/tasks y `POST /tasks/:id/start` contra `DaemonCore` con los fakes en memoria de `@cristiancorreau/forge-daemon-core/testing` (sin tmux ni SQLite reales); `PATCH /tasks/:id` con transición inválida → `409` `invalid_transition`.
- [ ] Test que fuerza un throw en un caso de uso y verifica respuesta `{error:{code:"internal",message:"internal error"}}` — ninguna respuesta de error incluye `stack` ni mensajes de excepciones internas.
- [ ] `bun test packages/daemon/test/ws.events.test.ts`: un evento publicado en el puerto `EventBus` llega como frame JSON a un cliente de `/ws/events` autenticado por subprotocolo; upgrade sin subprotocolo válido → `401`.
- [ ] `bun test packages/daemon/test/sse.resume.test.ts`: `GET /api/v1/events/stream` con `Last-Event-ID: N` reenvía solo eventos con `id > N`.
- [ ] `bun test packages/daemon/test/ws.latency.test.ts`: roundtrip de eco por `/ws/terminal/:id` contra un pty fake en localhost, p95 < 50 ms sobre 100 frames.
- [ ] Las respuestas de `api.routes.test.ts` validan contra los validadores generados de `@cristiancorreau/forge-schemas` (SPEC-075) en el mismo test.
- [ ] `grep -rn "Access-Control-Allow" packages/daemon/src` no devuelve resultados y `createApp` no registra middleware CORS (inspección).
- [ ] `bunx eslint packages/web/src` pasa con la regla `no-restricted-imports` que prohíbe `@cristiancorreau/forge-daemon-core` y `@cristiancorreau/forge-daemon` en `packages/web`.
- [ ] `bunx vitest run` en `packages/web` en verde con tests de: `Board` (render de columnas desde fixture de la API; revert de card ante `409`), `Approvals` (resolver una card hace `POST /approvals/:id/resolve`) y `lib/api` (adjunta bearer desde `window.__FORGE__`, parsea el contrato de error), con fetch mockeado.
- [ ] `vite build` en `packages/web` produce `dist/` con el marcador `<!--__FORGE_BOOTSTRAP__-->` presente en `dist/index.html` y sin referencias a hosts externos en `dist/assets` (`grep -rn "https\?://"` limitado a source maps/licencias).
- [ ] Los valores de `--ember`, `--ember-hover`, `--ember-press`, `--bg`, `--panel`, `--text` en `packages/web/src/styles/ember.css` son idénticos a los de `desktop/renderer/style.css` (test de comparación por grep/snapshot).
- [ ] `forge ui` con daemon corriendo abre el navegador en `http://127.0.0.1:<port>/`; sin daemon → exit 1 con mensaje que sugiere `forge daemon start` (test del comando con fixture de `daemon.json`).
- [ ] Flujo Fase 3 end-to-end (checklist manual en el PR): crear tarea en el board → start → ver transcript y terminal en `/sessions/:id` → resolver una aprobación → tarea en `done`, sin tocar la terminal del sistema.
- [ ] `docs/daemon.md` existe, contiene la sección "Acceso remoto" (Tailscale/VPN) y afirma explícitamente el bind exclusivo en 127.0.0.1.
- [ ] Suite completa del monorepo en verde.

## Riesgos e impacto

| Riesgo | Mitigación |
|--------|------------|
| Scope creep de la UI (lógica de dominio filtrándose al frontend) | Regla de lint de imports + criterio de review "el frontend solo refleja lo que la API responde"; transiciones inválidas se detectan por `409`, nunca por validación local |
| Token filtrado por historial/logs | Nunca en query strings; WS autentica por subprotocolo; `daemon.json` en `0600` (SPEC-078); token nuevo en cada lanzamiento invalida capturas viejas |
| Backpressure con 10 sesiones streameando a la vez | Transcript virtualizado y paginado (`?after=`); el bridge de eventos cierra sockets de clientes lentos y la UI reanuda por SSE/`since=` sin pérdida gracias al log append-only |
| Deriva visual entre web, desktop y vscode-extension (hoy tokens duplicados a mano) | Tokens ember portados 1:1 y verificados por test; extraerlos a un paquete compartido queda fuera de alcance |
| `Bun.serve`/WS cambia semántica entre versiones de Bun | Versión de Bun fijada en `engines` de `packages/daemon/package.json`; tests de integración de upgrade/auth en CI |

Impacto de compliance: ninguno. Todo el tráfico es loopback local, sin
telemetría, sin servicios cloud, sin LLM en el daemon. El impacto en v3.x es
nulo: la UI web y la API son opt-in vía `forge daemon start` y no tocan
`project.yaml` ni las superficies generadas.
