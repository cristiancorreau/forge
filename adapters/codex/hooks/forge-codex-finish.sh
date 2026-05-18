#!/usr/bin/env bash
# Forge v2 — Codex onFinish hook: forge-codex-finish.sh
#
# Se ejecuta al finalizar cada sesión de Codex CLI.
# Equivalente al hook post-turn-check.sh de Claude Code (Stop event).
#
# DIFERENCIAS vs Claude Code:
#   - Claude Code: post-turn-check.sh corre después de CADA turno del agente.
#   - Codex CLI: forge-codex-finish.sh corre al FINALIZAR la sesión completa,
#     no después de cada mensaje individual. Codex no tiene un equivalente
#     granular de "Stop por turno".
#   - Claude Code Stop hook: puede imprimir al contexto del agente (el output
#     se muestra como resultado del hook).
#   - Codex CLI onFinish: el output se muestra en la terminal del usuario,
#     pero puede no ser visible en el contexto del agente dependiendo de la
#     versión de Codex.
#
# LIMITACIONES de Codex vs Claude Code:
#   - No hay PreToolUse/PostToolUse hooks para interceptar herramientas individuales.
#   - Los checks de este script son post-sesión, no post-turno.
#
# Instalación: este script debe copiarse o enlazarse en .codex/forge-codex-finish.sh
# El setup-codex.sh lo hace automáticamente.

set -uo pipefail

# ---------------------------------------------------------------------------
# Step 1 — Find modified files
# ---------------------------------------------------------------------------
MODIFIED=$(git diff --name-only HEAD 2>/dev/null || echo "")
STAGED=$(git diff --name-only --cached 2>/dev/null || echo "")
ALL_CHANGED="$MODIFIED $STAGED"

if [ -z "$(echo "$ALL_CHANGED" | tr -d '[:space:]')" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 2 — Read project config
# ---------------------------------------------------------------------------
PKG_MGR=""
CUSTOM_CHECK=""

if [ -f "project.yaml" ]; then
  PKG_MGR=$(python3 -c "
import yaml, sys
try:
    d = yaml.safe_load(open('project.yaml'))
    print(d.get('stack', {}).get('package_manager', ''))
except:
    print('')
" 2>/dev/null || echo "")

  CUSTOM_CHECK=$(python3 -c "
import yaml, sys
try:
    d = yaml.safe_load(open('project.yaml'))
    print(d.get('scripts', {}).get('check', ''))
except:
    print('')
" 2>/dev/null || echo "")
fi

CHECK_OUTPUT=""

# ---------------------------------------------------------------------------
# Step 3 — Run checks
# ---------------------------------------------------------------------------

# Helper: check if any changed file matches a glob pattern
files_matching() {
  local pattern="$1"
  echo "$ALL_CHANGED" | tr ' ' '\n' | grep -E "$pattern" 2>/dev/null || true
}

if [ -n "$CUSTOM_CHECK" ]; then
  # Run user-defined check command
  CHECK_OUTPUT=$(eval "$CUSTOM_CHECK" 2>&1 | head -20 || true)

else
  # Auto-detect by file type

  # TypeScript / JavaScript
  TS_FILES=$(files_matching '\.(ts|tsx)$')
  if [ -n "$TS_FILES" ]; then
    if [ -f "turbo.json" ] && command -v pnpm &>/dev/null; then
      TSC_OUTPUT=$(pnpm turbo typecheck 2>&1 | head -20 || pnpm tsc --noEmit 2>&1 | head -20 || true)
    elif command -v pnpm &>/dev/null; then
      TSC_OUTPUT=$(pnpm tsc --noEmit 2>&1 | head -20 || true)
    elif command -v npx &>/dev/null; then
      TSC_OUTPUT=$(npx tsc --noEmit 2>&1 | head -20 || true)
    else
      TSC_OUTPUT=""
    fi
    if [ -n "${TSC_OUTPUT:-}" ]; then
      CHECK_OUTPUT="${CHECK_OUTPUT:+$CHECK_OUTPUT$'\n'}[tsc] $TSC_OUTPUT"
    fi
  fi

  # PHP
  PHP_FILES=$(files_matching '\.php$')
  if [ -n "$PHP_FILES" ] && [ -f "composer.json" ]; then
    if command -v composer &>/dev/null; then
      PHP_OUTPUT=$(composer validate --no-check-publish 2>&1 | head -10 || true)
      if [ -n "$PHP_OUTPUT" ]; then
        CHECK_OUTPUT="${CHECK_OUTPUT:+$CHECK_OUTPUT$'\n'}[composer] $PHP_OUTPUT"
      fi
    fi
  fi

  # Python
  PY_FILES=$(files_matching '\.py$')
  if [ -n "$PY_FILES" ]; then
    PY_OUTPUT=""
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      [ -f "$f" ] || continue
      RESULT=$(python3 -m py_compile "$f" 2>&1 || true)
      if [ -n "$RESULT" ]; then
        PY_OUTPUT="${PY_OUTPUT:+$PY_OUTPUT$'\n'}$f: $RESULT"
      fi
    done <<< "$PY_FILES"
    if [ -n "$PY_OUTPUT" ]; then
      CHECK_OUTPUT="${CHECK_OUTPUT:+$CHECK_OUTPUT$'\n'}[python] $PY_OUTPUT"
    fi
  fi

  # Ruby
  RB_FILES=$(files_matching '\.rb$')
  if [ -n "$RB_FILES" ] && [ -f "Gemfile" ]; then
    RB_OUTPUT=""
    if command -v bundle &>/dev/null; then
      while IFS= read -r f; do
        [ -z "$f" ] && continue
        [ -f "$f" ] || continue
        RESULT=$(bundle exec ruby -c "$f" 2>&1 | head -10 || true)
        if [ -n "$RESULT" ]; then
          RB_OUTPUT="${RB_OUTPUT:+$RB_OUTPUT$'\n'}$f: $RESULT"
        fi
      done <<< "$RB_FILES"
    fi
    if [ -n "$RB_OUTPUT" ]; then
      CHECK_OUTPUT="${CHECK_OUTPUT:+$CHECK_OUTPUT$'\n'}[ruby] $RB_OUTPUT"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Step 4 — Report
# ---------------------------------------------------------------------------
if [ -n "$CHECK_OUTPUT" ]; then
  echo "── Forge Codex post-session check ───────────"
  echo "$CHECK_OUTPUT"
  echo "─────────────────────────────────────────────"
fi

# Siempre exit 0 — este hook nunca bloquea.
exit 0
