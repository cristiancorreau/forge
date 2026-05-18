---
name: session-close
description: Template para cerrar una sesión de trabajo con Codex CLI
usage: Copia el contenido de Prompt al final de tu sesión de Codex
---

## Prompt para Codex

Cierra la sesión de trabajo. Ejecuta estos checks en orden:

1. **Verificar estado del trabajo**
   - Ejecuta `git status --short`.
   - Si hay cambios sin commitear: listarlos. ¿Deben commitearse o descartarse?
   - Ejecuta `git diff --stat HEAD` para ver el resumen de cambios en el último commit.

2. **Verificar build y tests**
   - Lee `project.yaml` para el comando de check configurado (`scripts.check`).
   - Si no hay comando configurado: ejecuta el check estándar del stack (tsc --noEmit para TypeScript, py_compile para Python).
   - Reporta si pasan o fallan. Si fallan, listar los errores.

3. **Verificar specs**
   - Lee `AGENTS.md` o `CLAUDE.md` para ver el estado de specs activas.
   - Lista specs en `docs/specs/` con estado `APPROVED` que no estén `IMPLEMENTED`.
   - ¿Hay specs en progreso que quedaron incompletas esta sesión? Reportarlas.

4. **Registrar progreso**
   - ¿Qué se completó en esta sesión? Lista los archivos modificados:
     `git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only`
   - ¿Qué quedó pendiente?
   - ¿Hay bloqueadores para la próxima sesión?

5. **Verificar debug statements olvidados**
   - Ejecuta en archivos modificados: busca `console.log(`, `print(`, `debugger;`.
   - Si hay alguno: listarlos con archivo y línea.

6. **Reporte de cierre**
   Presenta este resumen:
   ```
   Sesión cerrada — [fecha]

   Completado:
   - [item 1]
   - [item 2]

   Pendiente para próxima sesión:
   - [item 1]

   Bloqueadores:
   - [item o "ninguno"]

   Estado del repo: [limpio | N archivos con cambios]
   Tests: [pasando | fallando]
   ```
