---
name: session-start
description: Template para iniciar una sesión de trabajo con Codex CLI
usage: Copia el contenido de Prompt al inicio de tu sesión de Codex
---

## Prompt para Codex

Inicia la sesión de trabajo. Ejecuta estos checks en orden y reporta el resultado:

1. **Verificar herramientas disponibles**
   - Ejecuta `git --version` — reporta la versión o error.
   - Ejecuta `python3 --version` — reporta la versión o error.
   - Si alguna herramienta crítica falta, reporta el error y detente.

2. **Verificar branch actual**
   - Ejecuta `git branch --show-current`.
   - Si el resultado es `main` o `master`: advierte que estás en la branch protegida.
     Sugiere: `git checkout -b feature/<tema>-$(date +%Y-%m-%d)`
   - Si estás en una feature branch: OK.

3. **Verificar cambios sin commitear**
   - Ejecuta `git status --short`.
   - Si hay cambios: listarlos y advertir.
   - Si no hay cambios: OK.

4. **Verificar project.yaml**
   - Busca `project.yaml` en el directorio actual y directorios padre (hasta 3 niveles).
   - Si no existe: advierte que el proyecto no está inicializado con Forge. Sugiere ejecutar el wizard.
   - Si existe: lee los campos `project.name` y `project.mode`.
     - Si faltan esos campos: advertir.
     - Si están presentes: reportar nombre y modo del proyecto.

5. **Verificar variables de producción activas**
   - Ejecuta `env | grep -iE '^(PROD_|PRODUCTION_)'`.
   - Si hay variables de producción activas: ADVERTENCIA — verificar que es intencional trabajar con contexto de producción.
   - Si no hay ninguna: OK.

6. **Leer AGENTS.md**
   - Lee `AGENTS.md` en la raíz del repositorio.
   - Confirma que lo leíste y resume el nombre del proyecto y el workflow activo.

Formato del reporte final:
```
Sesión iniciada — [nombre del proyecto]
Branch: [nombre]
Estado: [limpio | N cambios sin commitear]
Warnings: [lista o "ninguno"]
```
