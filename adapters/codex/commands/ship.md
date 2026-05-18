---
name: ship
description: Template para preparar y verificar el deploy con Codex CLI
usage: Copia el contenido de Prompt en tu sesión de Codex
---

## Prompt para Codex

Prepara el proyecto para deploy en: [ENTORNO: staging | production]

Ejecuta estos checks en orden y reporta el resultado de cada uno:

1. **Verificar estado del worktree**
   - Ejecuta `git status` — ¿hay cambios sin commitear?
   - Ejecuta `git branch --show-current` — ¿estás en la branch correcta?
   - Si hay cambios sin commitear, detente y reporta cuáles son.

2. **Ejecutar tests**
   - Lee `project.yaml` para encontrar el comando de tests (`scripts.test`).
   - Si no está configurado, ejecuta el comando estándar del stack:
     - Node.js: `npm test` o `pnpm test`
     - Python: `pytest`
     - Ruby: `bundle exec rspec`
   - Si los tests fallan, detente. No continuar con el deploy.

3. **Verificar build**
   - Lee `project.yaml` para encontrar el comando de build (`scripts.build`).
   - Ejecuta el build y reporta si pasa o falla.
   - Busca errores de TypeScript: `tsc --noEmit` si es un proyecto TypeScript.

4. **Verificar variables de entorno**
   - Lee `.env.example` si existe — lista las variables requeridas.
   - Verifica que todas estén documentadas.
   - Busca cualquier variable de entorno hardcodeada en el código (grep por `process.env` sin variable de entorno correspondiente en `.env.example`).

5. **Buscar debug statements**
   - Ejecuta: `git diff main --name-only` para ver archivos cambiados.
   - Busca `console.log(`, `print(`, `debugger;`, `var_dump(` en esos archivos.
   - Reporta cada ocurrencia encontrada.

6. **Verificar specs implementadas**
   - Lista los specs en `docs/specs/` con estado `APPROVED` (sin `IMPLEMENTED`).
   - Si hay specs aprobadas sin implementar que se esperaban en este deploy, reportarlas.

7. **Confirmar proveedor de deploy**
   - Lee `project.yaml` sección `deploy`.
   - Reporta: URL de producción, proveedor, branch de deploy.
   - Si el entorno es `production` y no hay evidencia de que `staging` fue validado primero, advertirlo.

Restricciones:
- Nunca hacer force push a main/master.
- No continuar si los tests fallan.
- Si el entorno es `production`, confirmar explícitamente antes de ejecutar cualquier comando de deploy.
