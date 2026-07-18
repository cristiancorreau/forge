# SPEC-078 Daemon forged + gestor de sesiones tmux + drivers de runtime

> Estado: APPROVED — TRANSFERIDA A MINGAKO (2026-07-18)
> Responsable: forge maintainers
> Creada: 2026-07-05 | Actualizada: 2026-07-05
> Deriva de: SPEC-074 (componente "Gestor de sesiones tmux", Fase 2)
> Depende de: SPEC-075 (paquete `schemas`), SPEC-076 (`daemon-core`: puertos y modelo de datos)

> **Replanteo 2026-07-18 — split forge ↔ mingako**: el daemon forged, las sesiones tmux y los drivers de runtime son orquestación pura y pasan enteros a mingako; en forge no se implementa nada de esta spec (forge nunca ejecuta un runtime, solo genera su configuración). Ver `docs/analysis/forge-mingako-replanteo-2026-07.md` y SPEC-083.

## Contexto

forge v3.11 es un generador stateless: `registry.ts` conoce 19 runtimes y sabe
generar su configuración, pero forge nunca **ejecuta** un runtime ni observa lo
que hace. El spec maestro SPEC-074 introduce el plano de control local-first, y
su Fase 2 exige el primer componente con estado en vivo: un daemon (`forged`)
que lance sesiones de agente dentro de tmux, entregue prompts, transmita la
salida en tiempo real y sobreviva a un `kill -9` sin corromper estado.

Anclas en el repo real:

- De los 19 runtimes de `packages/cli/src/lib/generators/registry.ts`, solo los
  `kind:'native'` con CLI interactiva son lanzables en un pane: **claude-code**,
  **codex** y **opencode**. Kiro es nativo pero es un IDE (no lanzable por tmux)
  y los 15 rules-based son editores/plugins, no procesos. El daemon rechaza
  lanzar cualquier runtime fuera de la lista lanzable.
- Claude Code escribe su transcript en
  `~/.claude/projects/{cwd-slug}/{session-uuid}.jsonl` (slug = cwd absoluto con
  `/` reemplazado por `-`). Ese archivo es la fuente de streaming más fiel: da
  mensajes, tool calls y usage sin parsear ANSI.
- tmux **rechaza `:` y `.` en nombres de sesión** (son delimitadores de target).
  La convención del maestro `forge:{project}:{task}:{role}` se conserva como
  identificador lógico del dominio; el adapter la mapea a un nombre físico
  tmux-safe (ver Decisión 3).

Por arquitectura hexagonal (SPEC-074, principio 2): el dominio de sesiones vive
en `daemon-core` sin tocar tmux ni filesystem; toda la integración entra por
`SessionPort` y `RuntimePort` implementados en el paquete nuevo `daemon`.

## Decisión

1. **Paquete `packages/daemon`** (`@cristiancorreau/forge-daemon`), binario
   `forged` (`packages/daemon/src/main.ts`, Bun + Hono). Estructura:

   ```
   packages/daemon/src/
   ├── main.ts                      # bootstrap: config, reconcile, API
   ├── infra/tmux/
   │   ├── control-client.ts        # TmuxControlClient: proceso tmux -CC persistente
   │   └── tmux-adapter.ts          # TmuxSessionAdapter implements SessionPort
   ├── infra/runtimes/
   │   ├── driver.ts                # interfaz RuntimeDriver + registro de drivers
   │   ├── claude-code.driver.ts    # driver v1 (JSONL tailer)
   │   ├── codex.driver.ts          # stub Fase 2 (solo buildCommand + pipe-pane)
   │   └── opencode.driver.ts       # stub Fase 2 (ACP en SPEC-079)
   ├── infra/streams/
   │   ├── jsonl-tailer.ts          # JsonlTailer para ~/.claude/projects/
   │   └── pipe-pane-stream.ts      # fallback tmux pipe-pane
   ├── infra/terminal/pty-bridge.ts # node-pty ⇄ WebSocket
   └── api/sessions.ts              # rutas /api/v1/sessions (subset; API completa en SPEC-082)
   ```

