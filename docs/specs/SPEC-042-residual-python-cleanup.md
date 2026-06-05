# SPEC-042 Residual Python Cleanup — barrer los restos del sunset (#78)

> Estado: APPROVED
> Responsable: forge-migration-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

La CLI Python legacy se eliminó en **v3.0.0** (SPEC-041 / Epic #76): `forge.py`,
`scripts/*.py`, `tests/*.py` y `requirements.txt` ya no existen. SPEC-041 dejó
**fuera de su scope explícito** (ver su nota de implementación) algunos archivos
Python residuales y referencias instruccionales al CLI/submódulo removidos. El
issue **#78** es ese mopping-up: dejar el repo prácticamente *grep-clean*.

Residuales que quedan:

- `hooks/pre-commit` — git-hook bash que invoca el ya-removido
  `scripts/token-stats.py` y menciona el submódulo legacy `.agentic/`. **Sí** se
  empaqueta (`build-assets.mjs` copia `hooks/`) y está registrado en
  `manifest.json`. La CLI TS genera su propio `.githooks/pre-commit` (POSIX sh,
  cero Python) desde `packages/cli/src` — este archivo de la raíz está huérfano.
- `core/hooks/pre-bash-check.py` y `core/hooks/pre-edit-check.py` — copias Python
  legacy de los hooks. El registry (`core/hooks/hooks-registry.yaml`) y la CLI ya
  usan las versiones `.js`/`.sh`; las `.py` se excluyen del bundle por
  `build-assets.mjs` pero ensucian el repo.
- Referencias **instruccionales** que aún enseñan a usar el CLI/submódulo
  removidos (`python3 .agentic/scripts/*.py`, `forge.py`) en `project.yaml`,
  `CONTRIBUTING.md`, los agentes dogfood `.claude/agents/forge-*.md` y varios
  `docs/`.

> **Importante:** `Python` como **lenguaje de stack** (profiles FastAPI / Flask /
> Django + sus comandos `python3`/`pytest`/`pip`) **se mantiene**. Los **registros
> históricos** (CHANGELOG, MIGRATION, SPEC-041, SPEC-032, `docs/analysis/v*`,
> `docs/plan/*`, `docs/migration/v1-to-v1.5.md`) **se conservan** intactos.

## Decisión

1. **Eliminar archivos Python residuales (git rm):**
   - `hooks/pre-commit` + su entrada en `manifest.json` (objeto
     `{ id: "pre-commit", file: "hooks/pre-commit", … }`). Si `hooks/` queda
     vacío, eliminar el directorio.
   - `core/hooks/pre-bash-check.py` y `core/hooks/pre-edit-check.py`.
2. **Actualizar referencias instruccionales** a la realidad del CLI TS:
   - `project.yaml` — comentarios `forge.py`/`scripts/` y `language`.
   - `CONTRIBUTING.md` — `python3 .agentic/scripts/*.py` → comandos `npx
     @cristiancorreau/forge …`; tests → `npm test` del CLI.
   - `.claude/agents/forge-{migration,cli,init,audit,catalog}-*.md` — scope y
     ejemplos al CLI TS (migración completada: sin `forge.py`).
   - `docs/project-yaml-v2-reference.md`, `docs/runtimes/README.md`,
     `docs/runtimes/codex.md`, `docs/RELEASE-CHECKLIST.md`.
3. **Tests de permanencia:** extender `packages/cli/test/python-sunset.test.mjs`
   para asegurar que `hooks/pre-commit` y los dos `core/hooks/*.py` no existen,
   que `manifest.json` no tiene la entrada `pre-commit`, y que el bundle
   publicado (`packages/cli/assets/`) no contiene Python ni el hook pre-commit.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Dejar los residuales (estaban fuera de SPEC-041) | Cero trabajo | Repo no grep-clean, hook huérfano publicado, docs que enseñan flujos muertos | El epic #76 buscaba un sunset completo; #78 lo cierra |
| Eliminar también Python-stack y los históricos | Repo más chico | Rompe FastAPI/Flask/Django (producto) y borra trazabilidad | Python-stack es soportado; los históricos son registro |
| Reescribir `hooks/pre-commit` a JS en vez de borrarlo | Mantiene un hook en la raíz | Duplica el `.githooks/pre-commit` que ya genera el CLI | Redundante — el CLI ya provee el fallback |

## Criterios de aceptación

- [ ] `hooks/pre-commit`, `core/hooks/pre-bash-check.py` y
      `core/hooks/pre-edit-check.py` eliminados vía `git rm`. `hooks/` eliminado
      si queda vacío.
- [ ] `manifest.json` sin la entrada de hook `pre-commit`.
- [ ] `cd packages/cli && npm run build:all && npm test` → verde (incl. windows,
      adopt, wizard y assets "zero Python in bundle").
- [ ] `python-sunset.test.mjs` asserta: los 3 archivos no existen, el manifest no
      tiene `pre-commit`, y el bundle no contiene `.py` ni `hooks/pre-commit`.
- [ ] grep: 0 referencias **instruccionales** a `forge.py` / `scripts/*.py` /
      `.agentic` fuera de los registros históricos y de Python-stack.
- [ ] Python como lenguaje de stack intacto (profiles FastAPI/Flask/Django).

## Impacto de compliance

No aplica (sin impacto de compliance).

## Dependencias

- Continúa SPEC-041 (que cerró el grueso del sunset). Cierra el issue **#78**.

## Notas de implementación

- Se confirmó que nada en `packages/cli/src` consume el array `hooks[]` de
  `manifest.json` ni el archivo `hooks/pre-commit`: la CLI genera su propio
  `.githooks/pre-commit` (cero Python) en `src/commands/generate.ts`.
- `docs/runtimes/codex.md` conserva `python3 -m py_compile` como **check de
  stack** (al lado de PHP/Ruby): es Python-as-stack, no el CLI removido.
- `docs/RELEASE-CHECKLIST.md` mantiene la línea que **verifica la ausencia** de
  referencias al CLI Python legacy (es un guard, no una instrucción de uso).
