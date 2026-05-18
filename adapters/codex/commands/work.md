---
name: work
description: Template para implementar una feature con Codex CLI siguiendo SDD
usage: Copia el contenido de Prompt en tu sesión de Codex
---

## Prompt para Codex

Implementa la siguiente feature: [NOMBRE O RUTA A LA SPEC]

Sigue estos pasos en orden estricto:

1. **Verificar spec aprobada**
   - Lee `docs/specs/[ID]-[nombre].md`.
   - Verifica que el estado sea `APPROVED`. Si dice `DRAFT`, detente: la spec necesita aprobación antes de implementar.

2. **Leer contexto existente**
   - Lee `project.yaml` para entender el stack y los paths configurados.
   - Lee los archivos que la spec indica que serán afectados.
   - Si el proyecto tiene `CLAUDE.md` o `AGENTS.md`, léelo para entender las convenciones del proyecto.

3. **Implementar en este orden**
   ```
   a. Schema de base de datos (si hay modelos nuevos o modificados)
   b. Types / interfaces compartidos
   c. Backend — lógica de negocio, servicios, API routes
   d. Frontend — componentes, páginas (si aplica)
   e. Tests junto con cada capa, no al final
   ```

4. **Checklist de seguridad** (aplicar a cada endpoint o función que crees):
   - [ ] ¿Verifica autenticación?
   - [ ] ¿Verifica autorización por rol/ownership?
   - [ ] ¿El input está validado con schema explícito?
   - [ ] ¿Las queries usan parámetros preparados (no interpolación de strings)?
   - [ ] ¿No hay secrets hardcodeados?

5. **Al terminar cada archivo**
   - Verifica que el código compila / no tiene errores de sintaxis.
   - Si es TypeScript: asegúrate que los tipos son correctos.
   - Si es Python: sin errores de sintaxis.

6. **Al terminar la implementación completa**
   - Actualiza `docs/specs/[ID]-[nombre].md`: agrega decisiones tomadas en la sección "Notas de implementación".
   - Cambia el estado de la spec de `APPROVED` a `IMPLEMENTED`.
   - Lista todos los archivos creados o modificados.

Restricciones absolutas:
- Sin hardcodear tokens, passwords ni secrets — usar variables de entorno.
- Sin force push a main/master.
- Sin eliminar archivos sin confirmación explícita.
- Correr los tests antes de declarar la tarea completa.
- Nunca commitear directamente a main/master.
