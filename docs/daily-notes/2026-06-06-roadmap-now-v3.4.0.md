# Session 2026-06-06 — roadmap-now-v3.4.0

## Completado

- **Workshop de estrategia + board directivo** (multi-agente): tesis "Compile, don't recommend", roadmap NOW/Next/Later, playbook de canales y decisión vinculante con conflictos resueltos. Hallazgos de código verificados (dos catálogos divergentes, `NPM_TOKEN` long-lived, `migrate` backup opt-in, paridad cross-runtime degradada).
- **i18n / README por defecto en inglés** (v3.3.0 / v3.3.1) — multi-idioma ES/EN del CLI + docs bilingües; `README.md` pasa a inglés, español en `README.es.md`.
- **#108 `forge migrate`** — backup por default (`--no-backup` para optar a no) + `schema_version` machine-readable. (PR #111)
- **#105 catálogo unificado** (SPEC-050) — una sola fuente (`lib/catalog-unified.ts`) + un motor `scoreCatalog`; gate de `recommend`. Verificado adversarialmente (50/50 entradas preservadas). (PR #114)
- **#106 `forge recommend`** (SPEC-051) — advisor read-only stack-aware (`lib/recommend.ts`), WHY anclado en `detect.ts`, `--apply` vía `installItem`. Dogfood en 5 stacks. (PR #115)
- **#109 marcador North Star** — `# generated-by: forge vX.Y.Z` en project.yaml generado + `docs/north-star.md`. (PR #116)
- **v3.4.0 publicado a npm** (PR #117) — verificado: `npx`, `forge recommend`, 3 installs, GitHub Release.
- **#107 OIDC Trusted Publishing** — `release.yml` migrado, sin `NPM_TOKEN`. (PR #110, issue cerrada)
- **#73 extensión VS Code 0.6.0** — comando `forge: Recommend` + fix de regresión (Search Catalog leía `name`, el catálogo unificado emite `label`); compila + empaqueta; `.vsix` sideloadeable adjunto al release v3.4.0. (PR #118)
- **#74 bordes ASCII en Windows legacy** — las 9 cajas OpenTUI usan `customBorderChars` gateado por `useAscii()` (aditivo, cero regresión). (PR #119)

## Archivos modificados

PRs de la sesión: #100–#119 (i18n, catálogo unificado, recommend, marker, migrate, OIDC, vscode, windows). Detalle por commit abajo.

## Commits

```
f6edc96 feat(tui): ASCII box borders on legacy Windows consoles (#74) (#119)
67b4ebb chore(ci): publish via OIDC Trusted Publishing, drop NPM_TOKEN (#110)
b2cd750 fix(vscode): add forge.recommend + fix catalog search for unified output (#73) (#118)
36964d8 chore(release): v3.4.0 (#117)
10cf969 feat(marker): stamp a North Star marker in generated project.yaml (#109) (#116)
c90e51b feat(recommend): forge recommend — stack-aware advisor, one engine (SPEC-051) (#115)
40f9117 feat(catalog): unify the two catalogs into one model + one engine (SPEC-050) (#114)
```

## Decisiones tomadas

- **"Compile, don't recommend"** ratificado como arquitectura (no como hero de copy): forge compila config agéntica; el wedge es `recommend` que aplica, no solo aconseja.
- **Unificar el catálogo es gate físico** de `recommend` (evita un tercer motor) — se mergeó antes de codear `recommend`.
- **WHY siempre anclado en `detect.ts`** (no opinión); `--apply` solo vía `installItem`; no-instalables → "manual install".
- **Marketplace oficial de Anthropic = no-go** (riesgo de marca con bus-factor 1); distribución por marketplace propio + MCP.
- **OIDC sin token long-lived**; medición de adopción sin telemetría (marcador + GitHub code search).

## Blockers para próxima sesión

Tres residuales, todos gated en acción del usuario (no código pendiente):
- **#73** — publicar al Marketplace necesita un `VSCE_PAT` (credential de Azure DevOps + secret del repo). 0.6.0 ya sideloadeable; disparo el tag apenas exista el secret.
- **#74** — validación **visual** del render OpenTUI en una terminal Windows real + glifos de contenido restantes (marcas de estado, iconos Nerd Font, emoji). Los bordes ya están.
- **Rúbrica before/after** — necesita sesiones en vivo de Claude Code sobre 5 repos (CON vs SIN forge). Protocolo en el epic #104.
- **#107 (cerrado)** deja un prerequisito de runtime: configurar el Trusted Publisher en npmjs.com antes del próximo release.
