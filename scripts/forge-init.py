#!/usr/bin/env python3
"""
forge-init.py — Setup de un proyecto nuevo con el framework forge.

Usage:
  python3 .agentic/scripts/forge-init.py --tool claude-code
  python3 .agentic/scripts/forge-init.py --tool opencode
  python3 .agentic/scripts/forge-init.py --tool kiro
  python3 .agentic/scripts/forge-init.py --tool all

Lee project.yaml en la raíz del proyecto y genera la configuración
para el tool especificado.

Requiere: python3 + pyyaml (pip install pyyaml)
"""
import os
import sys
import json
import shutil
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml requerido. Instalar con: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


def find_project_root() -> Path:
    """Sube desde el directorio actual hasta encontrar project.yaml."""
    here = Path.cwd()
    for p in [here] + list(here.parents):
        if (p / "project.yaml").exists():
            return p
    raise FileNotFoundError("No se encontró project.yaml. Crearlo desde templates/project.yaml.tpl")


def find_forge_dir() -> Path:
    """Encuentra el directorio de forge (submodule o directorio propio)."""
    root = find_project_root()
    for candidate in [root / ".agentic", root / "forge", Path(__file__).parent.parent]:
        if (candidate / "core").exists():
            return candidate
    raise FileNotFoundError("No se encontró el directorio forge con core/")


def load_project(root: Path) -> dict:
    with open(root / "project.yaml") as f:
        return yaml.safe_load(f)


def get_active_agents(config: dict) -> list[str]:
    agents = config.get("agents", {})
    active = agents.get("active", ["orchestrator", "backend-engineer", "frontend-engineer"])
    compliance = agents.get("compliance", [])
    # Agregar compliance-reviewer si hay frameworks de compliance configurados
    frameworks = config.get("compliance", {}).get("frameworks", [])
    if frameworks and "compliance-reviewer" not in active:
        compliance = list(set(compliance + ["compliance-reviewer"]))
    return list(set(active + compliance))


def init_claude_code(root: Path, forge: Path, config: dict):
    """Genera .claude/agents/ y AGENTS.md para Claude Code."""
    agents_dir = root / ".claude" / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)

    active_agents = get_active_agents(config)
    copied = []

    for agent_name in active_agents:
        src = forge / "core" / "agents" / f"{agent_name}.md"
        if src.exists():
            dst = agents_dir / f"{agent_name}.md"
            shutil.copy2(src, dst)
            copied.append(agent_name)
            print(f"  [OK] .claude/agents/{agent_name}.md")
        else:
            print(f"  [SKIP] core/agents/{agent_name}.md no encontrado")

    # Generar AGENTS.md
    project_name = config.get("project", {}).get("name", "Mi Proyecto")
    team_name = config.get("team", {}).get("name", "Team")

    agents_md = f"""# AGENTS.md — {project_name}

> Configuración del agent team para {project_name}.
> Generado por forge-init.py — editar project.yaml para cambiar la configuración.

## Team: {team_name}

## Agentes activos

| Agente | Rol |
|--------|-----|
"""
    role_descriptions = {
        "orchestrator": "Lead del team — coordina, descompone tareas, sintetiza",
        "backend-engineer": "Backend — API, base de datos, lógica de negocio",
        "frontend-engineer": "Frontend — UI, componentes, integración con API",
        "test-engineer": "Testing — unitario, integración, E2E",
        "docs-writer": "Documentación — specs, ADRs, READMEs",
        "compliance-reviewer": "Compliance — revisa contra marcos regulatorios activos",
        "security-auditor": "Seguridad — auditoría de vulnerabilidades",
    }

    for agent in copied:
        desc = role_descriptions.get(agent, "Agente especializado")
        agents_md += f"| `{agent}` | {desc} |\n"

    frameworks = config.get("compliance", {}).get("frameworks", [])
    if frameworks:
        agents_md += f"""
## Compliance activo

Marcos configurados en project.yaml: {", ".join(frameworks)}

El `compliance-reviewer` se incluye automáticamente en PRs que toquen:
- Datos de usuarios o consentimientos
- Logs de auditoría
- Derechos del titular (DSAR)
"""

    agents_md += """
## Reglas operativas

1. Specs en `docs/specs/` primero — sin spec, sin código.
2. Orchestrator coordina; los otros agentes no se comunican entre ellos directamente.
3. Cada agente tiene un scope delimitado — no sale de su directorio.
4. Máximo 3 agentes simultáneos en suscripción Pro / hasta 7-8 con API directa.
5. Compliance reviewer obligatorio antes de mergear si toca datos de usuarios.
"""

    with open(root / "AGENTS.md", "w") as f:
        f.write(agents_md)
    print(f"  [OK] AGENTS.md")

    print(f"\nClaude Code: {len(copied)} agentes instalados en .claude/agents/")


def init_opencode(root: Path, forge: Path, config: dict):
    """Genera AGENTS.md compatible con OpenCode/Codex."""
    # OpenCode usa el mismo formato que AGENTS.md — reutilizar
    init_claude_code(root, forge, config)
    print("\nOpenCode/Codex: usa el mismo AGENTS.md generado.")


def init_kiro(root: Path, forge: Path, config: dict):
    """Genera .kiro/steering/ para Kiro."""
    steering_dir = root / ".kiro" / "steering"
    steering_dir.mkdir(parents=True, exist_ok=True)

    project_name = config.get("project", {}).get("name", "Mi Proyecto")
    stack = config.get("stack", {})

    # product.md — contexto del producto
    product_md = f"""# {project_name}

{config.get("project", {}).get("description", "")}

## Stack

- Backend: {stack.get("backend", "por definir")}
- Frontend: {stack.get("frontend", "por definir")}
- Base de datos: {stack.get("database", "por definir")}
- Testing: {", ".join(stack.get("testing", []))}
"""
    with open(steering_dir / "product.md", "w") as f:
        f.write(product_md)
    print(f"  [OK] .kiro/steering/product.md")

    # structure.md — estructura del proyecto
    structure_md = """# Estructura del proyecto

Ver CLAUDE.md para la estructura detallada del repositorio y los comandos de desarrollo.

## Workflow

1. Spec en docs/specs/ antes de implementar
2. Tests antes o junto con la implementación
3. Compliance review si toca datos de usuarios
"""
    with open(steering_dir / "structure.md", "w") as f:
        f.write(structure_md)
    print(f"  [OK] .kiro/steering/structure.md")

    print(f"\nKiro: steering files generados en .kiro/steering/")


def main():
    if len(sys.argv) < 2 or "--tool" not in sys.argv:
        print("Uso: forge-init.py --tool <claude-code|opencode|kiro|all>")
        sys.exit(1)

    idx = sys.argv.index("--tool")
    tool = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else "claude-code"

    try:
        root = find_project_root()
        forge = find_forge_dir()
        config = load_project(root)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Proyecto: {config.get('project', {}).get('name', '?')}")
    print(f"Root: {root}")
    print(f"Forge: {forge}")
    print(f"Tool: {tool}\n")

    if tool in ("claude-code", "all"):
        print("--- Claude Code ---")
        init_claude_code(root, forge, config)

    if tool in ("opencode", "all"):
        print("\n--- OpenCode ---")
        init_opencode(root, forge, config)

    if tool in ("kiro", "all"):
        print("\n--- Kiro ---")
        init_kiro(root, forge, config)

    print("\nDone. Revisar los archivos generados antes de commitear.")


if __name__ == "__main__":
    main()
