# <NOMBRE_PROYECTO> — Contexto del proyecto

Generado por forge v<VERSION>. Actualizar con `/forge generate-claude-md` o `python3 .agentic/scripts/forge-init.py --tool claude-code --force`.

## Stack

- Backend: <BACKEND>
- Frontend: <FRONTEND>
- Base de datos: <DATABASE>
- Package manager: <PACKAGE_MANAGER>

## Agentes disponibles

<TABLA_AGENTES_CON_SCOPE>

## Slash commands

| Comando | Cuándo usarlo |
|---------|---------------|
| `/session-start` | Inicio de cada sesión de trabajo |
| `/session-close` | Cierre de sesión: commit, daily-note, PR |
| `/plan <fase> "<título>"` | Crear spec antes de implementar |
| `/work` | Implementar una spec aprobada con agent team |
| `/review` | Revisión de código antes de ship |
| `/ship` | Deploy con verificación en producción |

## Reglas del proyecto

1. Spec antes que código — sin spec en `docs/specs/`, sin implementación.
2. No editar código en main — crear feature branch con `/session-start`.
3. Conventional Commits siempre.
4. Compliance reviewer obligatorio si toca datos de usuarios (mode: <MODE>).

## Estructura del proyecto

<ESTRUCTURA_DIRECTORIOS>
