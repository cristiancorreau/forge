# .codex/codex.yaml — Forge v2 hooks para Codex CLI
#
# Generar con: cp adapters/codex/hooks/codex.yaml.tpl .codex/codex.yaml
# O usar: bash scripts/setup-codex.sh
#
# SOPORTE DE HOOKS EN CODEX CLI (estado a 2025):
#   onStart  — se ejecuta al inicio de cada sesión de Codex. Equivalente
#              al hook SessionStart / UserPromptSubmit de Claude Code.
#   onFinish — se ejecuta al finalizar cada sesión de Codex. Equivalente
#              al hook Stop de Claude Code.
#   onDiff   — se ejecuta cuando Codex aplica cambios al filesystem.
#              No tiene equivalente directo en Claude Code.
#
# NO SOPORTADO en Codex CLI (a diferencia de Claude Code):
#   - PreToolUse: Codex no puede interceptar herramientas individuales
#     antes de ejecutarlas. Las reglas de pre-bash-check.py y
#     pre-edit-check.py NO tienen equivalente automático en Codex.
#     Esas reglas están embebidas en AGENTS.md como instrucciones de texto
#     para que el agente las respete voluntariamente.
#   - PostToolUse: tampoco soportado.
#
# IMPLICACIÓN: La capa de seguridad de Codex es instruccional (AGENTS.md),
# no mecánica (hooks que bloquean). Para proyectos de alto riesgo, preferir
# Claude Code que sí puede bloquear comandos destructivos antes de ejecutarlos.

model: o4-mini  # Cambiar según preferencia: o4-mini | o3 | gpt-4o

hooks:
  # Ejecutado al inicio de cada sesión.
  # Equivalent: Claude Code SessionStart / UserPromptSubmit hook.
  # Verifica herramientas disponibles, branch, cambios sin commitear,
  # project.yaml y variables de entorno de producción activas.
  onStart: bash .codex/forge-codex-start.sh

  # Ejecutado al finalizar cada sesión.
  # Equivalent: Claude Code Stop hook (post-turn-check.sh).
  # Detecta archivos modificados y corre type-check / syntax-check.
  onFinish: bash .codex/forge-codex-finish.sh

  # onDiff: no configurado por defecto.
  # Se puede usar para correr linters en los archivos cambiados.
  # Ejemplo: onDiff: bash -c 'echo "$CODEX_DIFF_FILES" | xargs eslint --fix'
  # onDiff: ""
