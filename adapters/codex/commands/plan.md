---
name: plan
description: Template para planificar una feature con Codex CLI siguiendo SDD
usage: Copia el contenido de Prompt en tu sesión de Codex
---

## Prompt para Codex

Quiero planificar la siguiente feature: [NOMBRE O DESCRIPCIÓN DE LA FEATURE]

Sigue estos pasos en orden:

1. Busca si existe una spec para esta feature en `docs/specs/`. Lista los archivos en ese directorio y lee cualquiera que sea relevante.

2. Si NO existe spec:
   - Crea el archivo `docs/specs/[ID]-[nombre-kebab-case].md` usando la plantilla en `docs/specs/_template.md` (si existe) o con esta estructura:
     ```
     # [Nombre de la Feature]
     > Estado: DRAFT
     > Fecha: [fecha actual]

     ## Contexto
     [Por qué existe esta feature]

     ## Decisión
     [Qué vamos a implementar exactamente]

     ## Criterios de aceptación
     - [ ] [criterio verificable 1]
     - [ ] [criterio verificable 2]

     ## Notas de implementación
     [Vacío — se completa durante la implementación]
     ```
   - Detente aquí. No escribas ningún código hasta que la spec esté aprobada.

3. Si la spec existe y está en estado APPROVED:
   - Lee la spec completa.
   - Lee el `project.yaml` en la raíz para entender el stack.
   - Identifica los archivos que deberán modificarse.
   - Propón el plan de implementación con este formato:
     ```
     PLAN: [nombre de la feature]

     Archivos a crear:
     - [ruta exacta]: [propósito]

     Archivos a modificar:
     - [ruta exacta]: [qué cambia]

     Orden de implementación:
     1. [paso 1]
     2. [paso 2]

     Tests necesarios:
     - [ruta de test]: [qué verifica]
     ```
   - No implementes nada todavía. Espera confirmación explícita.

Restricciones:
- Nunca hardcodear tokens, passwords ni secrets.
- No crear código antes de que exista spec aprobada.
- Si la feature afecta autenticación, rutas de API, o manejo de PII — mencionarlo explícitamente en el plan.
