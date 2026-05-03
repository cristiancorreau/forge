#!/usr/bin/env python3
"""
forge-init.py — Setup de un proyecto nuevo con el framework forge.

Usage:
  python3 .agentic/scripts/forge-init.py --tool claude-code
  python3 .agentic/scripts/forge-init.py --tool claude-code --force   # sobreescribir existentes
  python3 .agentic/scripts/forge-init.py --tool opencode
  python3 .agentic/scripts/forge-init.py --tool kiro
  python3 .agentic/scripts/forge-init.py --tool all

Lee project.yaml en la raíz del proyecto y genera la configuración
para el tool especificado.

Comportamiento por defecto (sin --force):
  - Agentes existentes en .claude/agents/ NO son sobreescritos
  - Solo instala los agentes de forge que aún no existen
  - AGENTS.md se genera siempre (documenta el roster completo)

Requiere: pyyaml  →  pip3 install pyyaml
          o instalar via: pip3 install -r .agentic/requirements.txt
"""
import os
import sys
import shutil
from pathlib import Path

try:
    import yaml
except ImportError:
    print(
        "ERROR: pyyaml requerido.\n"
        "  pip3 install pyyaml\n"
        "  o: pip3 install -r .agentic/requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

FORCE = "--force" in sys.argv


def find_project_root() -> Path:
    here = Path.cwd()
    for p in [here] + list(here.parents):
        if (p / "project.yaml").exists():
            return p
    raise FileNotFoundError("No se encontró project.yaml. Crearlo desde .agentic/templates/project.yaml.tpl")


def find_forge_dir() -> Path:
    root = find_project_root()
    for candidate in [root / ".agentic", root / "forge", Path(__file__).parent.parent]:
        if (candidate / "core").exists():
            return candidate
    raise FileNotFoundError("No se encontró el directorio forge con core/")


def load_project(root: Path) -> dict:
    with open(root / "project.yaml") as f:
        return yaml.safe_load(f)


def get_all_agent_names(config: dict) -> tuple[list[str], list[str], list[str]]:
    """Retorna (active, compliance, specialized) — listas de nombres de agentes."""
    agents = config.get("agents", {})
    active = agents.get("active", ["orchestrator", "backend-engineer", "frontend-engineer"])
    compliance = agents.get("compliance", [])
    specialized = agents.get("specialized", [])

    # Compliance-reviewer automático si hay frameworks configurados
    frameworks = config.get("compliance", {}).get("frameworks", [])
    if frameworks and "compliance-reviewer" not in active + compliance:
        compliance = list(set(compliance + ["compliance-reviewer"]))

    return active, compliance, specialized


def init_claude_code(root: Path, forge: Path, config: dict):
    """Instala agentes de forge en .claude/agents/ (sin sobreescribir por defecto) y genera AGENTS.md."""
    agents_dir = root / ".claude" / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)

    active, compliance, specialized = get_all_agent_names(config)
    all_from_forge = list(set(active + compliance))  # los que forge puede proveer

    installed, skipped_exists, skipped_missing = [], [], []

    for agent_name in all_from_forge:
        src = forge / "core" / "agents" / f"{agent_name}.md"
        dst = agents_dir / f"{agent_name}.md"

        if not src.exists():
            skipped_missing.append(agent_name)
            print(f"  [MISS] core/agents/{agent_name}.md — no existe en forge (crear manualmente)")
            continue

        if dst.exists() and not FORCE:
            skipped_exists.append(agent_name)
            print(f"  [KEEP] .claude/agents/{agent_name}.md — ya existe (usar --force para sobreescribir)")
            continue

        shutil.copy2(src, dst)
        installed.append(agent_name)
        action = "UPDATED" if dst.exists() else "OK"
        print(f"  [{action}] .claude/agents/{agent_name}.md")

    if specialized:
        print(f"\n  Agentes especializados del proyecto (deben existir en .claude/agents/):")
        for name in specialized:
            dst = agents_dir / f"{name}.md"
            status = "OK" if dst.exists() else "FALTA — crear manualmente"
            print(f"    [{status}] .claude/agents/{name}.md")

    # AGENTS.md siempre se regenera (documenta el roster completo)
    _write_agents_md(root, config, active, compliance, specialized)

    print(f"\n  Instalados: {len(installed)} | Ya existían: {len(skipped_exists)} | Faltaban en forge: {len(skipped_missing)}")
    if skipped_missing:
        print(f"  Crear en forge/core/agents/: {', '.join(skipped_missing)}")


