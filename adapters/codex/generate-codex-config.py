#!/usr/bin/env python3
"""
generate-codex-config.py — Genera AGENTS.md y codex.md para Codex CLI (OpenAI).

Usage:
  python3 .agentic/adapters/codex/generate-codex-config.py

Lee project.yaml en la raíz y genera:
  AGENTS.md   — roster completo de agentes (mismo formato que OpenCode)
  codex.md    — instrucciones de contexto específicas para Codex CLI

Codex CLI usa AGENTS.md como contexto de sistema y codex.md como instrucciones
de autonomía y límites operativos para ejecución de agentes en terminal.

Requiere: pyyaml
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml requerido. pip install pyyaml", file=sys.stderr)
    sys.exit(1)


def find_project_root() -> Path:
    here = Path.cwd()
    for p in [here] + list(here.parents):
        if (p / "project.yaml").exists():
            return p
    raise FileNotFoundError("No se encontró project.yaml")


def find_forge_dir() -> Path:
    root = find_project_root()
    for candidate in [root / ".agentic", root / "forge", Path(__file__).parent.parent.parent]:
        if (candidate / "core").exists():
            return candidate
    raise FileNotFoundError("No se encontró el directorio forge con core/")


def read_agent_description(forge: Path, name: str, profiles: list[str]) -> str:
    """Lee el frontmatter description del agente desde forge (profiles > core)."""
    for profile in profiles:
        p = forge / "profiles" / profile / "agents" / f"{name}.md"
        if p.exists():
            content = p.read_text()
            for line in content.splitlines():
                if line.startswith("description:"):
                    return line.split(":", 1)[1].strip().strip('"')
    p = forge / "core" / "agents" / f"{name}.md"
    if p.exists():
        content = p.read_text()
        for line in content.splitlines():
            if line.startswith("description:"):
                return line.split(":", 1)[1].strip().strip('"')
    return "Agente de implementación"


def generate_agents_md(config: dict, forge: Path) -> str:
    proj = config.get("project", {})
    agents_cfg = config.get("agents", {})
    compliance_cfg = config.get("compliance", {})
    stack = config.get("stack", {})
    paths = config.get("paths", {})

    name = proj.get("name", "Mi Proyecto")
    active = agents_cfg.get("active", [])
    compliance = agents_cfg.get("compliance", [])
    specialized = agents_cfg.get("specialized", [])
    profiles = agents_cfg.get("profiles", [])
    frameworks = compliance_cfg.get("frameworks", [])
    specs_path = paths.get("specs", "docs/specs")

    # Compliance-reviewer automático si hay frameworks
    if frameworks and "compliance-reviewer" not in active + compliance:
        compliance = list(set(compliance + ["compliance-reviewer"]))

    lines = [
        f"# AGENTS.md — {name}",
        "",
        f"> Generado por forge (adapter OpenCode/Codex).",
        f"> Fuente de verdad: `project.yaml`. Re-ejecutar `generate-codex-config.py` al cambiar agentes.",
        "",
        "## Stack del proyecto",
        "",
        f"- **Backend:** {stack.get('backend') or 'N/A'}",
        f"- **Frontend:** {stack.get('frontend') or 'N/A'}",
        f"- **Base de datos:** {stack.get('database') or 'N/A'}",
        f"- **Testing:** {', '.join(stack.get('testing', []))}",
        "",
        "## Reglas globales (todos los agentes)",
        "",
        "- Specs en `" + specs_path + "/` primero — sin spec, sin código.",
        "- Cada agente respeta su scope — no modifica archivos fuera de su dominio.",
        "- Sin hardcodear tokens, passwords ni secrets.",
        "- Parámetros preparados en todas las queries SQL.",
        "- PII nunca en logs de stdout.",
        "",
        "## Roster de agentes",
        "",
    ]

    if active:
        lines += ["### Agentes activos", ""]
        for agent in active:
            desc = read_agent_description(forge, agent, profiles)
            lines.append(f"#### `{agent}`")
            lines.append(f"{desc}")
            lines.append("")

    if compliance:
        lines += ["### Agentes de compliance y revisión", ""]
        for agent in compliance:
            desc = read_agent_description(forge, agent, profiles)
            lines.append(f"#### `{agent}`")
            lines.append(f"{desc}")
            lines.append("")

    if specialized:
        lines += ["### Agentes especializados del proyecto", ""]
        for agent in specialized:
            desc = read_agent_description(forge, agent, profiles)
            lines.append(f"#### `{agent}`")
            lines.append(f"{desc}")
            lines.append("")

    if frameworks:
        lines += [
            "## Compliance activo",
            "",
            f"Marcos regulatorios: {', '.join(f.upper() for f in frameworks)}",
            "",
            "Incluir `compliance-reviewer` en toda tarea que toque:",
            "- Datos de usuarios o consentimientos",
            "- Logs de auditoría",
            "- Endpoints de derechos del titular (DSAR)",
            "",
        ]

    return "\n".join(lines)


def generate_codex_md(config: dict, forge: Path) -> str:
    proj = config.get("project", {})
    agents_cfg = config.get("agents", {})
    compliance_cfg = config.get("compliance", {})
    stack = config.get("stack", {})
    paths = config.get("paths", {})

    name = proj.get("name", "Mi Proyecto")
    description = proj.get("description", "")
    language = proj.get("language", "typescript")
    active = agents_cfg.get("active", [])
    compliance = agents_cfg.get("compliance", [])
    specialized = agents_cfg.get("specialized", [])
    profiles = agents_cfg.get("profiles", [])
    frameworks = compliance_cfg.get("frameworks", [])
    specs_path = paths.get("specs", "docs/specs")

    # Compliance-reviewer automático si hay frameworks
    if frameworks and "compliance-reviewer" not in active + compliance:
        compliance = list(set(compliance + ["compliance-reviewer"]))

    lines = [
        f"# {name} — Codex Configuration",
        "",
        f"> Generado por forge (adapter Codex CLI).",
        f"> Fuente de verdad: `project.yaml`. Re-ejecutar `generate-codex-config.py` al cambiar agentes.",
        "",
        "## Project context",
        "",
        f"- **Name:** {name}",
        f"- **Description:** {description}",
        f"- **Language:** {language}",
        f"- **Backend:** {stack.get('backend') or 'N/A'}",
        f"- **Frontend:** {stack.get('frontend') or 'N/A'}",
        f"- **Database:** {stack.get('database') or 'N/A'}",
        "",
        "## Workflow",
        "",
        "Seguir siempre Spec-Driven Development (SDD):",
        "",
        f"1. Antes de implementar cualquier feature, verificar que existe una spec en `{specs_path}/`.",
        "2. Si no existe la spec, crearla y esperar aprobación antes de codificar.",
        "3. Implementar con tests junto al código.",
        "4. Actualizar la spec con las decisiones tomadas.",
        "",
        "## Active agents",
        "",
    ]

    if active:
        lines += ["### Active", ""]
        for agent in active:
            desc = read_agent_description(forge, agent, profiles)
            lines.append(f"- **`{agent}`** — {desc}")
        lines.append("")

    if compliance:
        lines += ["### Compliance & review", ""]
        for agent in compliance:
            desc = read_agent_description(forge, agent, profiles)
            lines.append(f"- **`{agent}`** — {desc}")
        lines.append("")

    if specialized:
        lines += ["### Specialized", ""]
        for agent in specialized:
            desc = read_agent_description(forge, agent, profiles)
            lines.append(f"- **`{agent}`** — {desc}")
        lines.append("")

    lines += [
        "## Security rules (non-negotiable)",
        "",
        "- Never hardcode tokens, passwords, or secrets — use environment variables.",
        "- Use prepared statements for all SQL queries — never concatenate user input.",
        "- Never log PII to stdout.",
        "- Verify both authentication and authorization on every API endpoint.",
        "- No force push to main/master.",
        "",
        "## Autonomy limits",
        "",
        "- Modify only files within the agent's declared scope.",
        "- Ask before deleting files or running destructive commands.",
        "- Never commit directly to main/master.",
        "- Run tests before marking a task as complete.",
        "",
    ]

    if frameworks:
        lines += [
            "## Compliance",
            "",
            f"Active frameworks: {', '.join(f.upper() for f in frameworks)}",
            "",
            "Always include `compliance-reviewer` in tasks that touch:",
            "- User data or consent records",
            "- Audit logs",
            "- Data subject rights endpoints (DSAR)",
            "",
        ]

    return "\n".join(lines)


def main():
    try:
        root = find_project_root()
        forge = find_forge_dir()
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    with open(root / "project.yaml") as f:
        config = yaml.safe_load(f)

    # Generar AGENTS.md
    agents_content = generate_agents_md(config, forge)
    agents_path = root / "AGENTS.md"
    with open(agents_path, "w") as f:
        f.write(agents_content)
    print(f"  [OK]   AGENTS.md generado en {agents_path}")

    # Generar codex.md
    codex_content = generate_codex_md(config, forge)
    codex_path = root / "codex.md"
    with open(codex_path, "w") as f:
        f.write(codex_content)
    print(f"  [OK]   codex.md generado en {codex_path}")


if __name__ == "__main__":
    main()
