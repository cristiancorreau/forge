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

Crear el archivo con el template canónico de `core/templates/spec-template.md` (misma fuente única de verdad que el skill `spec`):

```markdown
# <fase> Título de la Feature

> Estado: DRAFT | REVIEW | APPROVED | IMPLEMENTED
> Responsable: [nombre o rol]
> Creada: YYYY-MM-DD | Actualizada: YYYY-MM-DD

## Contexto

Por qué existe esta feature. Qué problema resuelve. Qué pasa si no la hacemos.

## Decisión

Qué vamos a implementar exactamente. Ser específico: endpoints, tablas, componentes.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Opción A | ... | ... | ... |
| Opción B | ... | ... | ... |

## Criterios de aceptación

- [ ] Criterio verificable 1
- [ ] Criterio verificable 2
- [ ] Criterio verificable N

## Impacto de compliance

Si el proyecto tiene `compliance.frameworks` configurado, completar:

- **Ley 21.719**: art. X → [descripción del impacto]
- **GDPR**: Art. Y → [descripción del impacto]
- No aplica (si no hay impacto de compliance)

## Dependencias

- Requiere que [otra spec ID] esté implementada
- Bloqueada por [issue/ticket]

## Notas de implementación

Cualquier decisión tomada durante la implementación que no estaba en la spec original.
```

Marcar el estado inicial como `DRAFT` (la primera línea del bloque de metadata: `> Estado: DRAFT`).

### Paso 3 — Guiar al usuario por cada sección

Preguntar una sección a la vez, en orden:

1. **Contexto**: "¿Qué problema concreto resuelve esta feature? ¿Por qué ahora y no más adelante? ¿Qué pasa si no la hacemos?"
2. **Decisión**: "¿Qué vamos a implementar exactamente? Ser específico: endpoints, tablas, componentes."
3. **Alternativas consideradas**: "¿Qué otras opciones se evaluaron y por qué se descartaron?"
4. **Criterios de aceptación**: "¿Cuáles son los criterios de aceptación verificables? (cada uno debe ser testeable de forma objetiva)"
5. Si `project.yaml` tiene frameworks de compliance: "¿Qué artículos o controles de compliance aplican a esta feature?"
6. **Dependencias**: "¿De qué otras specs o tickets depende esta feature?"

Completar el archivo con las respuestas del usuario a medida que avanza.

### Paso 4 — Planner-Critic (condicional)

Leer `project.yaml` → `project.mode`:

- **mode=standard o mode=enterprise**: aplicar Planner-Critic obligatoriamente
- **mode=startup**: preguntar "¿Querés aplicar el Planner-Critic para detectar ambigüedades antes de implementar? (s/n)"
- Si `project.yaml` no existe: tratar como startup

**Cómo aplicar el Planner-Critic:**

Adoptar el rol de "Critic" y revisar la spec completa buscando:
- ¿Hay criterios de aceptación que no son objetivamente verificables?
- ¿Hay términos ambiguos que diferentes personas podrían interpretar distinto?
- ¿El contexto y la decisión son suficientemente específicos para evitar scope creep?
- ¿Faltan dependencias o alternativas relevantes que deberían documentarse?

Mostrar las críticas como bullet points. Preguntar: "¿Ajustamos la spec antes de pasarla a REVIEW?"

Si el usuario ajusta: actualizar el archivo y repetir el Critic una vez más.

### Paso 5 — Marcar como APPROVED

Cuando el usuario aprueba la spec (o decide no aplicar el Critic):
- Cambiar `> Estado: DRAFT` → `> Estado: APPROVED` en el archivo
- Actualizar la fecha de `Actualizada:` a la fecha de hoy
- Confirmar: "Spec aprobada: `docs/specs/<archivo>.md`. Ahora podés ejecutar `/work` para implementarla."

> Estados de spec (alineados con `core/templates/spec-template.md`): `DRAFT` → `REVIEW` → `APPROVED` → `IMPLEMENTED`. `/plan` crea en `DRAFT` y aprueba a `APPROVED`; `/work` la marca `IMPLEMENTED`.

---

## Modo listar (`/plan` sin argumentos)

Buscar todos los archivos `.md` en `docs/specs/` que contengan `> Estado: DRAFT` o `> Estado: REVIEW`.

Si no hay ninguno: "No hay specs en estado DRAFT o REVIEW. Ejecutá `/plan <fase> \"<título>\"` para crear una."

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
- ¿Los criterios de aceptación son objetivamente testeables?
- ¿Hay ambigüedades en el contexto, la decisión o los criterios?
- ¿Las alternativas consideradas justifican la decisión tomada?
- ¿Las dependencias están completas y son explícitas?

Mostrar sugerencias de mejora como bullet points con la sección específica que afectan.

Preguntar: "¿Aplicamos alguno de estos cambios?"
