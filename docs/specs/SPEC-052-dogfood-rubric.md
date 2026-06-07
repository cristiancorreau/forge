# SPEC-052 Dogfood — rúbrica, protocolo y harness before/after

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-07 | Actualizada: 2026-06-07
> Issue: #104 (Epic) · Depende de: SPEC-050 (catálogo unificado), SPEC-051 (`forge recommend`)

## Contexto

Es el último item de fondo del Epic #104 y una de las 2 condiciones del gate
Now→Next que siguen abiertas. El board pidió un **artefacto before/after** que
demuestre el valor del wedge (`forge recommend` + Guardrail) sobre repos reales,
no una demo sintética. El motor ya existe (`lib/recommend.ts`, `lib/detect.ts`,
catálogo unificado); lo que falta es **medir** su efecto y dejar evidencia
reproducible.

Sin esto, la tesis "compile, don't recommend" queda como claim sin respaldo
empírico, y no podemos cerrar el gate ni comunicar el diferenciador con datos.

## Decisión

### Las 3 métricas de la rúbrica (definición del board)

| Métrica | Qué mide | Cómo se obtiene |
|---------|----------|-----------------|
| **turns-a-verde** | Nº de turnos de Claude Code hasta dejar el repo en verde (tests/lint/build) para una tarea fija | Sesión EN VIVO (con vs sin forge). No automatizable mecánicamente. |
| **% paths/comandos alucinados bloqueados por Guardrail** | De los comandos/paths inválidos que el agente intentó, qué % interceptó el Guardrail | Sesión EN VIVO + parseo de logs de hooks. Semi-automatizable. |
| **tests-a-la-primera** | ¿La suite del repo pasa sin intervención tras `forge init`? | **Automatizable** por el harness. |

### Separación máquina vs sesión en vivo

El harness **no inventa** lo que requiere una sesión humana/agente real. Mide lo
mecánico y deja los campos de sesión en vivo como `null` a completar:

**Automatizable (lo produce `scripts/dogfood.mjs`):**
1. **Detección de stack** correcta: `detectStack()` sobre el repo vs la verdad
   conocida (lenguaje, framework, gestor de paquetes, CI, DB).
2. **Output de `recommend`** read-only con su `why` anclado en `detect.ts`:
   nº de recomendaciones por categoría y que cada una cite su señal.
3. **Validez del plan**: `forge init`/`adopt` en **dry-run** produce un manifest
   válido (SHA-256), sin escribir en el repo objetivo.
4. **tests-a-la-primera**: si el repo declara una suite, correrla antes y
   registrar verde/rojo (baseline "before"; el "after" con forge se mide en sesión).

**Requiere sesión en vivo (campos del artefacto, no los llena el harness):**
- `turns_to_green` (con/sin forge)
- `guardrail_block_rate`

### El artefacto

`scripts/dogfood.mjs` genera `docs/analysis/dogfood-<fecha>.json` y un
`docs/analysis/dogfood-<fecha>.md` legible, con una fila por repo:

```
repo · stack_esperado · stack_detectado · detección_ok ·
recommend{mcp,skill,profile,hook,template} con why · plan_valido ·
tests_before · turns_to_green(null) · guardrail_block_rate(null)
```

### Los 5 repos (diversidad de stack, sin forge instalado)

| # | Repo | Stack |
|---|------|-------|
| 1 | `licitaciones-automation` | Python (pip / requirements.txt) |
| 2 | `llm-council` | Python (Poetry / pyproject.toml) |
| 3 | `leansup` | Node.js (Next.js fullstack) |
| 4 | `gobcl-wp` | WordPress / PHP |
| 5 | `claude-code-sourcemap` | TypeScript (CLI) |

Rutas bajo `/Users/skauch/Developer/Github/`. El harness toma la lista por
argumento/config, no hardcodea rutas absolutas en el repo.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Solo sesiones en vivo manuales | Mide las 3 métricas reales | No reproducible, costoso, sin baseline mecánico | Se complementa, no reemplaza |
| Harness 100% automático que "simula" turns-a-verde | Todo en CI | Inventa métricas que dependen del agente → vaporware | Viola "cero vaporware" |
| **Harness mecánico + campos de sesión en vivo** | Reproducible, honesto sobre qué mide la máquina | Las 2 métricas de agente quedan a llenar aparte | **Elegida** |

## Criterios de aceptación

- [ ] `scripts/dogfood.mjs` corre sobre N repos (lista por config), en dry-run,
      **sin escribir** en los repos objetivo.
- [ ] Para cada repo registra: stack esperado vs detectado (`detección_ok`),
      output de `recommend` por categoría con su `why`, validez del plan/manifest,
      y `tests_before`.
- [ ] Genera `docs/analysis/dogfood-<fecha>.{json,md}` con una fila por repo y los
      campos de sesión en vivo presentes como `null` (no inventados).
- [ ] Corrida real sobre los 5 repos del listado, artefacto commiteado.
- [ ] `tsc` + `npm test` verdes; el script no rompe en repos sin tests.

## No-objetivos

- Telemetría de cualquier tipo (descartada por el board).
- Escribir/modificar los repos objetivo (todo dry-run; el dogfood "real" en main
  ya se hizo vía SPEC-029).
- Reescritura de `detect.ts` o del motor de recommend.

## Dependencias

- **SPEC-050** (catálogo unificado) e **SPEC-051** (`forge recommend`): implementadas.
- Requiere el CLI compilado (`packages/cli/dist`).

## Impacto de compliance

No aplica. Read-only sobre repos ajenos; no introduce red, telemetría ni
persistencia fuera de `docs/analysis/`.

## Notas de implementación

(Se completa durante la implementación del harness.)