2. **Ciclo de vida del daemon.** `forge daemon start|stop|status` se agrega a
   `packages/cli/src/cli.ts` (implementación en
   `packages/cli/src/lib/daemon-client.ts`). `start` lanza `forged` detached,
   escribe `~/.forge/forged.pid` y `~/.forge/daemon.json`
   (`{port, token, pid, version, startedAt}`, modo `0600`). Bind exclusivo
   `127.0.0.1`, puerto por defecto `41414` (el mismo que fija SPEC-082, dueña
   de la superficie API), token bearer aleatorio (32 bytes hex)
   regenerado en cada arranque. `stop` envía SIGTERM: el daemon cierra streams y
   API pero **no mata sesiones tmux** — las sesiones sobreviven al daemon; la
   reconciliación al siguiente boot las readopta o las marca huérfanas.

3. **Nombres de sesión.** Identificador lógico del dominio:
   `forge:{project}:{task}:{role}` (tipo `SessionName` en `schemas`). Mapeo
   físico determinista en el adapter, porque tmux prohíbe `:` y `.`:
   `tmuxName(logical) = logical.replaceAll(':', '_')` con segmentos saneados a
   `[a-z0-9-]{1,32}` → `forge_{project}_{task}_{role}`. La reconciliación y el
   listado filtran por prefijo físico `forge_`. La función inversa
   `logicalName(tmuxName)` es total sobre nombres bien formados; ambas viven en
   `packages/daemon/src/infra/tmux/session-name.ts` y son puras.

4. **`TmuxSessionAdapter` implementa `SessionPort`** con la firma exacta de
   SPEC-076 (punto 3) — esta spec no la renombra ni la extiende:

   ```ts
   export interface SessionPort {
     open(spec: { name: string; cwd: string; command: RuntimeCommand }): Promise<void>; // new-session -d + argv
     sendPrompt(name: string, prompt: string): Promise<void>;
     kill(name: string): Promise<void>;              // kill-session
     isAlive(name: string): Promise<boolean>;
     listLive(prefix: string): Promise<string[]>;    // list-sessions -F, nombres LÓGICOS 'forge:...'
   }
   ```

   El dominio solo ve nombres lógicos `forge:{project}:{task}:{role}`; el
   adapter traduce con `tmuxName`/`logicalName` (Decisión 3) en la frontera:
   `listLive('forge:')` filtra por el prefijo físico `forge_` y devuelve los
   nombres lógicos reconstruidos. El adapter habla con un único proceso `tmux -CC` persistente
   (`TmuxControlClient`) que parsea las notificaciones de control mode
   (`%begin`/`%end`/`%error`, `%output`, `%session-changed`, `%exit`) y expone
   `exec(cmd: string): Promise<string>` con correlación por bloque
   `%begin…%end`. Si el proceso de control muere, se relanza con backoff
   exponencial (1 s, 2 s, 4 s… máx 30 s) y se emite `daemon.tmux_reconnected`.

5. **Entrega de prompts sin escaping frágil.** `sendPrompt` nunca pasa el texto
   por `send-keys` literal. Secuencia: (1) escribir el prompt a
   `~/.forge/tmp/prompt-{sessionId}-{nonce}.txt`; (2)
   `tmux load-buffer -b forge-{nonce} <archivo>`; (3)
   `tmux paste-buffer -p -b forge-{nonce} -t <session>`; (4)
   `tmux send-keys -t <session> Enter`; (5) `tmux delete-buffer -b forge-{nonce}`
   y borrar el archivo temporal. Soporta prompts multilínea y de cualquier
   tamaño razonable sin interpretación de caracteres por el shell.

6. **Drivers de runtime versionados.** Interfaz en
   `packages/daemon/src/infra/runtimes/driver.ts`:

   ```ts
   import type { RuntimePort } from '@cristiancorreau/forge-daemon-core';

   // RuntimePort (SPEC-076) ya aporta: runtime, buildCommand(...): RuntimeCommand,
   // parseTranscriptLine(line), detectExhaustion(chunk). El driver lo implementa
   // y agrega las extensiones de infraestructura que el dominio no necesita ver:
   export interface RuntimeDriver extends RuntimePort {
     contractVersion: string;                       // p.ej. 'claude-code/v1'
     attachStream(name: string, ctx: StreamCtx): AsyncIterable<AgentEvent>;
     classifyExit(code: number, tailLines: string[]): ExitClass; // 'ok'|'rate_limited'|'error'
   }
   // driver.ts exporta también el registro: getDriver(runtime: string): RuntimeDriver | null,
   // que es la implementación de RuntimeProvider (SPEC-076) usada por openSession.
   ```

   `AgentEvent` es contrato neutral en `packages/schemas`
   (`agent-event.schema.json`): `{ ts, sessionId, kind, payload }` con
   `kind ∈ { message, tool_use, tool_result, usage, lifecycle, raw }`. Ningún
   consumidor (dominio, API, UI) ve el formato crudo de un runtime; solo el
   driver lo conoce. Un cambio de formato del CLI = nueva `contractVersion` +
   nuevos fixtures, sin tocar dominio.

