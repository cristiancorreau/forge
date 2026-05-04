#!/usr/bin/env python3
"""
forge-teardown.py — Elimina la configuración de forge de un proyecto.

Usage:
  python3 .agentic/scripts/forge-teardown.py           # preview (dry-run)
  python3 .agentic/scripts/forge-teardown.py --confirm # ejecutar

Qué elimina:
  - .claude/agents/ instalados por forge (solo los que coinciden con el roster declarado)
  - .claude/commands/ instalados por forge (wiki-ingest.md, wiki-query.md, wiki-lint.md)
  - AGENTS.md (generado por forge-init.py)
  - Entrada del submodule .agentic en .gitmodules y .git/config (si aplica)

Qué NO elimina:
  - project.yaml (fuente de verdad del proyecto — puede reutilizarse)
  - CLAUDE.md (puede haberse customizado manualmente)
  - .claude/agents/ creados manualmente (Tier 3 — no están en forge)
  - docs/wiki/ ni cualquier otro contenido generado por el equipo
  - El hook pre-commit (instalado por el usuario manualmente — desactivar con: git config --unset core.hooksPath)

Requiere: pyyaml
"""
import subprocess
import sys
import shutil
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml requerido. pip install pyyaml", file=sys.stderr)
    sys.exit(1)

DRY_RUN = "--confirm" not in sys.argv


def find_project_root() -> Path:
    here = Path.cwd()
    for p in [here] + list(here.parents):
        if (p / "project.yaml").exists():
            return p
    raise FileNotFoundError("No se encontró project.yaml")


def find_forge_dir() -> Path:
    root = find_project_root()
    for candidate in [root / ".agentic", root / "forge", Path(__file__).parent.parent]:
        if (candidate / "core").exists():
            return candidate
    raise FileNotFoundError("No se encontró el directorio forge con core/")


def load_project(root: Path) -> dict:
    with open(root / "project.yaml") as f:
        return yaml.safe_load(f)


def get_forge_agent_names(forge: Path, config: dict) -> set[str]:
    """Retorna los nombres de agentes que forge podría haber instalado."""
    agents_cfg = config.get("agents", {})
    profiles = agents_cfg.get("profiles", [])

    names: set[str] = set()
    # Core agents
    for name in (agents_cfg.get("active", []) + agents_cfg.get("compliance", [])):
        if (forge / "core" / "agents" / f"{name}.md").exists():
            names.add(name)
    # Profile agents
    for profile in profiles:
        profile_dir = forge / "profiles" / profile / "agents"
        if profile_dir.exists():
            for f in profile_dir.glob("*.md"):
                names.add(f.stem)
    return names


def action(label: str, path: Path, is_dir: bool = False):
    rel = path
    try:
        rel = path.relative_to(Path.cwd())
    except ValueError:
        pass

    if DRY_RUN:
        kind = "DIR " if is_dir else "FILE"
        print(f"  [DRY] {label} {kind} {rel}")
        return

    if is_dir and path.exists():
        shutil.rmtree(path)
        print(f"  [DEL] DIR  {rel}")
    elif path.exists():
        path.unlink()
        print(f"  [DEL] FILE {rel}")
    else:
        print(f"  [SKIP] no existe: {rel}")


def _remove_submodule(dry_run: bool) -> bool:
    """Remueve .agentic como git submodule. Retorna True si éxito."""
    cmds = [
        ["git", "rm", "--cached", ".agentic"],
        ["git", "config", "--remove-section", "submodule..agentic"],
    ]
    dirs_to_remove = [Path(".agentic"), Path(".git/modules/.agentic")]

    if dry_run:
        print("  [DRY] ejecutaría:")
        for cmd in cmds:
            print(f"         $ {' '.join(cmd)}")
        for d in dirs_to_remove:
            print(f"         $ rm -rf {d}")
        return True

    success = True
    for cmd in cmds:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            # Puede fallar si ya fue removido — no es error fatal
            pass

    for d in dirs_to_remove:
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)

    print("  [OK] Submodule .agentic removido")
    return success


def main():
    try:
        root = find_project_root()
        forge = find_forge_dir()
        config = load_project(root)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    if DRY_RUN:
        print("=== forge-teardown (DRY RUN — pasar --confirm para ejecutar) ===\n")
    else:
        print("=== forge-teardown ===\n")

    forge_agents = get_forge_agent_names(forge, config)
    agents_dir = root / ".claude" / "agents"

    print("Agentes instalados por forge:")
    for name in sorted(forge_agents):
        agent_path = agents_dir / f"{name}.md"
        action("eliminar", agent_path)

    print("\nSlash commands de forge:")
    forge_commands = ["wiki-ingest.md", "wiki-query.md", "wiki-lint.md"]
    for cmd in forge_commands:
        action("eliminar", root / ".claude" / "commands" / cmd)

    print("\nArchivos generados por forge:")
    action("eliminar", root / "AGENTS.md")

    # Verificar si .claude/agents/ quedó vacío
    if not DRY_RUN and agents_dir.exists():
        remaining = list(agents_dir.glob("*.md"))
        if not remaining:
            action("eliminar directorio vacío", agents_dir, is_dir=True)
        else:
            print(f"\n  [INFO] .claude/agents/ retiene {len(remaining)} agente(s) no instalados por forge:")
            for f in sorted(remaining):
                print(f"         {f.name}")

    # Submodule
    gitmodules = root / ".gitmodules"
    if gitmodules.exists():
        content = gitmodules.read_text()
        if ".agentic" in content or "forge" in content:
            print("\nSubmodule forge detectado:")
            _remove_submodule(DRY_RUN)

    print("\nHook pre-commit:")
    print("  [INFO] Si instalaste el hook, desactivarlo con:")
    print("         git config --unset core.hooksPath")
    print("         rm .githooks/pre-commit  # si existe")

    print()
    if DRY_RUN:
        print("Nada fue eliminado. Pasar --confirm para ejecutar.")
    else:
        print("Teardown completado.")
        print("Revisar CLAUDE.md — puede tener referencias a forge que quieras actualizar.")


if __name__ == "__main__":
    main()
