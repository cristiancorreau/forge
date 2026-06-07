# SPEC-051 `forge recommend` — advisor read-only de un solo motor

> Estado: PROPOSED
> Responsable: forge-cli-engineer
> Creada: 2026-06-06 | Actualizada: 2026-06-06
> Issue: #106 · Epic: #104 · Bloqueada por: SPEC-050 (catálogo unificado)

## Contexto

El wedge de la decisión del board: el diferenciador frente a `claude-code-setup`
(el recomendador read-only oficial de Anthropic, +155k installs) es que forge
**aconseja y además aplica/mantiene**, multi-runtime. `recommend` es el on-ramp
seguro que termina aplicando.

El board fue explícito: `recommend`, `analyze`, `advise`, `adopt --preview` y el
skill del plugin son **un solo motor** expuesto en varias superficies. Construir
comandos separados con scoring duplicado es el anti-objetivo ("3 a medias").

## Decisión

### Motor (una función pura)
`packages/cli/src/lib/recommend.ts` exporta una función pura que combina:
1. `detectStack()` (`detect.ts`) → señales del proyecto.
2. el `audit`/`findOpportunities` existente → huecos de config.
3. match contra el **catálogo unificado** (SPEC-050) → candidatos por categoría.

Devuelve, por categoría, los mejores 1-2 (expandible) con `score` y un `why`
**anclado en la señal de detección** que disparó la recomendación. Sin opinión:
cada `why` cita la señal (p.ej. `postgres → MCP postgres`, `Dockerfile → MCP docker`,
`fastapi → profile fastapi`, CI → `claude-code-action`).

### Superficies (delegan en el motor, cero scoring duplicado)
1. **CLI**: `forge recommend [--category mcp|skill|profile|hook|template] [--json] [--top N] [--apply]`
2. **`forge adopt --preview`**: front-end del mismo motor (alias semántico de
   `--dry-run`); muestra el plan sin escribir.
3. **MCP/plugin skill**: la misma función como tool read-only.

### Reglas
- **Read-only por default.** `--apply` explícito y **solo** vía `installItem()`
  sobre entradas `installable: true`.
- Entradas no instalables (MCP servers, etc.): se muestran con etiqueta
  **"manual install"** + su `installSpec`; **nunca** se ofrece `--apply` sobre ellas.
- Salida **top 1-2 por categoría**, `--top N` expande. `--json` con contrato estable.

## No-objetivos
- Empaquetado de marketplace/plugin (canal aparte, Later).
- Telemetría de cualquier tipo (descartada por el board).
- Reescritura de `detect.ts`.

## Criterios de aceptación
- [ ] `lib/recommend.ts` es una función pura; las 3 superficies delegan en ella (un
      test verifica que no hay scoring/match duplicado fuera del módulo).
- [ ] `forge recommend` read-only por default; `--category`, `--top`, `--json` funcionan;
      `--json` con shape estable y testeado por snapshot.
- [ ] Cada recomendación incluye `why` citando la señal de `detect.ts`.
- [ ] `--apply` reusa `installItem()`; no-instalables → "manual install" + `installSpec`,
      jamás `--apply`.
- [ ] `forge adopt --preview` reusa el mismo motor (no reimplementa el plan).
- [ ] Dogfood sobre 5+ repos reales documentado antes de exponer el comando.
- [ ] `tsc` + `npm test` verdes (incl. Windows).

## Dependencias
**Bloqueada por** SPEC-050: no se empieza a codear hasta que exista un único catálogo
con flag `installable`.

## Impacto de compliance
No aplica. Read-only por default; `--apply` reusa el camino idempotente/reversible
existente (`installItem` + `manifest` SHA-256). No introduce red ni telemetría.
