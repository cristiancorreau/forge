#!/usr/bin/env python3
"""
forge-generate-all.py — Regenera configuración para todos los runtimes instalados.

Usage:
  python3 scripts/forge-generate-all.py
  python3 scripts/forge-generate-all.py --runtime claude-code
  python3 scripts/forge-generate-all.py --runtime opencode
  python3 scripts/forge-generate-all.py --runtime codex
  python3 scripts/forge-generate-all.py --runtime kiro
  python3 scripts/forge-generate-all.py --dry-run
  python3 scripts/forge-generate-all.py --runtime claude-code --dry-run

Lee project.yaml y llama a los generadores de cada runtime instalado.

Detección automática de runtimes activos:
  - claude-code → existe .claude/ en la raíz del proyecto
  - opencode    → existe .opencode/ en la raíz del proyecto
  - codex       → existe AGENTS.md Y no hay .claude/ (AGENTS.md es de Codex, no OpenCode)
  - kiro        → existe .kiro/ en la raíz del proyecto

Si project.yaml tiene una sección `runtimes.active`, esa lista tiene prioridad
sobre la auto-detección.

Nota: forge-init.py llama a los generadores individuales por separado.
Este script es el punto de entrada unificado para regeneración post-init.

Requiere: pyyaml
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml requerido. pip install pyyaml", file=sys.stderr)
    sys.exit(1)

# --- Constantes ---

ALL_RUNTIMES = ["claude-code", "opencode", "codex", "kiro"]

ADAPTER_SCRIPTS: dict[str, str] = {
    "claude-code": "adapters/claude-code/generate-claude-md.py",
    "opencode":    "adapters/opencode/generate-agents-md.py",
    "codex":       "adapters/codex/generate-codex-config.py",
    "kiro":        "adapters/kiro/generate-steering.py",
}

# Archivos / dirs que indican que un runtime está instalado en el proyecto
RUNTIME_MARKERS: dict[str, list[str]] = {
    "claude-code": [".claude"],
    "opencode":    [".opencode"],
    "kiro":        [".kiro"],
    # Codex: AGENTS.md existe y no hay .claude/ (OpenCode también usa AGENTS.md,
    # así que sólo lo activamos si no hay .opencode/ ni .claude/).
    "codex":       ["AGENTS.md"],
}


# --- Helpers ---

def find_project_root() -> Path:
    here = Path.cwd()
    for p in [here] + list(here.parents):
        if (p / "project.yaml").exists():
            return p
    raise FileNotFoundError(
        "No se encontró project.yaml.\n"
        "  → Copiar la plantilla: cp templates/project.yaml.tpl project.yaml\n"
        "  → O correr el wizard: python3 scripts/forge-wizard.py"
    )


def find_forge_dir() -> Path:
    root = find_project_root()
    for candidate in [root / ".agentic", root / "forge", Path(__file__).parent.parent]:
        if (candidate / "core").exists():
            return candidate
    raise FileNotFoundError("No se encontró el directorio forge con core/")


def load_config(root: Path) -> dict:
    with open(root / "project.yaml") as f:
        return yaml.safe_load(f) or {}


def detect_active_runtimes(root: Path, config: dict) -> list[str]:
    """
    Determina qué runtimes están activos.

    Prioridad:
    1. project.yaml → runtimes.active  (explícito, gana siempre)
    2. Auto-detección por marcadores en el sistema de archivos
    """
    # 1. Declaración explícita en project.yaml
    runtimes_cfg = config.get("runtimes", {})
    declared = runtimes_cfg.get("active") if runtimes_cfg else None
    if declared:
        return [r for r in declared if r in ALL_RUNTIMES]

    # 2. Auto-detección
    active: list[str] = []
    has_claude = (root / ".claude").exists()
    has_opencode = (root / ".opencode").exists()

    for runtime, markers in RUNTIME_MARKERS.items():
        for marker in markers:
            if (root / marker).exists():
                # AGENTS.md sin .claude y sin .opencode → Codex
                if runtime == "codex" and (has_claude or has_opencode):
                    continue
                active.append(runtime)
                break

    return active


def parse_args() -> tuple[str | None, bool]:
    """Retorna (runtime_override, dry_run)."""
    runtime: str | None = None
    dry_run = "--dry-run" in sys.argv

    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--runtime" and i + 1 < len(args):
            runtime = args[i + 1]
        elif arg.startswith("--runtime="):
            runtime = arg.split("=", 1)[1]

    if runtime and runtime not in ALL_RUNTIMES:
        print(f"ERROR: runtime desconocido '{runtime}'. Opciones: {', '.join(ALL_RUNTIMES)}", file=sys.stderr)
        sys.exit(1)

    return runtime, dry_run


def run_generator(
    forge: Path,
    root: Path,
    runtime: str,
    dry_run: bool,
    force: bool,
) -> tuple[str, list[str]]:
    """
    Ejecuta el generador para el runtime dado.

    Retorna (status, archivos_generados).
    Status: "OK" | "DRY-RUN" | "MISS" | "ERR"
    """
    rel_script = ADAPTER_SCRIPTS[runtime]
    script = forge / rel_script

    if not script.exists():
        return "MISS", []

    if dry_run:
        return "DRY-RUN", _expected_files(runtime, root)

    args = ["python3", str(script)]
    if force:
        args.append("--force")

    result = subprocess.run(args, cwd=str(root), capture_output=True, text=True)

    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip()
        return f"ERR: {err[:80]}", []

    return "OK", _expected_files(runtime, root)


def _expected_files(runtime: str, root: Path) -> list[str]:
    """Retorna la lista de archivos que genera cada runtime (para el resumen)."""
    files_map = {
        "claude-code": ["CLAUDE.md"],
        "opencode":    ["AGENTS.md"],
        "codex":       ["AGENTS.md"],
        "kiro":        [
            ".kiro/steering/product.md",
            ".kiro/steering/structure.md",
            ".kiro/steering/agents.md",
        ],
    }
    return files_map.get(runtime, [])


def print_summary(results: list[tuple[str, str, list[str]]]):
    """Imprime la tabla resumen: Runtime | Status | Archivos."""
    col_w = [13, 14, 35]
    sep = "+" + "+".join("-" * (w + 2) for w in col_w) + "+"
    header = "| {:<{}} | {:<{}} | {:<{}} |".format(
        "Runtime", col_w[0], "Status", col_w[1], "Archivos generados", col_w[2]
    )

    print()
    print(sep)
    print(header)
    print(sep)

    for runtime, status, files in results:
        files_str = ", ".join(files) if files else "—"
        # Truncar si es muy largo
        if len(files_str) > col_w[2]:
            files_str = files_str[: col_w[2] - 1] + "…"
        icon = "OK" if status == "OK" else status
        print("| {:<{}} | {:<{}} | {:<{}} |".format(
            runtime, col_w[0], icon, col_w[1], files_str, col_w[2]
        ))

    print(sep)
    print()


# --- Entry point ---

def main():
    runtime_filter, dry_run = parse_args()
    force = "--force" in sys.argv

    try:
        root = find_project_root()
        forge = find_forge_dir()
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    config = load_config(root)

    print(f"forge-generate-all")
    print(f"  Proyecto : {config.get('project', {}).get('name', '?')}")
    print(f"  Root     : {root}")
    print(f"  Forge    : {forge}")
    if dry_run:
        print(f"  Modo     : DRY-RUN (no escribe archivos)")
    if force:
        print(f"  Force    : sí — sobreescribe existentes")
    print()

    # Runtimes a procesar
    if runtime_filter:
        runtimes_to_run = [runtime_filter]
        print(f"  Runtime  : {runtime_filter} (explícito via --runtime)")
    else:
        runtimes_to_run = detect_active_runtimes(root, config)
        if not runtimes_to_run:
            print("  No se detectaron runtimes activos.")
            print("  → Instalar un runtime primero (ej: python3 scripts/forge-init.py --tool claude-code)")
            print("  → O declarar runtimes.active en project.yaml")
            sys.exit(0)
        source = "project.yaml" if config.get("runtimes", {}).get("active") else "auto-detectado"
        print(f"  Runtimes : {', '.join(runtimes_to_run)} ({source})")

    print()

    results: list[tuple[str, str, list[str]]] = []
    errors = 0

    for runtime in runtimes_to_run:
        print(f"  [{runtime}] generando...", end="", flush=True)
        status, files = run_generator(forge, root, runtime, dry_run, force)
        print(f" {status}")
        if status.startswith("ERR"):
            errors += 1
        results.append((runtime, status, files))

    print_summary(results)

    if dry_run:
        print("  DRY-RUN: ningún archivo fue modificado.")
        print("  Correr sin --dry-run para aplicar los cambios.")
    elif errors == 0:
        print("  Configuración regenerada. Revisar los archivos antes de commitear.")
    else:
        print(f"  {errors} runtime(s) con errores. Ver detalles arriba.")
        sys.exit(1)


if __name__ == "__main__":
    main()
