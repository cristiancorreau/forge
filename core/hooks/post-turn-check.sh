#!/usr/bin/env bash
# Forge v2 — Stop hook: post-turn-check.sh
# Runs after each Claude turn. Detects modified files and runs type/syntax checks.
# Always exits 0 (never blocks).

set -euo pipefail

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
    TSC_CMD=""
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
  echo "── Forge post-turn check ─────────────────"
  echo "$CHECK_OUTPUT"
  echo "──────────────────────────────────────────"
fi

exit 0
