#!/usr/bin/env bash
# setup-codex.sh — Inicializar soporte de Forge v2 para Codex CLI
#
# Uso:
#   bash scripts/setup-codex.sh
#
# Qué hace:
#   1. Verifica que git y python3 están disponibles
#   2. Inicializa el submódulo de forge si es necesario
#   3. Crea .codex/codex.yaml desde la plantilla (si no existe)
#   4. Copia los scripts de hooks a .codex/
#   5. Ejecuta generate-codex-config.py para generar AGENTS.md
#   6. Imprime resumen de lo que se instaló

set -euo pipefail

# ---------------------------------------------------------------------------
# Colores para output (solo si el terminal los soporta)
# ---------------------------------------------------------------------------
if [ -t 1 ] && command -v tput &>/dev/null && tput colors &>/dev/null 2>&1; then
    GREEN="$(tput setaf 2)"
    YELLOW="$(tput setaf 3)"
    RED="$(tput setaf 1)"
    RESET="$(tput sgr0)"
else
    GREEN=""
    YELLOW=""
    RED=""
    RESET=""
fi

ok()   { printf "  %s[OK]%s   %s\n" "$GREEN" "$RESET" "$1"; }
warn() { printf "  %s[WARN]%s %s\n" "$YELLOW" "$RESET" "$1"; }
fail() { printf "  %s[FAIL]%s %s\n" "$RED" "$RESET" "$1"; }

echo ""
echo "forge — Setup Codex CLI adapter"
echo "================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1 — Verificar herramientas requeridas
# ---------------------------------------------------------------------------
echo "Verificando herramientas..."

if ! command -v git &>/dev/null; then
    fail "git no está instalado o no está en PATH"
    echo ""
    echo "Instalar git: https://git-scm.com/downloads"
    exit 1
fi
ok "git $(git --version | awk '{print $3}')"

if ! command -v python3 &>/dev/null; then
    fail "python3 no está instalado o no está en PATH"
    echo ""
    echo "Instalar python3: https://www.python.org/downloads/"
    exit 1
fi
ok "python3 $(python3 --version | awk '{print $2}')"

if ! python3 -c "import yaml" &>/dev/null 2>&1; then
    warn "pyyaml no está instalado — instalando..."
    if python3 -m pip install pyyaml --quiet; then
        ok "pyyaml instalado"
    else
        fail "No se pudo instalar pyyaml. Instalar manualmente: pip install pyyaml"
        exit 1
    fi
else
    ok "pyyaml disponible"
fi

echo ""

# ---------------------------------------------------------------------------
# Step 2 — Verificar que estamos en la raíz del repositorio con project.yaml
# ---------------------------------------------------------------------------
echo "Verificando proyecto..."

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$REPO_ROOT" ]]; then
    fail "No se encontró repositorio git. Ejecutar desde dentro del repositorio."
    exit 1
fi

if [[ ! -f "$REPO_ROOT/project.yaml" ]]; then
    warn "project.yaml no encontrado en $REPO_ROOT"
    warn "Ejecutar primero: python3 scripts/forge-wizard.py"
    warn "Continuando de todas formas — AGENTS.md puede quedar incompleto."
else
    ok "project.yaml encontrado"
fi

echo ""

# ---------------------------------------------------------------------------
# Step 3 — Encontrar el directorio de forge
# ---------------------------------------------------------------------------
echo "Localizando forge..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_DIR="$(dirname "$SCRIPT_DIR")"

if [[ ! -d "$FORGE_DIR/core" ]]; then
    # Intentar inicializar submódulo si hay .gitmodules
    if [[ -f "$REPO_ROOT/.gitmodules" ]] && grep -q "forge\|agentic" "$REPO_ROOT/.gitmodules" 2>/dev/null; then
        warn "Directorio core/ no encontrado — intentando inicializar submódulo..."
        if git -C "$REPO_ROOT" submodule update --init --recursive 2>/dev/null; then
            ok "Submódulo inicializado"
        else
            fail "No se pudo inicializar el submódulo. Verificar .gitmodules."
            exit 1
        fi
    else
        fail "No se encontró el directorio core/ en $FORGE_DIR"
        fail "Asegurarse de que forge está instalado como submódulo o en el PATH correcto."
        exit 1
    fi
