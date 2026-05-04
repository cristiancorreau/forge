#!/usr/bin/env python3
"""
generate-codex-config.py — Genera AGENTS.md para Codex CLI (OpenAI).

Usage:
  python3 .agentic/adapters/codex/generate-codex-config.py

Lee project.yaml en la raíz y genera AGENTS.md enriquecido para Codex CLI.

Diferencias respecto al adapter OpenCode:
  - Incluye sección "Workflow SDD" con pasos explícitos (Codex opera autónomamente)
  - Incluye "Security rules" y "Autonomy limits" inline (crítico para ejecución sin supervisión)
  - Header identifica el archivo como generado para Codex CLI

Codex CLI lee AGENTS.md desde la raíz del repositorio como contexto del agente.
Referencia: https://github.com/openai/codex

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
    """
    Genera AGENTS.md enriquecido para Codex CLI.

    Codex CLI opera autónomamente en terminal: las reglas de seguridad y los
    límites de autonomía deben estar inline en AGENTS.md, no en un archivo
    separado, para que el agente las reciba como contexto en cada sesión.
    """
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

    if frameworks and "compliance-reviewer" not in active + compliance:
        compliance = list(set(compliance + ["compliance-reviewer"]))

    lines = [
        f"# AGENTS.md — {name}",
        "",
        f"> Generado por forge (adapter Codex CLI).",
        f"> Fuente de verdad: `project.yaml`. Re-ejecutar `generate-codex-config.py` al cambiar agentes.",
        "",
    ]

    if description:
        lines += [description, ""]

    lines += [
        "## Stack",
        "",
        f"- **Lenguaje:** {language}",
        f"- **Backend:** {stack.get('backend') or 'N/A'}",
        f"- **Frontend:** {stack.get('frontend') or 'N/A'}",
        f"- **Base de datos:** {stack.get('database') or 'N/A'}",
        f"- **Testing:** {', '.join(stack.get('testing', []))}",
        "",
        "## Workflow: Spec-Driven Development",
        "",
        "Antes de implementar cualquier feature:",
        "",
        f"1. Verificar que existe una spec en `{specs_path}/`.",
        "2. Si no existe, crearla y esperar aprobación antes de codificar.",
        "3. Implementar con tests junto al código, no al final.",
        "4. Actualizar la spec con decisiones tomadas durante la implementación.",
        "",
        "## Reglas de seguridad (no negociables)",
        "",
        "- Sin hardcodear tokens, passwords ni secrets — usar variables de entorno.",
        "- Parámetros preparados en todas las queries SQL — nunca concatenar input del usuario.",
        "- PII nunca en logs de stdout.",
        "- Verificar autenticación Y autorización en cada endpoint de API.",
        "- Sin force push a main/master.",
        "",
        "## Límites de autonomía",
        "",
        "- Modificar solo archivos dentro del scope declarado del agente.",
        "- Preguntar antes de eliminar archivos o ejecutar comandos destructivos.",
        "- Nunca hacer commit directo a main/master.",
        "- Correr los tests antes de marcar una tarea como completa.",
        "- Si una tarea requiere acceso a credenciales no disponibles, detenerse y reportar.",
        "",
        "## Roster de agentes",
        "",
    ]

    if active:
        lines += ["### Activos", ""]
        for agent in active:
            desc = read_agent_description(forge, agent, profiles)
            lines.append(f"#### `{agent}`")
            lines.append(desc)
            lines.append("")

    if compliance:
        lines += ["### Compliance y revisión", ""]
        for agent in compliance:
            desc = read_agent_description(forge, agent, profiles)
            lines.append(f"#### `{agent}`")
            lines.append(desc)
            lines.append("")

    if specialized:
        lines += ["### Especializados del proyecto", ""]
        for agent in specialized:
            desc = read_agent_description(forge, agent, profiles)
            lines.append(f"#### `{agent}`")
            lines.append(desc)
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


def main():
    try:
        root = find_project_root()
        forge = find_forge_dir()
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    with open(root / "project.yaml") as f:
        config = yaml.safe_load(f)

    content = generate_agents_md(config, forge)
    output_path = root / "AGENTS.md"
    with open(output_path, "w") as f:
        f.write(content)
    print(f"  [OK]   AGENTS.md generado en {output_path}")
    print("         (adapter Codex: incluye SDD workflow + security rules + autonomy limits)")


if __name__ == "__main__":
    main()
