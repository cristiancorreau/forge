#!/usr/bin/env python3
"""
forge-init.py — Setup de un proyecto nuevo con el framework forge.

Usage:
  python3 .agentic/scripts/forge-init.py --tool claude-code
  python3 .agentic/scripts/forge-init.py --tool claude-code --force          # sobreescribir existentes
  python3 .agentic/scripts/forge-init.py --tool claude-code --force --only=backend-engineer  # solo ese agente
  python3 .agentic/scripts/forge-init.py --tool opencode
  python3 .agentic/scripts/forge-init.py --tool kiro
  python3 .agentic/scripts/forge-init.py --tool all

Lee project.yaml en la raíz del proyecto y genera la configuración
para el tool especificado.

Comportamiento por defecto (sin --force):
  - Agentes existentes en .claude/agents/ NO son sobreescritos
  - Solo instala los agentes de forge que aún no existen
  - AGENTS.md se genera siempre (documenta el roster completo)

--only=<nombre>  Instala/actualiza únicamente el agente indicado (requiere --force).

Requiere: pyyaml  →  pip3 install pyyaml
          o instalar via: pip3 install -r .agentic/requirements.txt
"""
from __future__ import annotations

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

FORCE   = "--force"   in sys.argv
VERBOSE = "--verbose" in sys.argv

# --only=<nombre> o --only <nombre>
ONLY_AGENT: str | None = None
for _arg in sys.argv:
    if _arg.startswith("--only="):
        ONLY_AGENT = _arg.split("=", 1)[1].strip()
        break
if ONLY_AGENT is None and "--only" in sys.argv:
    _idx = sys.argv.index("--only")
    if _idx + 1 < len(sys.argv):
        ONLY_AGENT = sys.argv[_idx + 1].strip()


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


def get_all_agent_names(config: dict) -> tuple[list[str], list[str], list[str], list[str]]:
    """Retorna (active, compliance, specialized, profiles) — listas de nombres/strings."""
    agents = config.get("agents", {})
    active = agents.get("active", ["orchestrator", "backend-engineer", "frontend-engineer"])
    compliance = agents.get("compliance", [])
    specialized = agents.get("specialized", [])
    profiles = agents.get("profiles", [])

    # Compliance-reviewer automático si hay frameworks configurados
    frameworks = config.get("compliance", {}).get("frameworks", [])
    if frameworks and "compliance-reviewer" not in active + compliance:
        compliance = list(set(compliance + ["compliance-reviewer"]))

    return active, compliance, specialized, profiles


def install_agent(src: Path, dst: Path, name: str, source_label: str) -> str:
    """Copia un agente de src a dst. Respeta --force y --only. Retorna el status."""
    if not src.exists():
        return "MISS"
    if ONLY_AGENT and name != ONLY_AGENT:
        return "SKIP"
    already_existed = dst.exists()
    if already_existed and not FORCE:
        return "KEEP"
    shutil.copy2(src, dst)
    return "UPDATE" if already_existed else "OK"


def init_wiki(root: Path, forge: Path, config: dict):
    """Inicializa estructura docs/wiki/ desde templates si hay skills de wiki activos."""
    skills_active = config.get("skills", {}).get("active", [])
    wiki_skills = {"wiki-ingest", "wiki-query", "wiki-lint"}
    if not wiki_skills.intersection(skills_active):
        return

    wiki_cfg = config.get("wiki", {})
    wiki_path = root / wiki_cfg.get("path", "docs/wiki")

    if wiki_path.exists():
        print(f"  [KEEP] {wiki_path.relative_to(root)}/ — ya existe")
        return

    tpl = forge / "templates" / "wiki"
    if not tpl.exists():
        print(f"  [MISS] templates/wiki/ no encontrado en forge")
        return

    shutil.copytree(tpl, wiki_path)
    # Renombrar _template.md → no copiarlos (son solo referencias)
    for f in wiki_path.rglob("_template.md"):
        f.unlink()
    # Crear carpeta raw/ vacía
    (wiki_path / "raw").mkdir(exist_ok=True)

    print(f"  [OK]   {wiki_path.relative_to(root)}/ — estructura inicial creada")
    print(f"         Usar /wiki-ingest para agregar conocimiento")


