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

Antes de empezar, verifica:

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
aceptación. Mantén el body entre 120 y 1500 palabras y mencioná el presupuesto
de tokens.

## Paso 3 — Evaluar e iterar

Ejecuta el scorer y lee las notas por categoría:

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
- [ ] El body trae las tres secciones de resiliencia (SPEC-060): `## Excusas
      comunes` (tabla Excusa|Realidad), `## Señales de alerta` y `## Verificación`
      con checklist + evidencia. Sin ellas, la categoría `resilience` cae bajo el piso.

## Manejo de errores

Si `forge eval` falla al parsear el archivo, el error apunta a la línea del
frontmatter; revisa el YAML (comillas en valores con caracteres especiales). Si
el score no sube tras dos iteraciones sin cambios, detente y revisa la nota de la
categoría estancada en lugar de seguir editando a ciegas.

## Relación con otros skills

- Para mejorar una skill ya existente, usa `forge-skill-improver`.
- El scorer que respalda este flujo es `forge eval` (SPEC-053).

Devuelve el `SKILL.md` creado y el reporte final de `forge eval`. Esta skill es
autocontenida y debería consumir menos de 4000 tokens.

## Excusas comunes

| Excusa | Realidad |
|---|---|
| "Esta skill es muy simple, no necesita las secciones de resiliencia" | El scorer las exige; sin ellas el gate falla. Lo simple igual se saltea pasos. |
| "Las agrego después de que pase el resto" | Después no se agregan. Escríbelas en el borrador, no al final. |
| "El agente ya sabe verificar, no hace falta el gate" | "Ya sabe" es la racionalización: el gate con evidencia es lo que lo obliga. |

## Señales de alerta

- Crear un `SKILL.md` sin tabla de racionalizaciones ni gate de verificación
- Declarar "listo" sin pegar la salida de `forge eval`
- Subir el score global ignorando una categoría bajo el piso (6)

## Verificación

- [ ] `forge eval core/skills/<id> --json` con `overallScore >= 75` — pega la salida como evidencia
- [ ] Ninguna categoría bajo 6 (incluida `resilience`)
- [ ] Las tres secciones de resiliencia presentes en el skill generado
