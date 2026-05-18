#!/usr/bin/env python3
"""
forge-init.py — Setup de un proyecto nuevo con el framework forge.

Usage:
  python3 .agentic/scripts/forge-init.py --tool claude-code
  python3 .agentic/scripts/forge-init.py --tool claude-code --force          # sobreescribir existentes
  python3 .agentic/scripts/forge-init.py --tool claude-code --force --only=backend-engineer  # solo ese agente
  python3 .agentic/scripts/forge-init.py --tool opencode
  python3 .agentic/scripts/forge-init.py --tool kiro
  python3 .agentic/scripts/forge-init.py --tool codex
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

# Mapeo agente → clave en paths/agent_paths del project.yaml
_AGENT_SCOPE_KEY = {
    "api-engineer":         "api",
    "backend-engineer":     "api",
    "frontend-engineer":    "frontend",
    "admin-engineer":       "admin",
    "mobile-engineer":      "mobile",
    "scanner-engineer":     "scanner",
    "test-engineer":        "tests",
    "docs-writer":          "specs",
    "migration-specialist": "migrations",
    "wp-engineer":          "frontend",
    "divi-engineer":        "frontend",
    "elementor-engineer":   "frontend",
}


def _get_agent_scope(name: str, config: dict) -> str | None:
    """Retorna el path de scope para el agente según project.yaml, o None si no aplica."""
    key = _AGENT_SCOPE_KEY.get(name)
    if not key:
        return None
    agent_paths = config.get("agent_paths", {})
    paths = config.get("paths", {})
    return (agent_paths or {}).get(key) or (paths or {}).get(key) or None


def _inject_scope(content: str, scope_path: str) -> str:
    """Inyecta scope: en el frontmatter YAML del agente si no está presente."""
    lines = content.split("\n")
    if not lines or lines[0].strip() != "---":
        return content
    end = next((i for i, ln in enumerate(lines[1:], 1) if ln.strip() == "---"), -1)
    if end == -1:
        return content
    if any(ln.startswith("scope:") for ln in lines[1:end]):
        return content
    lines.insert(end, f'scope: "{scope_path}"')
    return "\n".join(lines)


def find_project_root() -> Path:
    here = Path.cwd()
    for p in [here] + list(here.parents):
        if (p / "project.yaml").exists():
            return p
    raise FileNotFoundError(
        "No se encontró project.yaml.\n"
        "  → Primer uso: python3 .agentic/scripts/forge-wizard.py  (wizard interactivo)\n"
        "  → O copiar la plantilla: cp .agentic/templates/project.yaml.tpl project.yaml"
    )


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


def install_agent(src: Path, dst: Path, name: str, source_label: str, scope_path: str | None = None) -> str:
    """Copia un agente de src a dst, inyectando scope si corresponde. Respeta --force y --only."""
    if not src.exists():
        return "MISS"
    if ONLY_AGENT and name != ONLY_AGENT:
        return "SKIP"
    already_existed = dst.exists()
    if already_existed and not FORCE:
        return "KEEP"
    content = src.read_text(encoding="utf-8")
    if scope_path:
        content = _inject_scope(content, scope_path)
    dst.write_text(content, encoding="utf-8")
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

    # Comandos de ciclo de sesión — siempre instalados (v2)
    session_commands = ["session-start.md", "session-close.md"]

    # Mapeo skill → comando(s) que provee
    skill_commands = {
        "new-feature":    ["new-feature.md"],
        "local2prod":     ["deploy-check.md"],
        "security-audit": ["review.md"],
        "wiki-ingest":    ["wiki-ingest.md"],
        "wiki-query":     ["wiki-query.md"],
        "wiki-lint":      ["wiki-lint.md"],
    }

    installed = []
    # 1. Session commands — siempre
    for cmd_file in session_commands:
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

    # 2. Skill-based commands
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


def _generate_claude_md(root: Path, forge: Path, config: dict):
    """Genera CLAUDE.md en la raíz usando el adapter de claude-code."""
    import importlib.util
    generator_path = forge / "adapters" / "claude-code" / "generate-claude-md.py"
    if not generator_path.exists():
        print(f"  [MISS] adapters/claude-code/generate-claude-md.py no encontrado en forge")
        return
    spec = importlib.util.spec_from_file_location("_gen_claude_md", generator_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    output_path = root / "CLAUDE.md"
    already_existed = output_path.exists()
    if already_existed and not FORCE:
        print(f"  [KEEP] CLAUDE.md — ya existe (--force para regenerar)")
        return
    content = mod.generate_claude_md(config)
    output_path.write_text(content, encoding="utf-8")
    action = "UPD" if already_existed else "OK"
    print(f"  [{action}]   CLAUDE.md — generado desde project.yaml")


def install_hooks(root: Path, forge: Path, config: dict):
    """Copia hooks de forge/core/hooks/ a .claude/hooks/ del proyecto."""
    hooks_src = forge / "core" / "hooks"
    if not hooks_src.exists():
        return

    registry_path = hooks_src / "hooks-registry.yaml"
    if registry_path.exists():
        _install_hooks_from_registry(root, hooks_src, config, registry_path)
    else:
        _install_hooks_legacy(root, hooks_src, config)


def _resolve_hooks_from_registry(config: dict, registry: dict) -> list[dict]:
    """
    Determina qué hooks instalar según el registry y el project.yaml.
    Retorna lista de dicts con keys: hook, event, matcher (opcional), description.
    """
    mode = config.get("project", {}).get("mode", "startup")
    stack = config.get("stack", {})
    database = (stack.get("database") or "").lower()
    orm = (stack.get("orm") or "").lower()

    selected: list[dict] = []

    # Universal — siempre
    for entry in registry.get("universal", []):
        selected.append(entry)

    # Standard — mode standard + enterprise
    if mode in ("standard", "enterprise"):
        for entry in registry.get("standard", []):
            selected.append(entry)

    # Enterprise — solo mode enterprise
    if mode == "enterprise":
        for entry in registry.get("enterprise", []):
            selected.append(entry)

    # Stack-based
    stack_registry = registry.get("stack", {})
    for stack_name, entries in stack_registry.items():
        stack_name_lower = stack_name.lower()
        if stack_name_lower in database or stack_name_lower in orm:
            for entry in entries:
                selected.append(entry)

    return selected


def _install_hooks_from_registry(root: Path, hooks_src: Path, config: dict, registry_path: Path):
    """Lee hooks-registry.yaml e instala los hooks que corresponden."""
    with open(registry_path) as f:
        registry = yaml.safe_load(f)

    if not isinstance(registry, dict):
        print("  [WARN] hooks-registry.yaml inválido — usando fallback legacy")
        _install_hooks_legacy(root, hooks_src, config)
        return

    hooks_dir = root / ".claude" / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)

    selected = _resolve_hooks_from_registry(config, registry)
    installed = []
    for entry in selected:
        hook_file = entry.get("hook", "")
        if not hook_file:
            continue
        src = hooks_src / hook_file
        dst = hooks_dir / hook_file
        if not src.exists():
            continue
        if dst.exists() and not FORCE:
            print(f"  [KEEP] .claude/hooks/{hook_file}")
            continue
        shutil.copy2(src, dst)
        if hook_file.endswith(".sh"):
            dst.chmod(dst.stat().st_mode | 0o111)
        installed.append(hook_file)
        print(f"  [OK]   .claude/hooks/{hook_file}")

    if installed:
        print(f"  Hooks instalados: {', '.join(installed)}")


def _install_hooks_legacy(root: Path, hooks_src: Path, config: dict):
    """Fallback: instala hooks con lógica hardcodeada (sin registry)."""
    hooks_dir = root / ".claude" / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)

    mode = config.get("project", {}).get("mode", "startup")
    stack = config.get("stack", {})
    database = (stack.get("database") or "").lower()

    universal_hooks = ["pre-edit-check.py", "post-turn-check.sh"]
    production_hooks: list[str] = []
    if mode in ("standard", "enterprise"):
        production_hooks.append("pre-bash-check.py")
    stack_hooks: list[str] = []
    if "supabase" in database:
        stack_hooks.append("check-destructive-sql.py")

    all_hooks = universal_hooks + production_hooks + stack_hooks
    installed = []
    for hook_file in all_hooks:
        src = hooks_src / hook_file
        dst = hooks_dir / hook_file
        if not src.exists():
            continue
        if dst.exists() and not FORCE:
            print(f"  [KEEP] .claude/hooks/{hook_file}")
            continue
        shutil.copy2(src, dst)
        if hook_file.endswith(".sh"):
            dst.chmod(dst.stat().st_mode | 0o111)
        installed.append(hook_file)
        print(f"  [OK]   .claude/hooks/{hook_file}")

    if installed:
        print(f"  Hooks instalados: {', '.join(installed)}")


def _build_hooks_config(config: dict) -> dict:
    """
    Construye el dict de hooks para settings.json.
    Si hooks-registry.yaml existe, lo usa para determinar qué hooks incluir.
    Si no, usa la configuración hardcodeada de fallback.
    """
    # Intentar leer el registry desde el directorio forge
    registry: dict | None = None
    try:
        from pathlib import Path as _Path
        # Buscar forge dir
        cwd = _Path.cwd()
        for candidate in [cwd / ".agentic", cwd / "forge"]:
            reg_path = candidate / "core" / "hooks" / "hooks-registry.yaml"
            if reg_path.exists():
                with open(reg_path) as f:
                    registry = yaml.safe_load(f)
                break
        # También probar relativo al script
        if registry is None:
            script_dir = _Path(__file__).parent.parent
            reg_path = script_dir / "core" / "hooks" / "hooks-registry.yaml"
            if reg_path.exists():
                with open(reg_path) as f:
                    registry = yaml.safe_load(f)
    except Exception:
        pass

    if registry and isinstance(registry, dict):
        selected = _resolve_hooks_from_registry(config, registry)
        return _entries_to_hooks_config(selected)

    # Fallback hardcodeado
    return {
        "PreToolUse": [
            {
                "matcher": "Edit|Write",
                "hooks": [
                    {"type": "command", "command": "python3 .claude/hooks/pre-edit-check.py"}
                ],
            }
        ],
        "Stop": [
            {
                "hooks": [
                    {"type": "command", "command": "bash .claude/hooks/post-turn-check.sh"}
                ]
            }
        ],
    }


def _entries_to_hooks_config(entries: list[dict]) -> dict:
    """Convierte la lista de hook entries del registry al formato de settings.json."""
    # Agrupar por evento
    by_event: dict[str, list[dict]] = {}
    for entry in entries:
        event = entry.get("event", "")
        if not event:
            continue
        hook_file = entry.get("hook", "")
        if not hook_file:
            continue

        # Determinar comando según extensión
        if hook_file.endswith(".py"):
            command = f"python3 .claude/hooks/{hook_file}"
        elif hook_file.endswith(".sh"):
            command = f"bash .claude/hooks/{hook_file}"
        else:
            command = f".claude/hooks/{hook_file}"

        hook_entry: dict = {"type": "command", "command": command}
        matcher = entry.get("matcher")

        group_key = f"{event}|{matcher or ''}"
        if group_key not in by_event:
            by_event[group_key] = []
        by_event[group_key].append((event, matcher, hook_entry))

    # Construir estructura final
    result: dict = {}
    # Agrupar por (event, matcher) para consolidar hooks del mismo bloque
    blocks: dict[tuple, list] = {}
    for entry in entries:
        event = entry.get("event", "")
        hook_file = entry.get("hook", "")
        matcher = entry.get("matcher") or None
        if not event or not hook_file:
            continue

        if hook_file.endswith(".py"):
            command = f"python3 .claude/hooks/{hook_file}"
        elif hook_file.endswith(".sh"):
            command = f"bash .claude/hooks/{hook_file}"
        else:
            command = f".claude/hooks/{hook_file}"

        key = (event, matcher)
        if key not in blocks:
            blocks[key] = []
        blocks[key].append({"type": "command", "command": command})

    for (event, matcher), hook_list in blocks.items():
        if event not in result:
            result[event] = []
        block: dict = {"hooks": hook_list}
        if matcher:
            block["matcher"] = matcher
        result[event].append(block)

    return result


def _generate_settings_json(root: Path, config: dict):
    """Genera .claude/settings.json con permisos y hooks según el stack del proyecto."""
    import json
    settings_path = root / ".claude" / "settings.json"
    if settings_path.exists() and not FORCE:
        print(f"  [KEEP] .claude/settings.json — ya existe (--force para regenerar)")
        return
    language = config.get("project", {}).get("language", "typescript")
    stack = config.get("stack", {})
    backend = (stack.get("backend") or "").lower()
    database = (stack.get("database") or "").lower()
    profiles = config.get("agents", {}).get("profiles", [])
    allow: list[str] = []
    if language in ("typescript", "javascript"):
        allow += ["Bash(pnpm *)", "Bash(npm *)", "Bash(npx *)", "Bash(node *)"]
        if "prisma" in backend or any("prisma" in p for p in profiles):
            allow.append("Bash(npx prisma *)")
        if "drizzle" in backend or any("drizzle" in p for p in profiles):
            allow.append("Bash(npx drizzle-kit *)")
    elif language == "python":
        allow += ["Bash(python3 *)", "Bash(pip3 *)", "Bash(uv *)", "Bash(pytest *)", "Bash(ruff *)"]
        if "django" in backend or any("django" in p for p in profiles):
            allow.append("Bash(python3 manage.py *)")
        if "fastapi" in backend:
            allow.append("Bash(uvicorn *)")
    elif language == "ruby":
        allow += ["Bash(bundle *)", "Bash(rails *)", "Bash(rake *)", "Bash(rspec *)"]
    elif language == "go":
        allow += ["Bash(go *)", "Bash(golangci-lint *)"]
    elif language == "php":
        allow += ["Bash(composer *)", "Bash(php *)", "Bash(php artisan *)"]
    if database == "postgresql":
        allow += ["Bash(psql *)", "Bash(pg_dump *)"]
    allow += ["Bash(git status)", "Bash(git diff *)", "Bash(git log *)", "Bash(git branch *)"]

    # Configuración de hooks (Forge v2) — derivada del registry si existe
    hooks_config = _build_hooks_config(config)

    settings = {
        "permissions": {"allow": sorted(set(allow))},
        "hooks": hooks_config,
    }
    already_existed = settings_path.exists()
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
        f.write("\n")
    action = "UPD" if already_existed else "OK"
    print(f"  [{action}]   .claude/settings.json ({len(settings['permissions']['allow'])} permisos + hooks)")


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
            scope = _get_agent_scope(name, config)
            status = install_agent(src, dst, name, f"profile:{profile}", scope)
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
        scope = _get_agent_scope(agent_name, config)
        status = install_agent(src, dst, agent_name, "core", scope)
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


def init_codex(root: Path, forge: Path, config: dict):
    """Delega en el adapter de Codex CLI para generar AGENTS.md y codex.md."""
    import subprocess
    adapter = forge / "adapters" / "codex" / "generate-codex-config.py"
    if not adapter.exists():
        print(f"  [MISS] {adapter} — adapter de Codex no encontrado", file=sys.stderr)
        return
    args = ["python3", str(adapter)]
    result = subprocess.run(args, cwd=str(root))
    if result.returncode != 0:
        print(f"  [ERR] generate-codex-config.py salió con código {result.returncode}", file=sys.stderr)


def main():
    if "--tool" not in sys.argv:
        print("Uso: forge-init.py --tool <claude-code|opencode|kiro|codex|all> [--force] [--only=<agente>] [--forge <dir>]")
        sys.exit(1)

    idx = sys.argv.index("--tool")
    tool = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else "claude-code"

    # --forge <dir> o --forge=<dir> — permite a la extensión VS Code indicar la ruta explícita
    forge_override: str | None = None
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg.startswith("--forge="):
            forge_override = arg[len("--forge="):]
        elif arg == "--forge" and i + 1 < len(args):
            forge_override = args[i + 1]

    try:
        root = find_project_root()
        if forge_override:
            forge = Path(forge_override)
            if not forge.exists():
                print(f"ERROR: forge dir no existe: {forge_override}", file=sys.stderr)
                sys.exit(1)
        else:
            forge = find_forge_dir()
        config = load_project(root)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        print("  → Primer uso: python3 .agentic/scripts/forge-wizard.py  (wizard interactivo)", file=sys.stderr)
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
        print("\n  Hooks:")
        install_hooks(root, forge, config)
        print("\n  Wiki:")
        init_wiki(root, forge, config)
        print("\n  CLAUDE.md:")
        _generate_claude_md(root, forge, config)
        print("\n  settings.json:")
        _generate_settings_json(root, config)

    if tool in ("opencode", "all"):
        print(f"\n--- OpenCode ---")
        init_opencode(root, forge, config)

    if tool in ("kiro", "all"):
        print("\n--- Kiro ---")
        init_kiro(root, forge, config)

    if tool in ("codex", "all"):
        print("\n--- Codex CLI ---")
        init_codex(root, forge, config)

    print("\nDone. Revisar los archivos generados antes de commitear.")


if __name__ == "__main__":
    main()
