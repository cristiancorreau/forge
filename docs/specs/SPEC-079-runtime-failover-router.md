# SPEC-079 Router multi-runtime con failover y handoff semántico

> Estado: APPROVED — DIVIDIDA (2026-07-18)
> Responsable: forge maintainers
> Creada: 2026-07-05 | Actualizada: 2026-07-05
> Deriva de: SPEC-074 (componente "Router multi-runtime con failover", Fase 5)
> Depende de: SPEC-075 (schemas), SPEC-076 (daemon-core), SPEC-078 (daemon + drivers)

> **Replanteo 2026-07-18 — split forge ↔ mingako**: forge declara la cadena de fallback como configuración en project.yaml y mantiene la portabilidad estática ya existente (forge port, SPEC-073); la ejecución del failover (pool de harnesses, rate limits, selectHarness, handoff en vivo) pasa a mingako. El formato del paquete de handoff (nota Markdown + frontmatter) es contrato compartido. Ver `docs/analysis/forge-mingako-replanteo-2026-07.md` y SPEC-083.

## Contexto

Forge v3.11 ya demostró con `forge port` (SPEC-073) que el estado portable entre
runtimes no es la sesión nativa: es `project.yaml` + specs + Markdown + git. La
matriz de `packages/cli/src/lib/portability.ts` lo clasifica en tres baldes
(`portable`/`adapted`/`vendor`) y `docs/portability.md` lo documenta. Pero eso
resuelve la portabilidad **estática** (config). Lo que nadie resuelve bien es la
portabilidad **dinámica**: una tarea corriendo en Claude Code se detiene porque
la cuenta agotó su límite de uso, y el trabajo queda huérfano hasta que el
humano lo rescata a mano.

SPEC-074 declara este router como la diferenciación principal de v4 frente a
boards genéricos (vibe-kanban, cmux): cuando un runtime o cuenta se agota, la
tarea continúa en el siguiente harness disponible con un checkpoint semántico
(commit WIP + nota Markdown + prompt de reanudación), no con un dump de sesión
imposible de portar. El principio 4 del maestro ("Markdown como estado portable")
es exactamente el mismo argumento de SPEC-073, ahora aplicado en caliente.

Esta spec cubre la Fase 5: pool de harnesses con HOME aislado, catálogo de
detección de rate limit por driver, backoff con `rate_limited_until`, protocolo
de handoff en 4 pasos y políticas configurables. El criterio de la fase: simular
rate limit en Claude Code y ver la tarea continuar en Codex con nota de handoff.

## Decisión

1. **Modelo de harness (`packages/schemas`)**. Un harness = (runtime × cuenta)
   con HOME aislado. Contrato neutral en
   `packages/schemas/src/harness.schema.json` (+ tipo Zod exportado):
   `{ id, runtime, label, home_dir, priority, status, rate_limited_until }`,
   con `status: 'active' | 'rate_limited' | 'disabled'` y `priority` entero
   (menor = preferido). Persiste en la tabla `harnesses` ya definida en
   SPEC-074. El HOME aislado vive en `~/.forge/harnesses/<id>/home/`; el driver
   lanza el proceso con `HOME` apuntado ahí (y además `CLAUDE_CONFIG_DIR` para
   claude-code, `CODEX_HOME` para codex), de modo que dos cuentas del mismo
   runtime no compartan credenciales ni estado.

2. **CLI de gestión (`packages/cli`)**. Nuevo comando `forge harness` con
   subcomandos:
   - `forge harness add <runtime> --label <texto> [--priority N]` — crea la fila
     y el HOME aislado.
   - `forge harness login <id>` — abre el binario del runtime dentro del HOME
     aislado para completar el login interactivo de esa cuenta.
   - `forge harness list [--json]` — muestra pool, prioridad, status y
     `rate_limited_until`.
   - `forge harness remove <id>` y `forge harness simulate-rate-limit <id>
     [--for 30m]` — el segundo existe para el criterio de aceptación de la fase:
     marca el harness como `rate_limited` y, si tiene sesiones vivas, dispara el
     handoff real (no un mock).
   Registrados en `packages/cli/src/cli.ts` y en el help (ES+EN), igual que
   `forge port` en SPEC-073.

