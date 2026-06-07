# SPEC-055 Bundle conversacional en `forge recommend`

> Estado: DRAFT
> Responsable: forge-cli-engineer
> Creada: 2026-06-07 | Actualizada: 2026-06-07
> Origen: análisis de `asm` (find-me-skills) · Fase: Next · Depende de: SPEC-051

## Contexto

`forge recommend` (SPEC-051) ya es el wedge: un motor read-only que, a partir de
`detect.ts`, propone items con un `why` anclado en la señal. Funciona cuando el
usuario sabe leer la salida por categoría. El análisis de `asm` mostró
`find-me-skills`: un on-ramp **conversacional intent-based** para el usuario que
tiene un objetivo pero **no sabe qué pedir**, que termina exportando un **bundle**
(plan multi-skill) que el instalador consume.

Forge tiene el motor pero no el on-ramp conversacional ni un artefacto "plan"
exportable. El gap es de UX de entrada, no de motor.

## Decisión

### Capa conversacional (no un motor nuevo)
`forge recommend --interactive` (o `forge recommend --intent "<texto>"`) agrega
una capa sobre el motor existente (`lib/recommend.ts`), **sin scoring nuevo**:

1. **Capturar intent**: pregunta abierta del objetivo (o lo toma de `--intent`).
2. **Confirmar entendimiento**: replantea el objetivo y pide validación antes de
   recomendar (evita recomendaciones equivocadas).
3. **Recomendar**: llama al motor `recommend()` existente; el `why` sigue anclado
   en `detect.ts` + el intent. Nunca inventa items fuera del catálogo unificado.
4. **Secuenciar**: ordena por dependencias y explica cada paso en una frase.
5. **Exportar bundle**: escribe un `RecommendBundle` (JSON estable) con los items
   elegidos + su `why` + el origen (señal/intent).

### El bundle (artefacto)
`RecommendBundle` es un plan declarativo:
```json
{
  "createdFrom": { "intent": "...", "signals": ["postgres", "ci:github-actions"] },
  "items": [{ "id": "...", "category": "mcp|skill|profile|hook|template",
              "installable": true, "why": "...", "installSpec": "..." }]
}
```
- `forge recommend --apply <bundle.json>` lo consume y aplica **solo** los
  `installable: true` vía `installItem()` (reversible, idempotente). Los no
  instalables se muestran con "manual install" + `installSpec` (nunca `--apply`).

### Reglas
- **Un solo motor**: la capa conversacional delega en `recommend()`; cero scoring
  duplicado (test lo verifica).
- Read-only por default; `--apply` explícito y solo vía `installItem()`.
- Nunca inventa items: todo sale del catálogo unificado (SPEC-050).
- Cero telemetría. El intent no se persiste fuera del bundle local.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Solo salida por categoría (status quo) | simple | inútil si el usuario no sabe qué pedir | no cubre el on-ramp |
| Chatbot LLM libre | flexible | no determinístico, puede inventar items | viola "nunca inventa / un motor" |
| **Capa conversacional + bundle sobre el motor** | reusa motor, plan reversible | otra superficie que mantener | **elegida** |

## Criterios de aceptación
- [ ] `forge recommend --interactive`/`--intent` delega en `recommend()` (sin scoring nuevo; test).
- [ ] Paso de confirmación del intent antes de recomendar.
- [ ] Exporta `RecommendBundle` con shape estable (snapshot-test); `why` anclado en señal/intent.
- [ ] `forge recommend --apply <bundle>` instala solo `installable: true` vía `installItem()`.
- [ ] No instalables → "manual install" + `installSpec`, jamás `--apply`.
- [ ] `tsc` + `npm test` verdes (incl. Windows).

## Dependencias
**Bloqueada por SPEC-051** (motor `recommend`) y SPEC-050 (catálogo unificado).

## Impacto de compliance
No aplica. Read-only por default; `--apply` reusa el camino reversible
(`installItem` + manifest SHA-256). Sin telemetría; el intent queda local en el bundle.

## Notas de implementación
Referencia del flujo: `asm/skills/find-me-skills/SKILL.md` (6 pasos: intent →
confirmar → discover → curar → secuenciar → exportar bundle).