else
    ok "forge encontrado en $FORGE_DIR"
fi

CODEX_ADAPTER_DIR="$FORGE_DIR/adapters/codex"
if [[ ! -d "$CODEX_ADAPTER_DIR" ]]; then
    fail "No se encontró $CODEX_ADAPTER_DIR"
    exit 1
fi

echo ""

# ---------------------------------------------------------------------------
# Step 4 — Crear .codex/ y copiar codex.yaml desde plantilla
# ---------------------------------------------------------------------------
echo "Configurando .codex/..."

DOTCODEX_DIR="$REPO_ROOT/.codex"
mkdir -p "$DOTCODEX_DIR"
ok "Directorio .codex/ listo"

YAML_TPL="$CODEX_ADAPTER_DIR/hooks/codex.yaml.tpl"
YAML_DST="$DOTCODEX_DIR/codex.yaml"

if [[ -f "$YAML_DST" ]]; then
    warn "codex.yaml ya existe — no sobreescribiendo. Revisar manualmente si hay cambios en la plantilla."
else
    if [[ -f "$YAML_TPL" ]]; then
        cp "$YAML_TPL" "$YAML_DST"
        ok "codex.yaml copiado desde plantilla"
    else
        fail "Plantilla no encontrada: $YAML_TPL"
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Step 5 — Copiar scripts de hooks a .codex/
# ---------------------------------------------------------------------------
echo ""
echo "Instalando hooks..."

HOOKS_SRC="$CODEX_ADAPTER_DIR/hooks"

for hook_script in forge-codex-start.sh forge-codex-finish.sh; do
    SRC="$HOOKS_SRC/$hook_script"
    DST="$DOTCODEX_DIR/$hook_script"
    if [[ ! -f "$SRC" ]]; then
        fail "Script de hook no encontrado: $SRC"
        exit 1
    fi
    cp "$SRC" "$DST"
    chmod +x "$DST"
    ok "$hook_script instalado en .codex/"
done

echo ""

# ---------------------------------------------------------------------------
# Step 6 — Generar AGENTS.md
# ---------------------------------------------------------------------------
echo "Generando AGENTS.md..."

GENERATOR="$CODEX_ADAPTER_DIR/generate-codex-config.py"
if [[ ! -f "$GENERATOR" ]]; then
    fail "generate-codex-config.py no encontrado en $CODEX_ADAPTER_DIR"
    exit 1
fi

if python3 "$GENERATOR"; then
    ok "AGENTS.md generado"
else
    fail "Error al generar AGENTS.md"
    exit 1
fi

echo ""

# ---------------------------------------------------------------------------
# Step 7 — Diff summary
# ---------------------------------------------------------------------------
echo "Resumen de cambios:"
echo ""

AGENTS_MD="$REPO_ROOT/AGENTS.md"
if git -C "$REPO_ROOT" diff --name-only HEAD -- AGENTS.md 2>/dev/null | grep -q "AGENTS.md"; then
    LINES=$(wc -l < "$AGENTS_MD" | tr -d ' ')
    ok "AGENTS.md actualizado ($LINES líneas)"
elif [[ -f "$AGENTS_MD" ]]; then
    LINES=$(wc -l < "$AGENTS_MD" | tr -d ' ')
    ok "AGENTS.md generado ($LINES líneas) — sin cambios vs HEAD"
fi

echo ""
echo "Archivos instalados en .codex/:"
for f in "$DOTCODEX_DIR"/*; do
    printf "  - .codex/%s\n" "$(basename "$f")"
done

echo ""
echo "================================"
ok "Setup completado. Codex CLI está listo para usar con Forge v2."
echo ""
echo "Próximos pasos:"
echo "  1. Revisar .codex/codex.yaml y ajustar el modelo si es necesario."
echo "  2. Commitear los archivos generados:"
echo "     git add AGENTS.md .codex/"
echo "     git commit -m 'chore(codex): initialize Forge v2 Codex adapter'"
echo "  3. Consultar adapters/codex/commands/ para los prompt templates de cada comando."
echo ""