def install_claude_commands(root: Path, forge: Path, config: dict):
    """Instala slash commands de forge en .claude/commands/."""
    skills_active = config.get("skills", {}).get("active", [])
    commands_src = forge / "adapters" / "claude-code" / "commands"
    if not commands_src.exists():
        return

    commands_dir = root / ".claude" / "commands"
    commands_dir.mkdir(parents=True, exist_ok=True)

    # Mapeo skill → comando(s) que provee
    skill_commands = {
        "wiki-ingest": ["wiki-ingest.md"],
        "wiki-query":  ["wiki-query.md"],
        "wiki-lint":   ["wiki-lint.md"],
    }

    installed = []
    for skill, cmd_files in skill_commands.items():
        if skill not in skills_active:
            continue
        for cmd_file in cmd_files:
            src = commands_src / cmd_file
            dst = commands_dir / cmd_file
            if not src.exists():
                continue
            if dst.exists() and not FORCE:
                print(f"  [KEEP] .claude/commands/{cmd_file}")
                continue
            shutil.copy2(src, dst)
            installed.append(cmd_file)
            print(f"  [OK]   .claude/commands/{cmd_file}")

    if installed:
        print(f"  Slash commands instalados: {', '.join(f'/{f[:-3]}' for f in installed)}")


def init_claude_code(root: Path, forge: Path, config: dict):
    """Instala agentes de forge en .claude/agents/ (sin sobreescribir por defecto) y genera AGENTS.md."""
    agents_dir = root / ".claude" / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)

    active, compliance, specialized, profiles = get_all_agent_names(config)
    stats = {"installed": [], "kept": [], "missing": []}

    # 1. Tier 2 — profiles tienen prioridad sobre core
    profile_provided: set[str] = set()
    if profiles:
        print(f"\n  Tier 2 — profiles: {', '.join(profiles)}")
    for profile in profiles:
        profile_agents_dir = forge / "profiles" / profile / "agents"
        if not profile_agents_dir.exists():
            print(f"  [WARN] profiles/{profile}/ no encontrado en forge")
            continue
        for src in sorted(profile_agents_dir.glob("*.md")):
            name = src.stem
            dst = agents_dir / src.name
            status = install_agent(src, dst, name, f"profile:{profile}")
            profile_provided.add(name)
            _print_agent_status(status, name, f"profiles/{profile}/agents/")
            _record_status(stats, status, name)

    # 2. Tier 1 — core (solo agentes que no fueron cubiertos por profiles)
    all_from_core = list(set(active + compliance))
    core_only = [a for a in all_from_core if a not in profile_provided]

    # Detectar y reportar conflictos Tier 1 vs Tier 2
    tier1_discarded = [a for a in all_from_core if a in profile_provided]
    profile_by_agent: dict[str, str] = {}
    for profile in profiles:
        profile_agents_dir = forge / "profiles" / profile / "agents"
        if not profile_agents_dir.exists():
            continue
        for src in profile_agents_dir.glob("*.md"):
            profile_by_agent[src.stem] = profile
    for discarded in sorted(tier1_discarded):
        profile_name = profile_by_agent.get(discarded, "profile")
        print(f"  INFO: '{discarded}' del core descartado — profile '{profile_name}' provee su propia versión (Tier 2 tiene prioridad)")

    if core_only:
        print(f"\n  Tier 1 — core:")
    for agent_name in sorted(core_only):
        src = forge / "core" / "agents" / f"{agent_name}.md"
        dst = agents_dir / f"{agent_name}.md"
        status = install_agent(src, dst, agent_name, "core")
        _print_agent_status(status, agent_name, "core/agents/")
        _record_status(stats, status, agent_name)

    # 3. Tier 3 — especializados (solo verificar que existen en el proyecto)
    if specialized:
        print(f"\n  Tier 3 — especializados del proyecto:")
        for name in specialized:
            dst = agents_dir / f"{name}.md"
            status = "OK" if dst.exists() else "FALTA"
            icon = "OK" if dst.exists() else "FALTA — crear manualmente en .claude/agents/"
            print(f"    [{icon}] {name}.md")

    # AGENTS.md siempre se regenera
    _write_agents_md(root, config, active, compliance, specialized, profiles)

    if tier1_discarded and (VERBOSE or len(tier1_discarded) > 0):
        print(f"\n  Conflictos resueltos: {len(tier1_discarded)} agente(s) core descartado(s) por profiles activos.")

    i, k, m = len(stats["installed"]), len(stats["kept"]), len(stats["missing"])
    print(f"\n  Instalados: {i} | Preservados: {k} | Sin archivo en forge: {m}")
    if stats["missing"]:
        print(f"  Pendientes en forge: {', '.join(stats['missing'])}")