7. **Estrategias de streaming (en orden de preferencia por driver):**
   - **claude-code → `JsonlTailer`**: resuelve el transcript en
     `~/.claude/projects/{slug(cwd)}/`, espera su aparición con reintentos
     (500 ms, máx 20 intentos) porque el archivo se crea después del launch,
     y lo tailéa por offset incremental (`fs.watch` + fallback `watchFile`
     500 ms en macOS). Cada línea JSONL se traduce a `AgentEvent`.
   - **opencode → ACP nativo** (stream del Agent Client Protocol). En Fase 2
     queda el stub con fallback pipe-pane; la integración ACP completa se
     especifica con el router (SPEC-079).
   - **Fallback universal → `PipePaneStream`**:
     `tmux pipe-pane -o -t <session> 'cat >> ~/.forge/streams/{sessionId}.log'`
     y tail del log emitiendo `AgentEvent{kind:'raw'}` con chunks saneados de ANSI.

8. **Terminal embebida.** `pty-bridge.ts`: por cada conexión WebSocket a
   `GET /ws/terminal/:sessionId` (ruta de SPEC-082), node-pty lanza
   `tmux attach-session -t <tmuxName>`; frames binarios para stdin/stdout y
   frames JSON de control (`{type:'resize', cols, rows}` → `pty.resize`). El
   frontend xterm.js es alcance de SPEC-082; esta spec fija el contrato WS.

9. **Reconciliación al boot** — el caso de uso puro está definido en SPEC-076
   (punto 5, `packages/daemon-core/src/usecases/reconcile-on-boot.ts`; se
   implementa en Fase 0, no existe aún en el repo). Esta spec lo cablea en `forged`: se ejecuta antes de aceptar tráfico y luego
   como watchdog cada 30 s (configurable):
   - Sesión tmux con prefijo físico `forge_` (lógico `forge:`) **sin** fila
     `sessions.status='running'` correspondiente → `SessionPort.kill` + evento
     `session.reaped`.
   - Fila `running` **sin** sesión tmux viva (`isAlive` false) →
     `status='orphaned'`, `ended_at=now`, evento `session.orphaned`.
   - Fila `running` con sesión viva → readoptar: re-adjuntar stream del driver.
   El caso de uso recibe solo puertos (`SessionPort`, repositorio de sesiones,
   `ClockPort`, `EventBus`) y se testea con fakes en memoria, sin tmux.

10. **API mínima de Fase 2** (Hono, auth `Authorization: Bearer <token>`;
    prefijos y reglas de superficie los fija SPEC-082 y esta spec los adopta):
    - `POST /api/v1/sessions` `{taskId, role, runtime, prompt?}` → `201 {sessionId}`
    - `GET /api/v1/sessions/:id` → fila + estado vivo
    - `POST /api/v1/sessions/:id/prompt` `{text}` → `202`
    - `DELETE /api/v1/sessions/:id` → kill + `sessions.status='done'|'failed'`
    - `GET /api/v1/sessions/:id/events` → SSE de `AgentEvent` por sesión
      (el broadcast global de eventos del dominio es `/ws/events`, SPEC-082)
    - `GET /ws/terminal/:sessionId` → WebSocket pty (Decisión 8; misma ruta que SPEC-082)
    Runtime no lanzable (kiro o cualquier rules-based del registry) → `422`.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| node-pty directo sin tmux (un pty por sesión dentro del daemon) | Menos dependencias; sin mapeo de nombres | Las sesiones mueren con el daemon; imposible `attach` manual del usuario; viola el RNF de recuperación ante `kill -9` | tmux da supervivencia y attach externo gratis |
| Shell-out `tmux <cmd>` por operación, sin control mode | Implementación trivial | Sin notificaciones push (`%output`, `%exit`); obliga a polling de estado; carrera entre comandos concurrentes | Control mode da eventos push y un canal serializado |
| `send-keys` con el prompt literal en vez de load-buffer+paste-buffer | Un solo comando | Escaping frágil (`;`, comillas, saltos de línea), límites de longitud de argv, interpretación de teclas especiales | Corrompe prompts reales de agentes (multilínea, código) |
| Scrape de pane (`capture-pane`) como streaming principal | Universal | Parsear ANSI/TUI es lossy: se pierden tool calls y usage estructurados | JSONL/ACP dan eventos estructurados; capture-pane ni siquiera es incremental |

