---
name: session-close
description: "Cierra la sesión de trabajo con un pipeline de 8 pasos: commit, changeset, GitHub Projects, daily note, release notes, commit de cierre, sync y PR. Usar al terminar una sesión de trabajo."
---

# Skill: session-close

Cierra la sesión de trabajo con un pipeline de 8 pasos: commit, changeset,
GitHub Projects, daily note, release notes, commit de cierre, sync y PR. Es el
último paso del flujo de trabajo SDD.

Triggers: /session-close, "cerrar sesión", "terminar sesión", "cerrar el día"

---

## Cuándo usar este skill

- Al terminar de trabajar en una rama de feature
- Para dejar la rama lista para PR (commit, daily note, sync con main)
- Para registrar progreso y cerrar issues trabajados en la sesión

No usar para iniciar la sesión — para eso está `session-start`.

---

## Paso 1 — Verificar estado

Ejecutar `git status --short` y `git diff --stat HEAD 2>/dev/null`. Reportar qué hay pendiente.

## Paso 2 — Commitear cambios pendientes

Si hay cambios sin commitear:

- Preguntar al usuario: "¿Qué describe este commit? (usa Conventional Commits: feat/fix/chore/docs/refactor/test)"
- Commitear con: `git add -A && git commit -m "<type>(<scope>): <descripción>"`
- Incluir siempre en el cuerpo del commit el `Co-Authored-By` del runtime activo

Si no hay nada que commitear: indicar "Nada pendiente de commitear." y continuar.

## Paso 3 — Changeset (condicional)

Si el commit del Paso 2 fue de tipo `feat:` o `fix:` Y `package.json` contiene `"@changesets/cli"`:

- Ejecutar `npx changeset` para generar el changeset

En cualquier otro caso, omitir este paso sin mencionarlo.

## Paso 4 — GitHub Projects (condicional)

Leer `project.yaml`. Si tiene una sección `github.project` con `number`, `owner` y `repo`:

- Preguntar: "¿Qué issues trabajaste en esta sesión? (números separados por coma, o Enter para saltar)"
- Si el usuario provee números: ejecutar `gh issue close <N> --comment "Completado en esta sesión"` para cada uno
- Mover los issues a Done en el proyecto si es posible con gh CLI

Si `project.yaml` no tiene sección `github.project`: indicar "GitHub Projects no configurado en project.yaml." y continuar.

## Paso 5 — Daily note

Crear el directorio `docs/daily-notes/` si no existe.

Determinar:
- `FECHA`: resultado de `date +%Y-%m-%d`
- `TEMA`: derivado del nombre de la rama actual, eliminando el prefijo de tipo y el sufijo de fecha (ej: `feature/billing-webpay-2026-05-16` → `billing-webpay`)

Crear el archivo `docs/daily-notes/FECHA-TEMA.md` con este contenido:

```
# Session FECHA — TEMA

## Completado
[listar qué se implementó o cambió en esta sesión]

## Archivos modificados
[output de: git diff --name-only HEAD~1..HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null]

## Commits
[output de: git log --oneline HEAD~3..HEAD]

## Decisiones tomadas
[preguntar al usuario: "¿Alguna decisión de diseño o arquitectura que vale registrar?"]

## Blockers para próxima sesión
[preguntar al usuario: "¿Quedó algo bloqueado o incompleto?"]
```

Completar las secciones "Archivos modificados" y "Commits" con los outputs reales. Completar "Completado", "Decisiones tomadas" y "Blockers" con las respuestas del usuario.

## Paso 6 — RELEASE-NOTES.md

Agregar al final de `RELEASE-NOTES.md` (crear si no existe):

```
## FECHA — TEMA
[resumen en una línea de qué cambió]
```

Usar el resumen de la daily note para redactar la línea.

## Paso 7 — Commit de cierre

Commitear los archivos generados:

```
git add docs/daily-notes/ RELEASE-NOTES.md && git commit -m "docs(progress): session close FECHA — TEMA"
```

## Paso 8 — Sync y PR

Ejecutar:

```
git fetch origin main
git log HEAD..origin/main --oneline
```

- Si main tiene commits nuevos: ejecutar `git rebase origin/main` y luego `git push --force-with-lease origin <rama-actual>`
- Si main no tiene cambios nuevos: ejecutar `git push -u origin <rama-actual>`

Luego crear el PR:

```
gh pr create --title "<resumen de cambios>" --body "<resumen de sesión tomado de la daily note>"
```

Si `gh` no está disponible: hacer solo el push y recordar al usuario "Crea el PR manualmente en GitHub."

## Al finalizar el pipeline

Confirmar con: "Sesión cerrada. PR creado: [URL]" o, si gh no estuvo disponible: "Sesión cerrada. Push hecho a [branch] — crea el PR en GitHub."

---

## Relación con otros skills

`session-close` cierra el ciclo que abre `session-start`. El Paso 8 (sync + PR)
es equivalente al deploy de `local2prod` cuando el proyecto publica desde main;
si ya usaste `local2prod` en la sesión, podés saltear el push y solo abrir el PR.

```
session-start  →  new-feature  →  session-close (commit → … → sync → PR)
```