def _print_agent_status(status: str, name: str, source: str):
    msgs = {
        "OK":     f"  [OK]   .claude/agents/{name}.md  ← {source}",
        "UPDATE": f"  [UPD]  .claude/agents/{name}.md  ← {source} (sobreescrito)",
        "KEEP":   f"  [KEEP] .claude/agents/{name}.md  — ya existe (--force para sobreescribir)",
        "MISS":   f"  [MISS] {source}{name}.md — no existe en forge",
        "SKIP":   f"  [SKIP] .claude/agents/{name}.md  — omitido (--only={ONLY_AGENT})",
    }
    print(msgs.get(status, f"  [?] {name}"))


def _record_status(stats: dict, status: str, name: str):
    if status in ("OK", "UPDATE"):
        stats["installed"].append(name)
    elif status == "KEEP":
        stats["kept"].append(name)
    elif status == "MISS":
        stats["missing"].append(name)
    # SKIP no cuenta en ningún total — es comportamiento esperado con --only


def _write_agents_md(root: Path, config: dict, active: list, compliance: list, specialized: list, profiles: list = []):
    project_name = config.get("project", {}).get("name", "Mi Proyecto")
    team_name = config.get("team", {}).get("name", "Team")
    frameworks = config.get("compliance", {}).get("frameworks", [])

    role_descriptions = {
        "orchestrator":        "Lead del team — coordina, descompone tareas, sintetiza",
        "backend-engineer":    "Backend — API, base de datos, lógica de negocio",
        "frontend-engineer":   "Frontend — UI, componentes, integración con API",
        "fullstack-engineer":  "Full-stack — backend + frontend + migraciones (Rails y similares)",
        "api-engineer":        "API — Hono/Express/FastAPI/NestJS + ORM + lógica de negocio",
        "admin-engineer":      "Admin dashboard — UI de gestión interna",
        "banner-engineer":     "Banner SDK — script de consentimiento embebido",
        "scanner-engineer":    "Scanner de cookies y trackers",
        "mobile-engineer":     "Apps móviles — React Native / Expo",
        "test-engineer":       "Testing — unitario, integración, E2E",
        "docs-writer":         "Documentación — specs, ADRs, READMEs",
        "compliance-reviewer": "Compliance — revisa contra marcos regulatorios activos",
        "security-auditor":    "Seguridad — auditoría de vulnerabilidades",
        "dsar-specialist":     "DSAR — derechos del titular (acceso, rectificación, supresión…)",
        "policy-engineer":     "Policy Generator — plantillas de política de privacidad",
        "sites-engineer":      "Sites & Domains — gestión de sitios y snippets",
        "gcm-engineer":        "Google Consent Mode v2 — integración GCM",
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


def init_opencode(root: Path, forge: Path, config: dict):
    """Delega en el adapter de OpenCode para generar AGENTS.md."""
    import subprocess
    adapter = forge / "adapters" / "opencode" / "generate-agents-md.py"
    if not adapter.exists():
        print(f"  [MISS] {adapter} — adapter de OpenCode no encontrado", file=sys.stderr)
        return
    args = ["python3", str(adapter)]
    result = subprocess.run(args, cwd=str(root))
    if result.returncode != 0:
        print(f"  [ERR] generate-agents-md.py salió con código {result.returncode}", file=sys.stderr)


def init_kiro(root: Path, forge: Path, config: dict):
    """Delega en el adapter de Kiro para generar los steering files."""
    import subprocess
    adapter = forge / "adapters" / "kiro" / "generate-steering.py"
    if not adapter.exists():
        print(f"  [MISS] {adapter} — adapter de Kiro no encontrado", file=sys.stderr)
        return
    args = ["python3", str(adapter)]
    if FORCE:
        args.append("--force")
    result = subprocess.run(args, cwd=str(root))
    if result.returncode != 0:
        print(f"  [ERR] generate-steering.py salió con código {result.returncode}", file=sys.stderr)


def main():
    if "--tool" not in sys.argv:
        print("Uso: forge-init.py --tool <claude-code|opencode|kiro|all> [--force] [--only=<agente>]")
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
    print(f"Force    : {'sí — sobreescribe existentes' if FORCE else 'no — preserva existentes'}")
    if ONLY_AGENT:
        print(f"Only     : {ONLY_AGENT} (solo ese agente)")
    print()

    if tool in ("claude-code", "all"):
        print(f"--- Claude Code ---")
        init_claude_code(root, forge, config)
        print("\n  Slash commands:")
        install_claude_commands(root, forge, config)
        print("\n  Wiki:")
        init_wiki(root, forge, config)

    if tool in ("opencode", "all"):
        print(f"\n--- OpenCode ---")
        init_opencode(root, forge, config)

    if tool in ("kiro", "all"):
        print("\n--- Kiro ---")
        init_kiro(root, forge, config)

    print("\nDone. Revisar los archivos generados antes de commitear.")


if __name__ == "__main__":
    main()
