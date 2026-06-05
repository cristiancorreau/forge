# SPEC-041 Python Sunset — eliminar la CLI Python legacy (v3.0.0)

> Estado: APPROVED
> Responsable: forge-migration-engineer
> Creada: 2026-06-05 | Actualizada: 2026-06-05

## Contexto

La CLI de forge es **100% TypeScript desde la v2.8.0** y se ejecuta con
`npx @cristiancorreau/forge` (Node 20+, sin Python). El `forge.py`, los
`scripts/*.py`, la suite `tests/*.py` (pytest) y `requirements.txt` son la
implementación **legacy** y ya no forman parte del producto publicado en npm
(`packages/cli/scripts/build-assets.mjs` excluye todos los `.py` del bundle).

MIGRATION.md definió el timeline de sunset: el código Python se elimina en un
release **mayor** (semver), nunca dentro de la serie v2.x. Este es ese release:
**v3.0.0**, breaking. Mantener el código Python muerto en el repo confunde a los
nuevos contribuidores, duplica la superficie de mantenimiento y deja docs con
flujos `python3 .agentic/forge.py` que ya no aplican.

> **Importante:** `Python` como **lenguaje de stack** (profiles FastAPI / Flask /
> Django + sus agentes Tier 2, detección de `requirements.txt`/`pyproject.toml`,
> allowlist `Bash(python3 *)` para proyectos Python) **se mantiene**. Esta spec
> remueve únicamente la **CLI** Python legacy.

## Decisión

Ejecutar el sunset completo de la CLI Python para v3.0.0 (breaking):

1. **Eliminar código Python (git rm):** `forge.py`, los 11 `scripts/*.py`, los 19
   `tests/*.py`, `requirements.txt` y `scripts/team-install.sh` (helper del flujo
   legacy por submódulo). Quitar los directorios `tests/` y `scripts/` si quedan
   vacíos.
2. **CI:** eliminar `.github/workflows/tests-legacy.yml` (job pytest). `tests.yml`
   (Node 20/22 en ubuntu + windows-latest) queda como único gate de tests;
   `release.yml` sin cambios (no referencia Python).
3. **Shipping product:** confirmar que `packages/cli/src`, `build-assets.mjs`,
   `package.json` y los workflows no referencian la CLI Python removida. La CLI TS
   construye y testea con cero Python presente.
4. **Docs:** quitar las notas de deprecación y las referencias al flujo legacy
   `python3 .agentic/...` de README.md, docs/team-install.md, docs/guide.md,
   docs/runtimes/{kiro,codex,opencode}.md y docs/RELEASE-CHECKLIST.md. Convertir
   MIGRATION.md a nota **histórica** ("la CLI Python fue removida en v3.0.0").
5. **Version bump a 3.0.0** en las **4** fuentes restantes (package.json,
   version.ts, manifest.json, .forge/manifest.json) + entrada de CHANGELOG con
   sección `### Removido` (breaking).
6. **Test de permanencia:** asegurar que `forge.py` y `scripts/*.py` ya no existen
   (el sunset es definitivo) y cablearlo al script de tests.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Mantener Python deprecado en v2.x | Sin breaking | Código muerto, docs confusas, doble mantenimiento | El producto ya es 100% TS; no aporta valor |
| Remover Python en un minor (v2.x) | Limpieza temprana | Viola semver (es breaking) | El sunset solo ocurre en un major |
| Remover también Python como stack-language | Repo más chico | Rompe FastAPI/Flask/Django, que son producto | Python-stack es soportado y se mantiene |

## Criterios de aceptación

- [ ] `forge.py`, `scripts/*.py` (11), `tests/*.py` (19), `requirements.txt` y
      `scripts/team-install.sh` eliminados vía `git rm`.
- [ ] `tests/` y `scripts/` removidos si quedan vacíos.
- [ ] `.github/workflows/tests-legacy.yml` eliminado; `tests.yml` único gate.
- [ ] `cd packages/cli && npm run build:all && npm test` → verde (incl. windows-compat,
      adopt, wizard y el test de assets "zero Python in bundle").
- [ ] Un test asserta que `forge.py` y `scripts/*.py` ya no existen, cableado al `test` script.
- [ ] grep: 0 referencias a `forge.py` / `scripts/*.py` / `requirements.txt` (de forge) /
      `python3 .agentic` fuera de CHANGELOG/MIGRATION históricos y docs de Python-stack.
- [ ] Coherencia de versión: las 4 fuentes (package.json, version.ts, manifest.json,
      .forge/manifest.json) leen `3.0.0`.
- [ ] CHANGELOG con entrada `## [3.0.0] — 2026-06-05` y sección `### Removido` (breaking).
- [ ] Python como lenguaje de stack intacto (profiles FastAPI/Flask/Django + agentes).

## Impacto de compliance

No aplica (sin impacto de compliance).

## Dependencias

- Cierra el Epic #76 (sunset de Python).
- Follow-ups #71–#75 son independientes de este sunset.

## Notas de implementación

- Cambio **breaking** → release mayor `v3.0.0`. Cualquier usuario que aún invoque
  `python3 .agentic/forge.py` debe migrar a `npx @cristiancorreau/forge`.
- `core/hooks/*.py`, `hooks/pre-commit` (token-stats) y demás `.py` fuera del scope
  explícito del epic se excluyen del bundle por `build-assets.mjs` y no afectan al
  producto publicado; se dejan fuera de esta spec.
