# SPEC-061 `forge analyze` + skill `/onboard` — adoptar y documentar un repo existente

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

forge ya sabe **instalar en un proyecto existente** (`forge adopt`: detecta el
stack, genera `project.yaml`, instala agentes/hooks/comandos y siembra un wiki
**factual**). Lo que falta es el on-ramp para **analizar el código con los
agentes especializados** y **producir documentación real** (arquitectura,
onboarding, revisión de seguridad), más allá de los hechos detectados.

Hoy los agentes (`security-auditor`, `docs-writer`, ingenieros por stack)
existen pero son de invocación manual, y `forge audit` solo valida la
instalación de forge, no el código. Resultado: adoptar un repo deja config lista
pero no una vista comprensible del proyecto para un dev nuevo.

## Decisión

Dos piezas complementarias:

1. **`forge analyze [path] [--json] [--write]`** — comando CLI **determinístico y
   offline** (`lib/code-analysis.ts`, función pura sobre `analyzeProject`):
   - Reusa el análisis de stack/estructura/deps/scripts/entrypoints existente.
   - Agrega señales mecánicas: hotspots (top directorios por cantidad de archivos
     y archivos fuente más grandes), conteo de marcadores `TODO/FIXME/HACK/XXX`,
     presencia de tests, resumen de lenguajes, y los **agentes sugeridos** según
     el stack detectado.
   - Imprime un reporte legible; `--json` para máquina; `--write` guarda
     `docs/analysis/<fecha>-analysis.md` y apunta al skill `/onboard` para la
     síntesis con agentes.
   - No ejecuta agentes ni LLM: es el sustrato factual reproducible.

2. **Skill `/onboard`** (`core/skills/onboard/SKILL.md`) — skill de orquestación
   multi-runtime que:
   - Corre `forge analyze --json` para el mapa factual.
   - Despacha a los agentes especializados para **leer el código** y escribir:
     `docs/architecture.md` (docs-writer), `docs/onboarding.md` (docs-writer),
     `docs/security-review.md` (security-auditor), y notas por módulo (ingenieros
     del stack).
   - Alimenta el wiki semántico vía `/wiki-ingest`.
   - Incluye las tres secciones de resiliencia (SPEC-060) y pasa el gate de
     `forge eval`.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Solo el skill `/onboard` | Menos código | Sin sustrato factual reproducible ni entrada CLI | El usuario pidió explícitamente el comando |
| Solo `forge analyze` | Determinístico, testeable | No produce la documentación sintetizada (lo más útil) | Falta la mitad del valor |
| Hacer que `forge audit` analice código | Reusa comando | Mezcla "validar forge" con "analizar repo" | Conceptos distintos; ensucia audit |

## Criterios de aceptación

- [ ] `forge analyze` corre sobre un repo y emite reporte legible + `--json` estable.
- [ ] `analyzeCode()` es pura y determinística (mismo repo → misma salida; sin fecha/red).
- [ ] `--write` guarda `docs/analysis/<fecha>-analysis.md` y referencia `/onboard`.
- [ ] `forge analyze` está registrado en el dispatcher y en el help.
- [ ] Skill `/onboard` existe, está en el catálogo (`SKILLS`) y en `manifest.json`, e instala en `.claude/...`.
- [ ] `/onboard` pasa su gate de `forge eval` (overall ≥ 75, piso ≥ 6, incluida `resilience`).
- [ ] Tests: `analyzeCode()` sobre un fixture (estructura/TODOs/hotspots) y el skill pasando su gate.
- [ ] Suite completa verde.

## Impacto de compliance

Ninguno. `forge analyze` solo lee el repo local y escribe documentación; no envía
datos a terceros ni ejecuta LLM por sí mismo.
