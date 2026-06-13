# SPEC-064 `spec-probe` — gate de salida determinístico para specs

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

Del análisis vs Open GSD: su spec flow es ejecutable y verificado (Plan Checker +
Probe Core con predicados determinísticos). El SDD de forge es sólido en el gate
de **entrada** (`pre-edit-check.js` bloquea editar sin spec APPROVED) pero la
verificación de **salida** contra la spec es manual.

`forge eval` ya es un scorer puro de 8 categorías. El mismo patrón sirve para
validar que una spec sea **verificable** (criterios de aceptación reales, no prosa
ambigua), análogo a Probe Core de GSD pero sin LLM ni red.

## Decisión

1. **Lib pura `lib/spec-probe.ts`** con `probeSpec(specMd)` que devuelve
   `{score, grade, checks[], notes[]}`. Chequeos determinísticos:
   - hay sección "Criterios de aceptación" y no está vacía;
   - los criterios son checklist verificables (`- [ ]`), no prosa;
   - la tabla "Alternativas consideradas" tiene "Descartada por" resuelto;
   - el estado (`DRAFT|REVIEW|APPROVED|IMPLEMENTED`) es un valor único, no el menú;
   - hay "Contexto" y "Decisión" no vacíos.
2. **Comando `forge spec-probe <path>` (o `forge eval --spec <path>`)** que imprime
   el reporte y soporta `--json`. Reusa el estilo de `commands/eval.ts`.
3. Se puede enganchar como **warn** en `post-turn-check.js` al cerrar una feature.
4. Se posiciona explícitamente como **gate de completitud de spec**, no de
   correctitud de implementación (no promete verificación backward-from-goal).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Verificación backward-from-goal con LLM (como GSD) | Verifica salida real | LLM, no determinístico, fuera de la filosofía de forge | Rompe el modelo offline |
| Solo mantener el gate de entrada | Cero esfuerzo | Specs ambiguas pasan sin chequeo de calidad | El probe estructural es barato y valioso |

## Criterios de aceptación

- [ ] `probeSpec()` es puro y determinístico, devuelve score 0–100 + grade + checks.
- [ ] `forge spec-probe <path> [--json]` imprime el reporte y exit 0.
- [ ] Un spec bien formado (p. ej. SPEC-061) puntúa alto; uno con criterios en prosa, bajo.
- [ ] Tests del probe sobre fixtures (buena/mala spec).
- [ ] Suite completa verde.

## Impacto de compliance

Ninguno. Lee un archivo de spec local.