3. **Catálogo de detección de rate limit por driver
   (`packages/daemon/src/drivers/rate-limit-catalog.ts`)**. Catálogo
   **declarativo** (datos, no lógica dispersa) indexado por id de driver y rango
   de versiones:

   ```ts
   interface RateLimitRule {
     driver: string;              // 'claude-code' | 'codex' | ...
     versions: string;            // rango semver, p. ej. '>=2.0.0'
     exitCodes: number[];
     stderrPatterns: RegExp[];    // p. ej. /rate limit|usage limit reached/i
     jsonlMatchers: JsonlMatcher[]; // eventos del transcript (type/subtype/message)
     usageEvents: UsageMatcher[]; // eventos de usage que anticipan el agotamiento
   }
   ```

   El driver clasifica la salida del proceso y emite un
   `RateLimitSignal` neutral (definido en
   `packages/schemas/src/rate-limit-signal.schema.json`):
   `{ harnessId, source: 'exit-code' | 'stderr' | 'jsonl' | 'usage-event',
   matched, retryAfterMs? }`. El dominio nunca ve regexes ni formatos JSONL:
   solo señales. Cada driver trae **tests de contrato con fixtures grabadas**
   (`packages/daemon/test/fixtures/rate-limit/<runtime>/*.txt|*.jsonl`), la
   mitigación exacta que SPEC-074 exige para el riesgo "detección frágil entre
   versiones de CLIs".

4. **Backoff en dominio puro
   (`packages/daemon-core/src/router/backoff.ts`)**. Función pura
   `computeRateLimitedUntil(signal: RateLimitSignal, attempt: number, now: Date): Date`:
   si la señal trae `retryAfterMs`, se respeta; si no, exponencial
   `min(5min × 2^attempt, 60min)`. Sin jitter aleatorio: determinismo para
   testing (principio de puertos `ClockPort`/`IdPort` del maestro). Un caso de
   uso `markRateLimited` actualiza `harnesses.status` y
   `harnesses.rate_limited_until` vía puerto y programa la reactivación con
   `ClockPort`; al vencer, el harness vuelve a `active` y se emite
   `harness.recovered` por el `EventBus`.

5. **Selección de destino
   (`packages/daemon-core/src/router/failover-router.ts`)**. Función pura del
   dominio:

   ```ts
   selectHarness(
     task: Task,
     pool: Harness[],
     policy: FailoverPolicy,
     now: Date,
   ): { harness: Harness } | { blocked: 'no-harness' | 'needs-approval' | 'budget-exceeded' }
   ```

   Orden de evaluación: (1) filtra `status === 'active'` y
   `rate_limited_until <= now`; (2) ordena por la lista `policy.order` y, a
   igualdad, por `priority`; (3) si la tarea está marcada `no_failover` y el
   destino difiere del harness original, devuelve `needs-approval` (se crea una
   solicitud vía `ApprovalPort`, la tarea pasa a `needs_input`); (4) si
   `tokens_in + tokens_out` acumulados de las `sessions` de la tarea superan
   `policy.token_budget`, devuelve `budget-exceeded` (misma ruta de aprobación).
   Cero imports de `node:`/`bun:` — se verifica con la lint rule del maestro.

