#!/usr/bin/env python3
# Copyright 2026 SocialWeb — Apache License 2.0
# https://github.com/socialwebcl/forge
"""
generate-agents-md.py — Genera AGENTS.md para OpenCode / Codex.

Usage:
  python3 .agentic/adapters/opencode/generate-agents-md.py

Lee project.yaml en la raíz y genera AGENTS.md con el roster completo del equipo.
OpenCode y Codex usan AGENTS.md como contexto de sistema para los agentes.

Requiere: pyyaml
"""
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


def _guardrail_section(config: dict) -> list[str]:
    """Genera la sección de guardrails embebidos (equivalente a hooks de Claude Code)."""
    proj = config.get("project", {})
    mode = proj.get("mode", "startup")

    lines = [
        "## Guardrails (comportamiento no-negociable)",
        "",
        "Estas reglas se aplican siempre, en cualquier tarea, sin excepción.",
        "",
        "### Branch guard",
        "",
        "NUNCA editar código cuando la rama actual sea `main`, `master` o `develop`.",
        "Antes de cualquier edición de archivo, verificar la rama con `git branch --show-current`.",
        "Si la rama es main/master/develop: detener y pedir al usuario que cree una rama de feature.",
        "Excepción: archivos de documentación (*.md) pueden editarse en main si el usuario lo indica explícitamente.",
        "",
        "### Detección de debug",
        "",
        "Antes de hacer commit, verificar que no haya en el código a commitear:",
        "- `console.log(` en JS/TS (excepto archivos de logging)",
        "- `print(` en Python que no sea logging de producción",
        "- `debugger;` en JS/TS",
        "- `binding.pry` en Ruby",
        "- `dd(` o `dump(` en PHP",
        "",
        "Si se detectan estos patrones: reportar la línea exacta y pedir confirmación antes de continuar.",
        "",
        "### Producción safety",
        "",
        "Nunca ejecutar sin confirmación explícita del usuario:",
        "- `DROP TABLE`, `DROP DATABASE`, `TRUNCATE` en bases de datos de producción",
        "- `rm -rf` en directorios que no sean temporales o de build",
        "- `git push --force` a main/master",
        "- Deploy a producción sin haber ejecutado `/review` primero",
        "",
        "### SQL injection",
        "",
        "Nunca concatenar input del usuario en strings SQL.",
        "Siempre usar parámetros preparados o el ORM del proyecto.",
        "",
        "### Secrets",
        "",
        "Nunca hardcodear tokens, passwords, API keys o certificados en archivos que van a git.",
        "Usar variables de entorno y documentarlas en `.env.example`.",
        "",
    ]

    if mode in ("standard", "enterprise"):
        lines += [
            "### Compliance (mode: " + mode + ")",
            "",
            "Verificar en cada PR que toque datos de usuarios:",
            "- PII nunca en logs de stdout sin enmascarar",
            "- Consentimiento explícito antes de cualquier tracker no esencial",
            "- Logs de auditoría append-only (sin UPDATE/DELETE sobre eventos ya registrados)",
            "",
        ]

    return lines


def _forge_v2_commands_section() -> list[str]:
    """Genera la sección de comandos Forge v2 SDD para OpenCode."""
    return [
        "## Comandos Forge v2 (flujo SDD)",
        "",
        "Este proyecto usa el flujo Spec-Driven Development de Forge v2.",
        "Los comandos disponibles en `.opencode/commands/` son:",
        "",
        "| Comando | Cuándo usarlo |",
        "|---------|--------------|",
        "| `/session-start` | Al comenzar una sesión de trabajo — detecta branch, PRs abiertos y estado del repo |",
        "| `/plan` | Para crear o revisar una spec en `docs/specs/` antes de implementar |",
        "| `/work` | Para implementar una spec en estado `ready` — ejecuta en serie en la sesión actual |",
        "| `/review` | Para hacer code review con veredicto APPROVED/CHANGES_REQUESTED/BLOCKED |",
        "| `/ship` | Para hacer deploy a producción — requiere review aprobado y git limpio |",
        "| `/session-close` | Al terminar una sesión — commit, daily note, RELEASE-NOTES y PR |",
        "",
        "**Flujo estándar:** `/session-start` → `/plan` → `/work` → `/review` → `/ship` → `/session-close`",
        "",
        "**Regla fundamental:** Sin spec en `docs/specs/` con estado `ready`, no se ejecuta `/work`.",
        "",
    ]


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
        f"> Fuente de verdad: `project.yaml`. Re-ejecutar `generate-agents-md.py` al cambiar agentes.",
        "",
    ]

    # Sección de comandos Forge v2 al inicio
    lines += _forge_v2_commands_section()

    lines += [
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
    ]

    # Guardrails embebidos (equivalente a hooks de Claude Code)
    lines += _guardrail_section(config)

    lines += [
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

    print(f"AGENTS.md generado en {output_path}")


if __name__ == "__main__":
    main()
