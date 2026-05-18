# plan

Gestiona specs del ciclo SDD (Spec-Driven Development).

Scope: $ARGUMENTS (ej: `2 "Auth con OAuth"` para crear spec, `--review <archivo>` para revisar, vacío para listar)

## Modo crear spec (`/plan <fase> "<título>"`)

### Paso 1 — Verificar directorio

Verificar que existe `docs/specs/`. Si no existe, crearlo.

### Paso 2 — Crear el archivo de spec

Construir el nombre del archivo:
- Tomar el título, convertirlo a minúsculas, reemplazar espacios por guiones, eliminar caracteres especiales → `<slug>`
- Nombre final: `docs/specs/<fase>-<slug>.md`

Crear el archivo con este template exacto:

```markdown
# Spec: <título>
**Fase:** <fase> | **Estado:** draft | **Fecha:** YYYY-MM-DD

## Problem statement
[¿Qué problema resuelve? ¿Por qué ahora?]

## Non-goals
[Qué NO cubre esta spec]

## Acceptance criteria
- [ ] Criterio 1 (verificable, testeable)
- [ ] Criterio 2

## Compliance mapping
[Si el proyecto tiene frameworks de compliance en project.yaml, mapear qué artículos aplican. Si no aplica, escribir "N/A".]

## Edge cases
[Casos límite que la implementación debe manejar]

## Implementation notes
[Se llena durante la implementación]

## Decisiones tomadas
[Se llena durante la implementación]
```

### Paso 3 — Guiar al usuario por cada sección

Preguntar una sección a la vez, en orden:

1. "¿Qué problema concreto resuelve esta feature? ¿Por qué ahora y no más adelante?"
2. "¿Qué queda explícitamente fuera del scope de esta spec?"
3. "¿Cuáles son los criterios de aceptación verificables? (cada uno debe ser testeable de forma objetiva)"
4. Si `project.yaml` tiene frameworks de compliance: "¿Qué artículos o controles de compliance aplican a esta feature?"
5. "¿Qué casos límite debe manejar la implementación? (ej: usuario sin permisos, datos vacíos, concurrencia)"

Completar el archivo con las respuestas del usuario a medida que avanza.

### Paso 4 — Planner-Critic (condicional)

Leer `project.yaml` → `project.mode`:

- **mode=standard o mode=enterprise**: aplicar Planner-Critic obligatoriamente
- **mode=startup**: preguntar "¿Querés aplicar el Planner-Critic para detectar ambigüedades antes de implementar? (s/n)"
- Si `project.yaml` no existe: tratar como startup

**Cómo aplicar el Planner-Critic:**

Adoptar el rol de "Critic" y revisar la spec completa buscando:
- ¿Hay acceptance criteria que no son objetivamente verificables?
- ¿Hay términos ambiguos que diferentes personas podrían interpretar distinto?
- ¿Hay edge cases no cubiertos que podrían romper la implementación?
- ¿Los non-goals son suficientemente explícitos para evitar scope creep?

Mostrar las críticas como bullet points. Preguntar: "¿Ajustamos la spec antes de marcarla como ready?"

Si el usuario ajusta: actualizar el archivo y repetir el Critic una vez más.

### Paso 5 — Marcar como ready

Cuando el usuario aprueba la spec (o decide no aplicar el Critic):
- Cambiar `**Estado:** draft` → `**Estado:** ready` en el archivo
- Confirmar: "Spec lista: `docs/specs/<archivo>.md`. Ahora podés ejecutar `/work` para implementarla."

---

## Modo listar (`/plan` sin argumentos)

Buscar todos los archivos `.md` en `docs/specs/` que contengan `**Estado:** draft` o `**Estado:** in-review`.

Si no hay ninguno: "No hay specs en estado draft o in-review. Ejecutá `/plan <fase> \"<título>\"` para crear una."

Si hay alguno: mostrarlos como lista numerada con título, fase y fecha. Ejemplo:
```
1. auth-oauth.md — Fase 2 — Auth con OAuth (2026-05-17)
2. billing-webpay.md — Fase 3 — Pago con WebPay (2026-05-14)
```

Preguntar: "¿Cuál continuamos?"

---

## Modo revisar (`/plan --review <archivo-spec>`)

Leer el archivo de spec indicado.

Aplicar el Planner-Critic completo:
- ¿Los acceptance criteria son objetivamente testeables?
- ¿Hay ambigüedades en el problem statement o en los criterios?
- ¿Hay edge cases no cubiertos?
- ¿Los non-goals son suficientemente explícitos?

Mostrar sugerencias de mejora como bullet points con la sección específica que afectan.

Preguntar: "¿Aplicamos alguno de estos cambios?"