def _write_agents_md(root: Path, config: dict, active: list, compliance: list, specialized: list):
    project_name = config.get("project", {}).get("name", "Mi Proyecto")
    team_name = config.get("team", {}).get("name", "Team")
    frameworks = config.get("compliance", {}).get("frameworks", [])

    role_descriptions = {
        "orchestrator":       "Lead del team — coordina, descompone tareas, sintetiza",
        "backend-engineer":   "Backend — API, base de datos, lógica de negocio",
        "frontend-engineer":  "Frontend — UI, componentes, integración con API",
        "api-engineer":       "API — Hono/Express/FastAPI + ORM + lógica de negocio",
        "admin-engineer":     "Admin dashboard — UI de gestión interna",
        "banner-engineer":    "Banner SDK — script de consentimiento embebido",
        "scanner-engineer":   "Scanner de cookies y trackers",
        "mobile-engineer":    "Apps móviles — React Native / Expo",
        "test-engineer":      "Testing — unitario, integración, E2E",
        "docs-writer":        "Documentación — specs, ADRs, READMEs",
        "compliance-reviewer":"Compliance — revisa contra marcos regulatorios activos",
        "security-auditor":   "Seguridad — auditoría de vulnerabilidades",
        "dsar-specialist":    "DSAR — derechos del titular (acceso, rectificación, supresión…)",
        "policy-engineer":    "Policy Generator — plantillas de política de privacidad",
        "sites-engineer":     "Sites & Domains — gestión de sitios y snippets",
        "gcm-engineer":       "Google Consent Mode v2 — integración GCM",
    }

    lines = [
        f"# AGENTS.md — {project_name}",
        f"",
        f"> Agent team de {project_name} — generado por forge-init.py.",
        f"> Editar `project.yaml` para agregar/quitar agentes, luego re-ejecutar forge-init.",
        f"",
        f"## Team: {team_name}",
        f"",
        f"## Agentes activos",
        f"",
        f"| Agente | Rol | Fuente |",
        f"|--------|-----|--------|",
    ]

    for name in active:
        desc = role_descriptions.get(name, "Agente de implementación")
        lines.append(f"| `{name}` | {desc} | forge core |")

    if compliance:
        lines.append(f"")
        lines.append(f"**Revisores:**")
        lines.append(f"")
        lines.append(f"| Agente | Rol | Fuente |")
        lines.append(f"|--------|-----|--------|")
        for name in compliance:
            desc = role_descriptions.get(name, "Agente revisor")
            lines.append(f"| `{name}` | {desc} | forge core |")

    if specialized:
        lines.append(f"")
        lines.append(f"**Especializados del proyecto** (no están en forge core):")
        lines.append(f"")
        lines.append(f"| Agente | Rol | Fuente |")
        lines.append(f"|--------|-----|--------|")
        for name in specialized:
            desc = role_descriptions.get(name, "Agente especializado del proyecto")
            lines.append(f"| `{name}` | {desc} | proyecto |")

    if frameworks:
        lines += [
            f"",
            f"## Compliance activo",
            f"",
            f"Marcos: {', '.join(f.upper() for f in frameworks)}",
            f"",
            f"Incluir `compliance-reviewer` en PRs que toquen:",
            f"- Datos de usuarios o consentimientos",
            f"- Logs de auditoría (append-only)",
            f"- Derechos del titular (DSAR)",
        ]

    lines += [
        f"",
        f"## Reglas operativas",
        f"",
        f"1. Specs en `docs/specs/` primero — sin spec, sin código.",
        f"2. El orchestrator coordina; los agentes no se comunican directamente entre sí.",
        f"3. Cada agente respeta su scope — no sale del directorio que le corresponde.",
        f"4. Máximo 3 agentes simultáneos en suscripción Pro / hasta 7-8 con Max 20x o API.",
        f"5. Compliance reviewer obligatorio antes de mergear si toca datos de usuarios.",
    ]

    with open(root / "AGENTS.md", "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"  [OK] AGENTS.md (roster completo: {len(active + compliance + specialized)} agentes)")


def init_kiro(root: Path, forge: Path, config: dict):
    steering_dir = root / ".kiro" / "steering"
    steering_dir.mkdir(parents=True, exist_ok=True)

    proj = config.get("project", {})
    stack = config.get("stack", {})

    product_md = (
        f"# {proj.get('name', 'Proyecto')}\n\n"
        f"{proj.get('description', '')}\n\n"
        f"## Stack\n\n"
        f"- Backend: {stack.get('backend', 'por definir')}\n"
        f"- Frontend: {stack.get('frontend', 'por definir')}\n"
        f"- Base de datos: {stack.get('database', 'por definir')}\n"
        f"- Testing: {', '.join(stack.get('testing', []))}\n"
    )
    with open(steering_dir / "product.md", "w") as f:
        f.write(product_md)
    print(f"  [OK] .kiro/steering/product.md")

    structure_md = (
        "# Estructura del proyecto\n\n"
        "Ver CLAUDE.md para estructura detallada y comandos de desarrollo.\n\n"
        "## Workflow\n\n"
        "1. Spec en docs/specs/ antes de implementar\n"
        "2. Tests junto con la implementación\n"
        "3. Compliance review si toca datos de usuarios\n"
    )
    with open(steering_dir / "structure.md", "w") as f:
        f.write(structure_md)
    print(f"  [OK] .kiro/steering/structure.md")
    print(f"\nKiro: steering files generados en .kiro/steering/")


def main():
    if "--tool" not in sys.argv:
        print("Uso: forge-init.py --tool <claude-code|opencode|kiro|all> [--force]")
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

    print(f"Proyecto : {config.get('project', {}).get('name', '?')}")
    print(f"Root     : {root}")
    print(f"Forge    : {forge}")
    print(f"Tool     : {tool}")
    print(f"Force    : {'sí — sobreescribe existentes' if FORCE else 'no — preserva existentes'}\n")

    if tool in ("claude-code", "opencode", "all"):
        label = "Claude Code / OpenCode" if tool == "all" else tool.title().replace("-", " ")
        print(f"--- {label} ---")
        init_claude_code(root, forge, config)

    if tool in ("kiro", "all"):
        print("\n--- Kiro ---")
        init_kiro(root, forge, config)

    print("\nDone. Revisar los archivos generados antes de commitear.")


if __name__ == "__main__":
    main()
