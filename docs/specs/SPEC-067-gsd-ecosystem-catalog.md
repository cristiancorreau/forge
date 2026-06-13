# SPEC-067 Integrar el ecosistema GSD en el catálogo

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

Del análisis vs Open GSD: `gsd-browser` (automatización de browser via CDP) y
`gsd-test-runner` (runner remoto multi-OS) son categorías ausentes en forge.
Reconstruirlas está fuera del scope de forge (compilador). La vía correcta es
**integrarlas vía el catálogo unificado** y que `forge recommend` las sugiera por
stack — forge integra el ecosistema en vez de reconstruirlo.

## Decisión

1. Agregar a `RAW_CURATED` en `packages/cli/src/lib/catalog-unified.ts`:
   - `gsd-browser` como `mcp-server` (curado, externo) con su `url` y tags
     (`browser`, `e2e`, `cdp`, `automation`, `mcp`).
   - `gsd-test-runner` como `tool` (curado, externo) con su `url` y tags
     (`testing`, `remote`, `docker`, `multi-os`).
2. Extender `collectSignals()` en `packages/cli/src/lib/recommend.ts`: si el stack
   tiene `frontend` y testing E2E (`playwright`), sugerir `gsd-browser` (score alto).
3. Marcarlos como integraciones de terceros (curados, no construidos por forge).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Reconstruir browser/test-runner en forge | Control total | Fuera de scope; enorme | forge es compilador, no runtime |
| No integrarlos | Cero esfuerzo | Deja el gap abierto sin razón | Integrar vía catálogo es barato |

## Criterios de aceptación

- [ ] `gsd-browser` y `gsd-test-runner` aparecen en el catálogo unificado con sus tags/url.
- [ ] `forge recommend` sugiere `gsd-browser` ante frontend + E2E.
- [ ] Test del catálogo/recommend que cubre la sugerencia.

## Impacto de compliance

Ninguno. Son entradas de datos curadas hacia repos de terceros.
