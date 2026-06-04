# Spec gate — flujo spec-first end-to-end

> Estado: documentación de referencia · Issue: #28

Este documento explica la **barrera spec-first** de forge para desarrolladores
nuevos: qué la activa, cómo satisfacerla y cómo endurecerla. El principio es
**backward-compatible y opt-in**: por defecto el gate **advierte** (no rompe el
CI verde ni bloquea merges); el bloqueo duro es una decisión explícita del
proyecto.

## TL;DR

1. Creá una spec en `docs/specs/` y pasala a `Estado: APPROVED`.
2. Trabajá en una rama feature (`feat/...`).
3. Editá código. El hook `pre-edit-check` verifica que exista una spec APPROVED.
4. Referenciá la spec en el cuerpo del PR (`docs/specs/<id>-<slug>.md`).
5. Ejecutá `/review` y mergeá solo con veredicto APPROVED.

## Capas del gate

El gate es **defensa en profundidad**. Ninguna capa bloquea por defecto salvo
que el proyecto lo habilite explícitamente.

| Capa | Dónde | Comportamiento por defecto | Cómo se endurece |
|------|-------|----------------------------|------------------|
| Edición local | `core/hooks/pre-edit-check.js` / `.py` | **Advierte** si no hay spec APPROVED | `mode: enterprise` + `rules.require_spec_before_implementation: true` → **bloquea** la edición |
| PR / CI | `.github/workflows/spec-gate.yml` | **Informativo** (no falla) | Convertir el check en `required` (branch protection) |
| Plantilla de PR | `.github/pull_request_template.md` | Campos para spec y review status | — |
| Review | `/review` + `.claude/review-status.json` | El reviewer tiene poder de veto | — |

## Capa 1 — Hook de edición (`pre-edit-check`)

Al editar un archivo de **código** (`.js`, `.ts`, `.py`, `.go`, etc.) en una
**rama feature** (no `main`/`master`/`develop`), el hook busca en `docs/specs/`
al menos una spec con encabezado `Estado: APPROVED` (se ignoran `_template.md` y
`README.md`).

- **Sin spec APPROVED y modo por defecto** (`startup`/`standard`): imprime una
  **advertencia** y permite continuar (`exit 0`). El CI no se ve afectado.
- **Sin spec APPROVED en modo enterprise con el flag opt-in**: **bloquea** la
  edición (`exit 2`) con instrucciones para crear la spec.

Configuración que activa el bloqueo duro (en `project.yaml`):

```yaml
project:
  mode: "enterprise"
rules:
  require_spec_before_implementation: true
```

Las ediciones de documentación (`.md`, `.yaml`, `.json`, `docs/`, `.claude/`)
nunca activan el gate: podés redactar specs y docs sin fricción.

### Qué cuenta como spec APPROVED

Un archivo `docs/specs/<id>-<slug>.md` con una línea de encabezado como:

```
> Estado: APPROVED
```

El menú de la plantilla (`> Estado: DRAFT | REVIEW | APPROVED | IMPLEMENTED`)
**no** cuenta como aprobado: el valor debe nombrar `APPROVED` sin el separador
`|`. Usá `cp docs/specs/_template.md docs/specs/<id>-<slug>.md` como punto de
partida.

## Capa 2 — Workflow de CI (`spec-gate.yml`)

En cada PR a `main`, el workflow `spec-gate` revisa que el cuerpo del PR
referencie una spec con el patrón `docs/specs/<archivo>.md`.

- **Por defecto es informativo**: el job usa `continue-on-error: true` y termina
  con `exit 0`, así que **nunca bloquea el merge**. Emite un aviso
  (`::warning`) y una nota en el resumen del job.

### Hacerlo `required` (opt-in)

1. En `.github/workflows/spec-gate.yml`:
   - Quitá `continue-on-error: true` (o ponelo en `false`).
   - En el paso "Check spec reference", reemplazá el `exit 0` final por `exit 1`
     en la rama del `else` (cuando no hay spec).
2. En GitHub → **Settings → Branches → Branch protection rules** de `main`:
   - Activá *"Require status checks to pass before merging"*.
   - Agregá el check **`spec-gate / spec-reference`**.

A partir de ahí, un PR sin spec referenciada queda en rojo hasta agregarla.

## Capa 3 — Plantilla de PR

`.github/pull_request_template.md` precarga el cuerpo del PR con los campos
**Spec** y **Review status**, de modo que la referencia a la spec y la
confirmación de `/review` queden visibles en cada PR.

## Flujo completo (paso a paso)

1. **Crear la spec** — `cp docs/specs/_template.md docs/specs/<id>-<slug>.md`;
   completá Contexto, Decisión, Alternativas y Criterios de aceptación.
2. **Aprobar la spec** — pasá el encabezado a `Estado: APPROVED` (vía
   Planner-Critic si el proyecto es enterprise).
3. **Rama feature** — `git checkout -b feat/<tema>`; referenciá el spec ID en
   los mensajes de commit (ej: `[SPEC-028] ...`).
4. **Editar código** — el hook valida que exista la spec APPROVED.
5. **Abrir PR** — la plantilla pide la referencia a la spec; el check
   `spec-gate` la verifica (informativo por defecto).
6. **Review** — ejecutá `/review`; mergeá solo si `review-status.json` tiene
   veredicto APPROVED (sin veto de compliance).
7. **Cerrar** — pasá la spec a `Estado: IMPLEMENTED` y registrá notas de
   implementación.

## FAQ

**¿Esto rompe mi CI actual?** No. Todas las capas son advertencia/informativas
por defecto. El bloqueo es opt-in.

**Trabajo en `main` para docs, ¿me bloquea?** No. El gate solo aplica a archivos
de código en ramas feature; los docs están exentos.

**No uso enterprise, ¿me sirve?** Sí: recibís advertencias que recuerdan el
flujo sin imponer fricción.
