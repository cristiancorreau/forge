# SPEC-068 Hook PreCompact — re-anclaje a `.forge/state/`

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

Del análisis vs Open GSD: sus lifecycle hooks miden presión de contexto
(PreCompact/Stop) y reaccionan. forge ahora tiene el artefacto `.forge/state/`
(SPEC-062), un punto de re-anclaje determinístico. Un hook `PreCompact` puede
recordarle al agente, justo antes de que el runtime compacte el contexto, que
relea `.forge/state/STATE.md` para no perder el "big picture".

Es una adopción parcial y barata: no se adoptan loop extension points ni recovery
classification (asumen un orquestador en vivo). Solo runtimes que exponen el
evento (Claude Code) lo reciben.

## Decisión

1. **Nuevo `core/hooks/precompact-headroom.js`**: en el evento PreCompact emite un
   recordatorio de releer `.forge/state/STATE.md` (si existe), con un resumen corto.
   Exit 0 siempre (no bloquea).
2. Registrarlo en `core/hooks/hooks-registry.yaml` (grupo universal) con
   `event: PreCompact`.
3. `buildSettings()` en `commands/init.ts` registra el evento `PreCompact` en
   `.claude/settings.json` para los runtimes que lo soportan (claude-code). Para
   runtimes sin el evento, el hook simplemente no se instala (sin promesa de paridad).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Loop extension points + recovery (como GSD) | Más rico | Requiere orquestador en vivo | Fuera del scope de compilador |
| No hacer nada | Cero esfuerzo | `.forge/state/` queda sin disparador en compaction | El recordatorio es barato y útil |

## Criterios de aceptación

- [ ] `precompact-headroom.js` corre, lee `.forge/state/STATE.md` si existe, exit 0.
- [ ] Registrado en hooks-registry y en `buildSettings` para claude-code (evento PreCompact).
- [ ] No se instala en runtimes que no exponen PreCompact.
- [ ] Test del hook (con y sin STATE.md).

## Impacto de compliance

Ninguno.
