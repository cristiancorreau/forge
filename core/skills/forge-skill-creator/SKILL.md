---
name: forge-skill-creator
description: Create a new SKILL.md from scratch and iterate with forge eval until it passes the quality gate. Don't use for editing an existing skill — use forge-skill-improver instead.
version: "1.0.0"
triggers:
  - /forge-skill-creator
  - "crear skill"
  - "nueva skill"
  - "create skill"
capabilities:
  fs_write: ["core/skills/", ".claude/skills/"]
  bash: ["forge eval"]
  network: false
---
# Skill: forge-skill-creator

Create a new `SKILL.md` from scratch and iterate with `forge eval` until it
passes the quality gate. Don't use for improving an existing skill — use
`forge-skill-improver` for that.

Triggers: /forge-skill-creator, "crear skill", "nueva skill", "create skill"

## Cuándo usar este skill

Usalo cuando tenés una idea de skill pero todavía no hay un `SKILL.md`. El
objetivo es producir un archivo que pase el gate de `forge eval`
(`overallScore >= 75` y la categoría más débil `>= 6`) a la primera, en vez de
escribir a ciegas. No lo uses para editar una skill que ya existe.

## Prerequisitos

Antes de empezar, verificá:

- El CLI está disponible: `forge eval --help` responde.
- Sabés en qué carpeta vivirá la skill (`core/skills/<id>/` en este repo, o
  `.claude/skills/<id>/` en un proyecto).
- Tenés git limpio o un backup, porque vas a crear archivos nuevos.

## Paso 1 — Capturar la intención

Conversá para extraer, en una frase, qué hace la skill, cuándo se dispara y qué
**no** cubre. Confirmá ese entendimiento con la persona antes de escribir: una
recomendación equivocada acá se arrastra a todo el archivo.

## Paso 2 — Escribir el borrador

Creá `core/skills/<id>/SKILL.md` con el frontmatter obligatorio (`name`,
`description`, `version`, `triggers`) y un body con: un párrafo inicial de 8 a 40
palabras con cláusula negativa ("don't use for…"), una sección de prerequisitos,
pasos numerados, al menos un bloque de código de ejemplo y criterios de
aceptación. Mantené el body entre 120 y 1500 palabras y mencioná el presupuesto
de tokens.

## Paso 3 — Evaluar e iterar

Corré el scorer y leé las notas por categoría:

```bash
forge eval core/skills/<id> --json
```

Por ejemplo, una salida con `"grade": "C"` y una categoría `safety` en 4 te dice
exactamente qué reforzar. Aplicá los arreglos mecánicos reversibles con
`forge eval core/skills/<id> --fix` (deja un `.bak`) y luego mejorá a mano la
categoría más débil. Repetí hasta que el gate pase. Tope sugerido: 8 iteraciones.

## Criterios de aceptación

- [ ] `forge eval <ruta>` devuelve `overallScore >= 75`.
- [ ] La categoría más débil queda en `>= 6`.
- [ ] El frontmatter tiene `name`, `description`, `version` y `triggers`.
- [ ] El body incluye prerequisitos, pasos, un ejemplo y criterios verificables.

## Manejo de errores

Si `forge eval` falla al parsear el archivo, el error apunta a la línea del
frontmatter; revisá el YAML (comillas en valores con caracteres especiales). Si
el score no sube tras dos iteraciones sin cambios, frená y revisá la nota de la
categoría estancada en lugar de seguir editando a ciegas.

## Relación con otros skills

- Para mejorar una skill ya existente, usá `forge-skill-improver`.
- El scorer que respalda este flujo es `forge eval` (SPEC-053).

Devuelve el `SKILL.md` creado y el reporte final de `forge eval`. Esta skill es
autocontenida y debería consumir menos de 4000 tokens.
