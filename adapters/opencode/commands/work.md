---
name: work
description: Implementa una spec en modo serial. OpenCode no soporta subagentes paralelos — toda la implementación ocurre en esta sesión.
---

Implementa una spec siguiendo el flujo SDD. OpenCode ejecuta todo en serie en la sesión actual — no se crean subagentes paralelos.

Argumentos: vacío para modo estándar, `--autorun` para ejecutar sin confirmaciones intermedias.

## Paso 1 — Identificar la spec

Buscar archivos `.md` en `docs/specs/` que contengan `**Estado:** ready`.

- Si hay exactamente una: mostrarla y confirmar "Implementando: `<archivo>`."
- Si hay varias: mostrarlas como lista numerada y pedir que el usuario elija.
- Si no hay ninguna: "No hay spec en estado ready. Ejecutá `/plan` primero." y detener.

Leer la spec seleccionada completa antes de continuar.

## Paso 2 — Leer configuración del proyecto

Leer `project.yaml` si existe. Obtener:
- `project.mode` (startup/standard/enterprise) — default: startup si no existe
- `stack.*` — stack técnico del proyecto
- `agents.active` — agentes disponibles (para conocer el dominio, no para spawnearlos)

Si `project.yaml` no existe, continuar con defaults: mode=startup.

## Paso 3 — Proponer plan de implementación

Evaluar la naturaleza de la tarea según el acceptance criteria de la spec.

Presentar un plan de implementación secuencial organizado por rol:

```
Plan de implementación:
1. [Backend] Implementar endpoints/lógica de negocio: <descripción>
2. [Frontend] Construir componentes UI: <descripción>
3. [Tests] Escribir tests para los cambios: <descripción>
```

Adaptar el plan según el `project.mode`:
- **startup**: plan mínimo (1-2 pasos, sin separación rígida de roles)
- **standard**: plan con separación backend/frontend/tests
- **enterprise**: plan con separación backend/frontend/tests + revisión de compliance al final

## Paso 4 — Confirmar con el usuario

Preguntar: "¿Aprobás este plan o querés ajustarlo?"

Si el usuario ajusta: modificar el plan según su feedback antes de ejecutar.

Si se usó `--autorun`: advertir una sola vez "Modo --autorun: ejecutaré hasta completar sin confirmaciones intermedias." y continuar.

## Paso 5 — Ejecutar en serie

Implementar cada paso del plan secuencialmente. Por cada paso:

1. Anunciar: "Implementando: [descripción del paso]"
2. Ejecutar los cambios de código necesarios
3. Si hay tests para este paso: escribirlos junto con el código, no al final
4. Reportar: "Completado: [descripción breve de qué se hizo]"

En modo estándar (sin `--autorun`): pausar brevemente entre pasos para permitir que el usuario intervenga si algo no está bien.

Seguir el acceptance criteria de la spec como checklist — marcar cada ítem cuando esté implementado.

## Paso 6 — Verificar implementación

Al completar todos los pasos, ejecutar:
- El comando de tests del proyecto (según stack en `project.yaml`)
- El comando de lint si está disponible

Reportar los resultados. Si hay fallos: describirlos y resolverlos antes de continuar.

## Paso 7 — Actualizar la spec

- Al iniciar la implementación: cambiar `**Estado:** ready` → `**Estado:** in-progress`
- Al completar exitosamente: cambiar `**Estado:** in-progress` → `**Estado:** implemented`
- Completar las secciones "Implementation notes" y "Decisiones tomadas" con lo que se hizo

Confirmar: "Implementación completa. Spec actualizada a `implemented`. Podés ejecutar `/review` y luego `/ship`."
