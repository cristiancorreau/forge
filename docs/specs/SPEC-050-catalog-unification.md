# SPEC-050 Unificación del catálogo (una fuente, flag `installable`)

> Estado: PROPOSED
> Responsable: forge-cli-engineer
> Creada: 2026-06-06 | Actualizada: 2026-06-06
> Issue: #105 · Epic: #104 · Bloquea: SPEC-051 (`forge recommend`)

## Contexto

El board (jun 2026) ratificó la tesis "Compile, don't recommend" **condicionada** a
que exista **un solo motor**. El red-team verificó que hoy el repo la contradice:
coexisten **dos catálogos y dos implementaciones de búsqueda divergentes**.

| Fuente | Contenido | Búsqueda | Instalable |
|--------|-----------|----------|------------|
| `packages/cli/src/lib/catalog-install.ts` | `CatalogItem` (`'skill' \| 'profile' \| 'template'`); ~23 skills + profiles + templates bundleados | `searchCatalog()` (línea 125) | **Sí**, vía `installItem()` (línea 614) |
| `packages/cli/src/commands/aitmpl-search.ts` | su **propio** `interface CatalogItem` + `const CATALOG` (~51 MCP servers/tools con `InstallSpec`/URLs, línea 59) | scoring propio (líneas 681+) | **No** (manual / `claude mcp add`) |

Consumidores actuales: `searchCatalog` → `tui/panel.ts`, `commands/panel.ts`.
`aitmpl` `CATALOG` → `cli.ts`, `tui/dashboard.ts`. Ya driftean.

Construir `forge recommend` (SPEC-051) sobre este estado lo haría nacer como
**tercer motor** — el riesgo "3 advisors a medias" que el board marcó. Por eso esta
unificación es **gate de release físico**: se mergea **antes** de escribir `recommend`.

## Decisión

Una **única fuente de verdad** del catálogo, con instalabilidad explícita.

### Modelo de datos
- Un solo `CatalogItem` unificado con:
  - `type`: `'skill' | 'profile' | 'template' | 'mcp' | 'tool'`
  - `installable: boolean` (derivado o explícito)
  - `installSpec?`: para entradas no instalables vía forge (comando/URL, p.ej.
    `claude mcp add <name> ...`), de modo que la UI pueda mostrar el "manual install".
  - los metadatos comunes ya presentes (id, category, purpose/description, trigger…).
- Las ~51 entradas de `aitmpl-search` se reexpresan en este modelo con
  `installable: false` + `installSpec`; las ~23 de `catalog-install` con
  `installable: true`.

### Motor de búsqueda
- **Una** función de búsqueda/scoring compartida (un solo `searchCatalog`) que
  reemplaza tanto a `searchCatalog` como al scoring de `aitmpl-search`.
- Todos los consumidores (panel, dashboard, `forge aitmpl-search`, y el futuro
  `recommend`) leen la fuente unificada a través de esa función.

### Reglas duras
- Las entradas **no instalables nunca prometen `--apply`/`installItem`**: se
  etiquetan "manual install" y exponen su `installSpec`.
- `installItem()` sigue siendo el único camino de instalación para `installable: true`.

## No-objetivos
- `forge recommend` en sí (SPEC-051): esta spec solo deja **un** catálogo + **un** motor.
- Reescribir `detect.ts` (descartado por el board).
- Canary de URLs del catálogo (va a Next, issue aparte): validar HTTP 200 de las URLs
  de terceros. Relevante pero fuera de alcance acá.
- Externalizar el catálogo a un registry firmado (Later, SPEC futura).

## Criterios de aceptación
- [ ] Una sola definición de catálogo y un solo motor de búsqueda en el repo; el PR
      **borra o fusiona** el segundo (no queda `CATALOG`/scoring duplicado en `aitmpl-search.ts`).
- [ ] Cada entrada declara `installable` y, si no lo es, un `installSpec`.
- [ ] `tui/panel.ts`, `commands/panel.ts`, `tui/dashboard.ts` y `forge aitmpl-search`
      migrados a la fuente/función unificada sin pérdida de funcionalidad.
- [ ] Tests: paridad de resultados de búsqueda (las queries existentes siguen
      devolviendo lo mismo) + snapshot; **un test que falle si reaparece un segundo
      catálogo o motor de búsqueda** (guard anti-regresión).
- [ ] `tsc` + `npm test` verdes (incl. Windows). Sin cambios de comportamiento
      observables salvo la disponibilidad del flag.

## Impacto de compliance
No aplica. No cambia datos de usuario ni el canal de distribución; es refactor interno
del catálogo + su API de búsqueda.