6. **Protocolo de handoff en 4 pasos
   (`packages/daemon-core/src/router/handoff.ts`, caso de uso
   `executeHandoff(sessionId, signal)`)**. Orquestado 100 % por puertos:
   1. **Congelar y checkpointear.** `SessionPort.freeze(sessionId)`; luego
      `VcsPort.commitWip(worktree, mensaje)` con mensaje
      `forge-checkpoint: <task-id> handoff <harness-origen> -> <harness-destino>`
      (equivale a `git add -A && git commit` en el worktree de la tarea; el
      prefijo `forge-checkpoint:` es greppeable y se limpia con squash al cerrar
      la tarea).
   2. **Nota de handoff en el vault.** Vía `MemoryPort.write()` en
      `{proyecto}/.forge/memory/handoffs/<task-id>-<seq>.md`, con frontmatter
      YAML (`type: handoff`, `task`, `spec`, `from_harness`, `to_harness`,
      `created`) y secciones fijas: **Objetivo**, **Spec**, **Completado**,
      **Decisiones**, **Pendiente**, **Archivos tocados**, **Comandos útiles**.
      La nota se sintetiza **mecánicamente** desde datos disponibles (metadata
      de la tarea, `spec_ref`, `git diff --stat` del checkpoint, últimos N
      eventos del transcript): no depende de que la sesión moribunda pueda
      responder. Enriquecimiento best-effort: si la señal vino de un
      `usage-event` (anticipación, no corte duro), el driver envía un último
      prompt "escribe tu nota de handoff" con timeout de 60 s antes del paso 1;
      si expira, vale la nota mecánica. Plantilla en
      `packages/daemon-core/src/router/handoff-note-template.ts` y tipo
      `HandoffNote` en `packages/schemas/src/handoff-note.schema.json`.
   3. **Encolar en el siguiente harness.** `selectHarness()` elige destino;
      `RuntimePort.launch()` con el HOME aislado del destino y un **prompt de
      reanudación** = plantilla fija que embebe la nota de handoff completa +
      `git diff` del checkpoint + referencia a la spec. Nada del prompt asume el
      runtime origen: es Markdown neutro.
   4. **Registrar linaje.** Nueva fila en `sessions` con
      `handoff_from = <session-id-origen>`; la sesión origen cierra con
      `status: 'handed_off'`. Eventos emitidos en orden:
      `harness.rate_limited`, `task.handoff`, `session.resumed`.

7. **Políticas por proyecto y globales**. Contrato
   `packages/schemas/schemas/failover-policy.schema.json` (carpeta de fuentes
   de verdad de SPEC-075):

   ```yaml
   failover:
     order: [claude-code, codex]   # preferencia de runtimes
     no_failover: false            # true → todo handoff requiere aprobación
     token_budget: 500000          # tokens_in+out máximos por tarea; 0 = sin límite
   ```

   Global por defecto en `~/.forge/failover.yaml`; override por proyecto bajo la
   clave `daemon.failover` de `project.yaml` (merge superficial: el proyecto
   pisa clave a clave al global). Las tareas individuales pueden marcarse
   `no_failover` al crearse, para trabajo sensible que no debe saltar de cuenta
   sin un humano. **Persistencia decidida**: migración
   `packages/daemon-core/migrations/003-task-policy.sql` (convención de
   SPEC-076) que agrega `tasks.policy_json TEXT NOT NULL DEFAULT '{}'`;
   `no_failover` y el override de `token_budget` por tarea viven ahí, y
   `task.schema.json` (SPEC-075) gana la propiedad opcional `policy`
   correspondiente vía `npm run generate`.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Transferir la sesión nativa (p. ej. `claude --resume` / export de transcript) al runtime destino | Máxima fidelidad de contexto | Formatos de sesión incompatibles entre runtimes; frágil ante cambios de versión; imposible cross-runtime | Contradice el principio 4 del maestro: el estado portable es spec + Markdown + git, no la sesión |
| Failover a nivel de API (gateway que rota API keys, estilo LiteLLM) | Transparente para el agente, sin handoff | forge orquesta CLIs interactivos con suscripción, no llamadas API; se pierde el harness completo (hooks, MCP, transcript) y exige claves API que muchos usuarios no tienen | Modelo de producto distinto; rompe local-first sobre CLIs |
| Detección de rate limit por scraping del render de terminal (pipe-pane) | Cubre cualquier runtime sin driver | Extremadamente frágil (colores, wrapping, i18n del CLI); imposible de testear por contrato | Exit codes + stderr + JSONL por driver con fixtures es lo único estable; pipe-pane queda solo como fallback de streaming (SPEC-078) |
| Reintento en el mismo harness (sin pool) | Mucho más simple | Un límite de cuenta dura horas: la tarea queda parada exactamente en el escenario que motiva la feature | No resuelve el problema; el pool es la diferenciación declarada en SPEC-074 |

## Criterios de aceptación

