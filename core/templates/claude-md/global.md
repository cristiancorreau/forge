# Instrucciones globales — <NOMBRE_DEV>

Reglas que aplican a todos mis proyectos con Claude Code.

## Idioma y comunicación
- Responder en español por defecto. Cambiar a inglés si el proyecto lo requiere.
- Respuestas concisas — ir directo al punto.
- No usar emojis salvo que los use yo primero.

## Commits (todos mis proyectos)
- Conventional Commits: feat:, fix:, docs:, refactor:, chore:, test:
- Mensajes en inglés, tiempo presente imperativo
- Siempre incluir: Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

## Seguridad (todos mis proyectos)
- Nunca hardcodear tokens, passwords o claves en archivos que van a git
- Verificar autenticación Y autorización en cada endpoint
- Usar parámetros preparados — nunca concatenar input del usuario en SQL
- No exponer error.message al cliente en producción

## Herramientas
- Preferir Read/Edit/Write sobre Bash(cat/sed/echo) para archivos
- Reservar Bash para operaciones de sistema sin herramienta dedicada
- Usar Grep para buscar en código, Glob para listar archivos

## Deploy (todos mis proyectos)
- Esperar state: READY antes de dar deploy por terminado
- Verificar runtime logs después del deploy, no solo el build
- Nunca force push a main/master
- Max 1 poll/minuto a APIs de deploy
