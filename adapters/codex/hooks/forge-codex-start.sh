#!/usr/bin/env bash
# Forge v2 — Codex onStart hook: forge-codex-start.sh
#
# Se ejecuta al inicio de cada sesión de Codex CLI.
# Equivalente al hook session-start.sh de Claude Code (UserPromptSubmit).
#
# DIFERENCIAS vs Claude Code:
#   - Claude Code: session-start.sh corre en UserPromptSubmit (automático en cada sesión).
#   - Codex CLI: este script corre en onStart (automático también, pero el timing
#     exacto depende de la versión de Codex).
#   - Claude Code: puede bloquear (exit 2) para detener la sesión.
#   - Codex CLI: onStart no puede bloquear la sesión — solo puede imprimir advertencias.
#     Exit 2 aquí no impide que Codex continúe; es informacional.
#
# LIMITACIONES de Codex vs Claude Code:
#   - No hay PreToolUse: no se puede interceptar comandos individuales antes de ejecutarlos.
#   - No hay PostToolUse: no se puede inspeccionar el resultado de cada tool call.
#   - Las reglas de seguridad (pre-bash-check, branch guard) son instruccionales en
#     AGENTS.md, no mecánicas. El agente debe respetar las reglas voluntariamente.
#
# Instalación: este script debe copiarse o enlazarse en .codex/forge-codex-start.sh
# El setup-codex.sh lo hace automáticamente.

set -uo pipefail

CHECKS_PASSED=0
CHECKS_TOTAL=0
OUTPUT=""

check() {
    local name="$1"
    local result="$2"   # "ok" | "warn: <msg>" | "error: <msg>"
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    if [[ "$result" == "ok" ]]; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    elif [[ "$result" == error:* ]]; then
        local msg="${result#error: }"
        OUTPUT+="  error: ${msg}\n"
    else
        local msg="${result#warn: }"
        OUTPUT+="  warn: ${msg}\n"
    fi
}

# ---------------------------------------------------------------------------
# Check 1 — Herramientas básicas disponibles
# ---------------------------------------------------------------------------
if ! command -v git &>/dev/null; then
    check "git" "error: git no está instalado o no está en PATH"
else
    check "git" "ok"
fi

if ! command -v python3 &>/dev/null; then
    check "python3" "error: python3 no está instalado o no está en PATH"
else
    check "python3" "ok"
fi

# ---------------------------------------------------------------------------
# Check 2 — Branch actual no es main/master
# ---------------------------------------------------------------------------
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
    check "branch" "warn: branch '${CURRENT_BRANCH}' — crea una feature branch antes de implementar: git checkout -b feature/<tema>-$(date +%Y-%m-%d)"
else
    check "branch" "ok"
fi

# ---------------------------------------------------------------------------
# Check 3 — Cambios sin commitear
# ---------------------------------------------------------------------------
GIT_STATUS="$(git status --short 2>/dev/null || true)"
if [[ -n "$GIT_STATUS" ]]; then
    check "uncommitted" "warn: cambios sin commitear en el worktree"
else
    check "uncommitted" "ok"
fi

# ---------------------------------------------------------------------------
# Check 4 — project.yaml existe
# ---------------------------------------------------------------------------
PROJECT_YAML=""
SEARCH_PATH="$(pwd)"
for _i in 1 2 3 4 5 6; do
    if [[ -f "${SEARCH_PATH}/project.yaml" ]]; then
        PROJECT_YAML="${SEARCH_PATH}/project.yaml"
        break
    fi
    PARENT="$(dirname "$SEARCH_PATH")"
    [[ "$PARENT" == "$SEARCH_PATH" ]] && break
    SEARCH_PATH="$PARENT"
done

if [[ -z "$PROJECT_YAML" ]]; then
    check "project.yaml" "warn: project.yaml no encontrado — ejecutar forge-wizard.py o scripts/setup-codex.sh"
else
    check "project.yaml" "ok"

    # Check 5 — project.yaml tiene campos requeridos
    YAML_VALID="$(python3 - "$PROJECT_YAML" <<'PYEOF'
import sys, yaml
path = sys.argv[1]
try:
    with open(path) as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        print("invalid")
        sys.exit(0)
    missing = []
    project = data.get("project", {})
    if not project.get("name"):
        missing.append("project.name")
    if not project.get("mode"):
        missing.append("project.mode")
    if missing:
        print("missing:" + ",".join(missing))
    else:
        print("ok")
except Exception as e:
    print(f"error:{e}")
PYEOF
)"
    if [[ "$YAML_VALID" == "ok" ]]; then
        check "project.yaml.fields" "ok"
    elif [[ "$YAML_VALID" == missing:* ]]; then
        MISSING_FIELDS="${YAML_VALID#missing:}"
        check "project.yaml.fields" "warn: project.yaml faltan campos: ${MISSING_FIELDS}"
    else
        check "project.yaml.fields" "warn: project.yaml no se pudo parsear — verificar sintaxis"
    fi

    # Check 6 — Variables de entorno de producción activas
    HAS_DEPLOY="$(python3 - "$PROJECT_YAML" <<'PYEOF'
import sys, yaml
path = sys.argv[1]
try:
    with open(path) as f:
        data = yaml.safe_load(f)
    if isinstance(data, dict) and data.get("deploy"):
        print("yes")
    else:
        print("no")
except Exception:
    print("no")
PYEOF
)"
    if [[ "$HAS_DEPLOY" == "yes" ]]; then
        PROD_VARS=""
        while IFS='=' read -r key _value; do
            if [[ "$key" =~ ^(PROD_|PRODUCTION_|PROD$|PRODUCTION$) ]]; then
                PROD_VARS+="${key} "
            fi
        done < <(env)
        if [[ -n "$PROD_VARS" ]]; then
            check "prod-env" "warn: variables de producción activas en sesión: ${PROD_VARS// /, } — verificar que es intencional"
        else
            check "prod-env" "ok"
        fi
    else
        check "prod-env" "ok"
    fi
fi

# ---------------------------------------------------------------------------
# Salida
# ---------------------------------------------------------------------------
WARNINGS=$((CHECKS_TOTAL - CHECKS_PASSED))

if [[ $WARNINGS -eq 0 ]]; then
    # Silencioso — todo OK
    exit 0
fi

# Construir etiquetas para el resumen
LABELS=""
[[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]] && LABELS+="[branch ${CURRENT_BRANCH}] "
[[ -n "$GIT_STATUS" ]] && LABELS+="[cambios sin commitear] "
[[ -z "$PROJECT_YAML" ]] && LABELS+="[sin project.yaml] "

printf "forge-codex session: %d advertencia(s) — %s\n" "$WARNINGS" "${LABELS%% }"
printf "%b" "$OUTPUT"

# Nota: en Codex CLI, onStart no puede bloquear la sesión.
# Salimos con 0 siempre — las advertencias son informacionales.
exit 0
