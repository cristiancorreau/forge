#!/usr/bin/env bash
# team-install.sh — Automates forge setup for a new developer joining a project.
#
# Usage:
#   bash .agentic/scripts/team-install.sh
#   bash scripts/team-install.sh        (if running from repo root and forge is at .agentic/)
#
# What it does:
#   1. Checks git is available
#   2. Ensures the forge submodule is initialized
#   3. Installs Python dependencies (pyyaml)
#   4. Runs forge-init in non-interactive mode
#   5. Prints next steps

set -euo pipefail

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${BOLD}[forge]${RESET} $*"; }
success() { echo -e "${GREEN}[forge]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[forge] WARNING:${RESET} $*"; }
error()   { echo -e "${RED}[forge] ERROR:${RESET} $*" >&2; }

# ---------------------------------------------------------------------------
# 1. Check git
# ---------------------------------------------------------------------------
info "Checking requirements..."

if ! command -v git &>/dev/null; then
  error "git is not installed or not in PATH."
  error "Install git from https://git-scm.com and retry."
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  error "python3 is not installed or not in PATH."
  error "Install Python 3.9+ from https://www.python.org/downloads/ and retry."
  exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]; }; then
  error "Python 3.9+ is required. Found: $PYTHON_VERSION"
  exit 1
fi

success "git and python3 ($PYTHON_VERSION) are available."

# ---------------------------------------------------------------------------
# 2. Locate repo root
# ---------------------------------------------------------------------------
if ! ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then
  error "Not inside a git repository. Run this script from within the project directory."
  exit 1
fi

info "Repository root: $ROOT"

# ---------------------------------------------------------------------------
# 3. Initialize submodule if needed
# ---------------------------------------------------------------------------
FORGE_PY=""

for candidate in "$ROOT/.agentic" "$ROOT/forge" "$ROOT/.forge"; do
  if [ -f "$candidate/forge.py" ]; then
    FORGE_PY="$candidate/forge.py"
    FORGE_DIR="$candidate"
    break
  fi
done

if [ -z "$FORGE_PY" ]; then
  info "forge not found — initializing git submodules..."
  git -C "$ROOT" submodule update --init --recursive

  # Try again after submodule init
  for candidate in "$ROOT/.agentic" "$ROOT/forge" "$ROOT/.forge"; do
    if [ -f "$candidate/forge.py" ]; then
      FORGE_PY="$candidate/forge.py"
      FORGE_DIR="$candidate"
      break
    fi
  done
fi

if [ -z "$FORGE_PY" ]; then
  error "forge.py not found after submodule initialization."
  error "Checked: .agentic/, forge/, .forge/"
  error "Ask a team lead for the correct forge submodule path."
  exit 1
fi

success "forge found at: $FORGE_DIR"

# ---------------------------------------------------------------------------
# 4. Install Python dependencies
# ---------------------------------------------------------------------------
REQUIREMENTS="$FORGE_DIR/requirements.txt"

if [ -f "$REQUIREMENTS" ]; then
  info "Installing Python dependencies..."
  python3 -m pip install -r "$REQUIREMENTS" --quiet
  success "Dependencies installed."
else
  warn "requirements.txt not found at $REQUIREMENTS — skipping pip install."
  warn "If forge fails, run: pip3 install pyyaml"
fi

# ---------------------------------------------------------------------------
# 5. Run forge-init (non-interactive)
# ---------------------------------------------------------------------------
INIT_SCRIPT="$FORGE_DIR/scripts/forge-init.py"

if [ -f "$INIT_SCRIPT" ]; then
  info "Running forge-init (non-interactive)..."
  python3 "$INIT_SCRIPT" --tool claude-code
else
  warn "forge-init.py not found at $INIT_SCRIPT"
  warn "Run the interactive CLI manually: python3 $FORGE_PY"
  warn "Then select 'Inicializar agentes' from the menu."
  exit 0
fi

# ---------------------------------------------------------------------------
# 6. Done
# ---------------------------------------------------------------------------
echo ""
success "forge is ready."
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "  1. Open Claude Code in this project directory"
echo -e "  2. Run ${BOLD}/session-start${RESET} to begin your first session"
echo -e "  3. The orchestrator will brief you on the current sprint"
echo ""
echo -e "  ${BOLD}Agents installed:${RESET} $(ls "$ROOT/.claude/agents/" 2>/dev/null | wc -l | tr -d ' ') agents in .claude/agents/"
echo -e "  ${BOLD}Commands installed:${RESET} $(ls "$ROOT/.claude/commands/" 2>/dev/null | wc -l | tr -d ' ') commands in .claude/commands/"
echo ""