## Criterios de aceptación

- [ ] `packages/daemon` existe y compila; `packages/daemon-core` sigue sin
      imports de `node:`/`bun:`/sqlite/http (verificable con el lint/test de SPEC-076).
- [ ] `session-name.ts`: tests unitarios prueban `tmuxName('forge:app:t1:dev')
      === 'forge_app_t1_dev'`, saneo de segmentos inválidos y round-trip
      `logicalName(tmuxName(x)) === x`.
- [ ] `TmuxControlClient`: test unitario del parser de control mode con
      fixtures grabados (`packages/daemon/test/fixtures/tmux/*.txt`) cubriendo
      `%begin/%end`, `%error`, `%output` y `%exit`.
- [ ] `JsonlTailer`: test con fixture
      `packages/daemon/test/fixtures/claude-code/transcript-v1.jsonl` — emite
      los `AgentEvent` esperados y valida contra `agent-event.schema.json`;
      test de aparición tardía del archivo (retry) en verde.
- [ ] Test de contrato del driver claude-code: `contractVersion` presente y
      `classifyExit` distingue `ok`/`rate_limited`/`error` sobre tails grabados.
- [ ] `reconcile-on-boot` testeado 100 % con fakes en memoria (sin tmux
      instalado): los tres escenarios de la Decisión 9 (reap, orphan, readopt);
      el escenario readopt y el modo watchdog (re-ejecución periódica) se
      agregan a `packages/daemon-core/test/usecases.test.mjs` de SPEC-076.
- [ ] Test de integración `packages/daemon/test/tmux.integration.test.ts`
      (skip automático si `tmux -V` falla): `open` → `listLive('forge:')` la
      devuelve con su nombre lógico → `sendPrompt` multilínea llega al pane
      (`capture-pane` lo confirma) → `kill` → `listLive` vacía.
- [ ] `forge daemon start` crea `~/.forge/forged.pid` y `~/.forge/daemon.json`
      con modo `0600`; `forge daemon status` reporta puerto y pid; `stop`
      termina el proceso sin matar sesiones tmux existentes (verificable con
      `tmux ls` antes/después).
- [ ] Demo Fase 2 reproducible: `curl` autenticado a `POST /api/v1/sessions` lanza
      Claude Code, `GET .../events` transmite `AgentEvent` en vivo y
      `DELETE .../sessions/:id` la mata; sin token → `401`; runtime `cursor`
      → `422`.
- [ ] `kill -9` al daemon con una sesión corriendo → al reiniciar, la sesión
      se readopta (o se marca `orphaned` si murió) y no quedan sesiones
      `forge_` sin fila; verificable con el test de reconciliación + demo manual.
- [ ] Suite completa del monorepo en verde.

## Riesgos e impacto

| Riesgo | Mitigación |
|--------|------------|
| El formato JSONL de Claude Code cambia sin aviso | Encapsulado en driver con `contractVersion` + fixtures grabados; el test de contrato falla ruidosamente y el fallback pipe-pane mantiene la sesión observable (degradada, no rota) |
| Carrera entre launch y aparición del transcript JSONL | Retry con backoff en `JsonlTailer` (Decisión 7); si expira, degradar a pipe-pane y emitir `session.stream_degraded` |
| `fs.watch` poco fiable en macOS/volúmenes de red | Fallback `watchFile` con polling 500 ms integrado en el tailer |
| Divergencia lógico/físico en nombres de sesión | Mapeo puro y biyectivo con tests de round-trip; ningún módulo fuera de `infra/tmux` ve nombres físicos |
| Token del daemon filtrado por permisos de archivo | `daemon.json` modo `0600`, token rotado en cada arranque, bind solo 127.0.0.1 |
| El watchdog mata una sesión legítima recién lanzada (fila aún no commiteada) | Orden estricto: insertar fila `running` **antes** de `SessionPort.open`; el reap exige además edad de sesión tmux > 60 s |
| Scope creep hacia SPEC-079/082 | Esta spec entrega solo el driver claude-code completo, stubs de codex/opencode y el subset de API de la Decisión 10 |

Impacto en v3.x: nulo para usuarios del CLI generador — `forged` es opt-in y no
toca `project.yaml` ni las superficies generadas. Sin red saliente, sin LLM en
el daemon, sin telemetría.
