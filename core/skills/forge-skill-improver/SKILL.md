---
name: forge-skill-improver
description: Improve an existing SKILL.md with forge eval until it passes the quality gate, fixing the weakest category each round. Don't use for creating a skill from scratch — use forge-skill-creator instead.
version: "1.0.0"
triggers:
  - /forge-skill-improver
  - "mejorar skill"
  - "optimizar skill"
  - "improve skill"
capabilities:
  fs_write: ["core/skills/", ".claude/skills/"]
  bash: ["forge eval"]
  network: false
---
# Skill: forge-skill-improver

Improve an existing `SKILL.md` with `forge eval` until it passes the quality
gate, fixing the weakest category each round. Don't use for creating a skill
from scratch — use `forge-skill-creator` for that.

Triggers: /forge-skill-improver, "mejorar skill", "optimizar skill", "improve skill"

## Cuándo usar este skill

Usalo cuando ya existe un `SKILL.md` y querés llevarlo de forma determinística al
estándar de calidad: `overallScore >= 75` con la categoría más débil `>= 6`. No
lo uses para crear una skill nueva; para eso está `forge-skill-creator`.

## Prerequisitos

Antes de empezar, verificá:

- El archivo objetivo existe y `forge eval --help` responde.
- Git está limpio o hay un backup: el loop edita el archivo en el lugar.
- Anotás el score de baseline para comparar al cerrar (before/after).

## Paso 1 — Baseline

Capturá el estado inicial. Por ejemplo:

```bash
forge eval core/skills/<id> --json
```

Guardá `overallScore`, `grade` y la categoría más débil. Ese es tu punto de
comparación al final.

## Paso 2 — Arreglos mecánicos

Aplicá los fixes reversibles antes de tocar prosa:

```bash
forge eval core/skills/<id> --fix
```

Esto normaliza el frontmatter y deja un `.bak` por seguridad; nunca reescribe el
contenido redactado.

## Paso 3 — Iterar la categoría más débil

Mejorá **una** categoría por vuelta —la de menor score— guiándote por su nota, y
volvé a evaluar. Condiciones de parada: el gate pasa, o dos vueltas sin avance, o
llegás a 8 iteraciones. No persigas el `overallScore` global ignorando una
categoría baja: el gate exige el piso por categoría.

## Criterios de aceptación

- [ ] `forge eval <ruta>` final con `overallScore >= 75`.
- [ ] La categoría más débil queda en `>= 6`.
- [ ] El reporte registra el delta before/after por categoría.
- [ ] El `.bak` se conserva hasta confirmar el resultado.

## Manejo de errores

Si una edición baja el score (regresión), revertí desde el `.bak` y probá otra
táctica para esa categoría. Si tras dos iteraciones la categoría no se mueve,
frená y reportá el bloqueo en vez de seguir editando: a veces el límite es de
diseño, no de redacción.

## Relación con otros skills

- Para crear una skill desde cero, usá `forge-skill-creator`.
- El scorer y los umbrales (75 / 6) viven en `forge eval` (SPEC-053).

Devuelve el `SKILL.md` mejorado y el reporte de `forge eval` con el delta. Esta
skill es autocontenida y debería consumir menos de 4000 tokens.