- [ ] `packages/schemas` exporta `harness.schema.json`, `rate-limit-signal.schema.json`, `handoff-note.schema.json` y `failover-policy.schema.json` válidos (test: compilar cada uno con Ajv en `packages/schemas/test/failover-schemas.test.ts`).
- [ ] `selectHarness()` es pura y determinística: tests en `packages/daemon-core/test/router/failover-router.test.ts` cubren orden por política, desempate por `priority`, exclusión de `rate_limited`/`disabled`, `no_failover` → `needs-approval`, presupuesto excedido → `budget-exceeded`.
- [ ] `computeRateLimitedUntil()` respeta `retryAfterMs` de la señal y aplica exponencial con techo de 60 min sin él (test en `packages/daemon-core/test/router/backoff.test.ts`).
- [ ] `packages/daemon-core/src/router/` no importa `node:`, `bun:`, sqlite ni http (verificable con la lint rule/test de imports del maestro; corre en la suite de daemon-core sin tmux instalado).
- [ ] Catálogo de rate limit con tests de contrato por driver sobre fixtures grabadas: `packages/daemon/test/drivers/rate-limit-catalog.test.ts` clasifica correctamente al menos 3 fixtures de claude-code (exit code, stderr, JSONL) y 2 de codex, y NO dispara con fixtures de salida normal (falsos positivos).
- [ ] `executeHandoff()` con fakes en memoria ejecuta los 4 pasos en orden y emite `harness.rate_limited`, `task.handoff`, `session.resumed` (test en `packages/daemon-core/test/router/handoff.test.ts`).
- [ ] La nota de handoff generada tiene frontmatter YAML parseable y las 7 secciones fijas; el archivo resultante abre en Obsidian sin errores (test de snapshot de la plantilla + inspección manual documentada).
- [ ] `forge harness add|login|list|remove|simulate-rate-limit` registrados en `cli.ts` y en el help ES+EN; `forge harness list --json` emite JSON estable.
- [ ] **Criterio de la Fase 5 (E2E)**: con dos harnesses configurados (claude-code prioridad 1, codex prioridad 2) y una tarea corriendo, `forge harness simulate-rate-limit <claude-id>` produce: (a) commit `forge-checkpoint:` en el worktree de la tarea (`git log --oneline | grep forge-checkpoint`), (b) nota en `.forge/memory/handoffs/`, (c) nueva fila en `sessions` con `handoff_from` apuntando a la sesión origen y `harness_id` del harness codex, (d) la tarea sigue en `running`.
- [ ] Tarea marcada `no_failover` + rate limit → NO hay handoff automático: se crea una fila en `approvals` y la tarea pasa a `needs_input`.
- [ ] Vencido `rate_limited_until`, el harness vuelve a `active` y se emite `harness.recovered` (test con `ClockPort` fake avanzando el tiempo).
- [ ] Suite completa verde (`bun test` en los paquetes tocados).

## Riesgos e impacto

| Riesgo | Mitigación |
|--------|------------|
| Patrones de rate limit cambian entre versiones de los CLIs | Catálogo declarativo versionado por rango semver + fixtures grabadas por versión; agregar una versión nueva = agregar fixtures y una regla, sin tocar el dominio |
| Estampida de handoffs: N sesiones en el mismo harness golpean el límite a la vez | El primer `RateLimitSignal` marca el harness (una sola vez); los handoffs de sus sesiones se serializan por tarea; el destino se calcula con el pool ya actualizado |
| Nota mecánica más pobre que una escrita por el agente | El paso best-effort con `usage-event` anticipado captura la nota semántica cuando hay margen; la mecánica garantiza el piso (diff + spec + transcript reciente) |
| Commits `forge-checkpoint:` ensucian el historial | Solo existen en la rama del worktree de la tarea; se squashean al cerrar la tarea (política de `VcsPort` ya prevista en el maestro) |
| Login por harness con HOME aislado agrega fricción de setup | `forge harness login <id>` guía el flujo interactivo una sola vez por cuenta; `forge harness list` muestra qué harness carece de credenciales |
| Handoff a un runtime con menor capacidad degrada la tarea | `policy.order` es explícito y editable; `no_failover` por tarea y el presupuesto de tokens dan frenos humanos donde importa |

Impacto en v3.x: ninguno en la capa de generación. `packages/cli` solo suma el
comando `forge harness`; `project.yaml` gana la clave opcional `daemon.failover`
(ignorada por los generadores actuales). Sin red saliente nueva, sin telemetría.
