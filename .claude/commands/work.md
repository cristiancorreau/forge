# work

Implementa una spec con un agent team. Flags soportados: `--serial`, `--autorun`.

Scope: $ARGUMENTS (ej: `--serial`, `--autorun`, o vacío para modo paralelo estándar)

## Paso 1 — Identificar la spec

Buscar archivos `.md` en `docs/specs/` que contengan `> Estado: APPROVED`.

- Si hay exactamente una: mostrarla y confirmar "Implementando: `<archivo>`."
- Si hay varias: mostrarlas como lista numerada y pedir que el usuario elija.
- Si no hay ninguna: "No hay spec en estado APPROVED. Ejecutá `/plan` primero." y detener.

Leer la spec seleccionada completa antes de continuar.

## Paso 2 — Leer configuración del proyecto

Leer `project.yaml` si existe. Obtener:
- `project.mode` (startup/standard/enterprise) — default: startup si no existe
- `agents.active` — lista de agentes disponibles
- `agents.by_role` — mapeo de roles a agentes
- `agents.profiles` — profiles activos

Si `project.yaml` no existe, continuar con defaults: mode=startup, team mínimo.

## Paso 3 — Proponer composición del team

Evaluar la naturaleza de la tarea según el acceptance criteria de la spec:

**Cuándo NO crear team (usar `--serial` implícitamente):**
- Cambio en un solo archivo
- Bugfix trivial sin impacto en otros módulos
- Tarea de lectura o análisis de código

**Composición según mode:**

| Mode | Team típico | Tamaño |
|------|-------------|--------|
| startup | orchestrator + 1 especialista | 2 agentes |
| standard | orchestrator + backend + frontend + test-engineer | 3-4 agentes |
| enterprise | orchestrator + backend + frontend + test-engineer + compliance-reviewer o security-auditor | 4-5 agentes |

Límites absolutos: máximo 5-6 tasks por teammate, máximo 5 teammates.

Mostrar el team propuesto con el rol y la tarea concreta de cada agente. Ejemplo:
```
Team propuesto:
- orchestrator: coordinar implementación y resolver dependencias entre módulos
- backend-engineer: implementar endpoints de API y lógica de negocio
- frontend-engineer: construir componentes UI y conectar con la API
- test-engineer: escribir tests unitarios e integración para los cambios
```

## Paso 4 — Confirmar con el usuario

Preguntar: "¿Aprobás este team o querés ajustarlo?"

Si el usuario ajusta: modificar el team según su feedback antes de ejecutar.

Si se detectó que la tarea no requiere team (ver criterios arriba): informar "Esta tarea es simple — implementaré en modo serial sin team." y continuar con modo `--serial`.

## Paso 5 — Ejecutar

### Con `--serial` (o tarea simple detectada en Paso 3)

Implementar secuencialmente sin subagentes. Seguir el acceptance criteria de la spec como checklist. Reportar progreso por ítem.

### Sin flags (modo paralelo estándar)

Antes de ejecutar: si se usó `--autorun`, advertir una sola vez: "Modo --autorun activado: ejecutaré hasta completar sin confirmaciones intermedias. Esto es experimental."

Spawnar cada teammate con:

```
Agent({
  subagent_type: "<nombre-agente>",
  description: "<rol y tarea concreta en una línea>",
  prompt: "<prompt auto-contenido con: contexto completo del proyecto, spec completa, tarea específica del agente, instrucciones de qué reportar al terminar>",
  run_in_background: true
})
```

El prompt de cada agente debe ser auto-contenido: incluir la spec completa, el stack técnico del proyecto y la tarea específica. El agente no tiene acceso al contexto de esta sesión.

## Paso 6 — Monitorear y sintetizar

Cuando los teammates terminan:
- Revisar los resultados de cada uno
- Identificar conflictos o dependencias no resueltas
- Reportar al usuario: qué implementó cada agente, qué tests pasaron, si hubo errores

Si hay errores o conflictos: reportar claramente y preguntar cómo proceder. No resolver conflictos automáticamente sin confirmación.

## Paso 7 — Actualizar la spec

Estados de spec (alineados con `core/templates/spec-template.md`): `DRAFT` → `REVIEW` → `APPROVED` → `IMPLEMENTED`.

- Al completar exitosamente: cambiar `> Estado: APPROVED` → `> Estado: IMPLEMENTED`
- Actualizar la fecha de `Actualizada:` a la fecha de hoy
- Completar la sección "Notas de implementación" con lo que se hizo y las decisiones tomadas

Confirmar: "Implementación completa. Spec actualizada a `IMPLEMENTED`. Podés ejecutar `/review` y luego `/ship`."
