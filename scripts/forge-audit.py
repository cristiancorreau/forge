#!/usr/bin/env python3
"""
forge-audit.py — Auditoría del estado actual de un proyecto vs el estándar forge.

Usage:
  python3 .agentic/scripts/forge-audit.py
  python3 .agentic/scripts/forge-audit.py --json    # output JSON para integrar en CI

Qué reporta:
  1. Health check por agente (.claude/agents/): frontmatter, secciones, modelo
  2. Gap analysis vs forge: diferencia entre el agente del proyecto y la versión de forge
  3. Oportunidades: profiles y skills disponibles en forge que el proyecto no usa
  4. Huérfanos: agentes en .claude/ que no están declarados en project.yaml

Requiere: pyyaml  →  pip3 install -r .agentic/requirements.txt
"""
import json
import os
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pip3 install -r .agentic/requirements.txt", file=sys.stderr)
    sys.exit(1)

# ── ANSI colors (desactivar si no es TTY) ─────────────────────────────────────
USE_COLOR = sys.stdout.isatty()
def c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if USE_COLOR else text
OK  = lambda t: c("32", t)   # verde
WARN= lambda t: c("33", t)   # amarillo
ERR = lambda t: c("31", t)   # rojo
INFO= lambda t: c("36", t)   # cyan
BOLD= lambda t: c("1",  t)   # negrita
DIM = lambda t: c("2",  t)   # gris

# ── Secciones requeridas por el estándar ──────────────────────────────────────
REQUIRED_SECTIONS = ["## Reglas", "## No hagas"]
OPTIONAL_SECTIONS = ["## Workflow", "## Stack", "## Tu trabajo", "## Anti-patterns"]

REQUIRED_FRONTMATTER = ["name", "description", "model", "tools", "tier"]

VALID_MODELS = {"opus", "sonnet", "haiku"}
# Tier 1 reviewers deben usar opus
OPUS_ROLES = {"compliance-reviewer", "security-auditor", "orchestrator"}

# Umbrales de similitud de texto (SequenceMatcher.ratio, escala 0-1).
# Calibración: agentes Tier 1 sin modificar tienen ratio ~0.95-1.0 vs forge.
# Agentes con especialización moderada (añadir 20-40 líneas) caen a ~0.65-0.80.
# Agentes reescritos para un dominio específico (Tier 3) caen a <0.40.
# Ajustar SIMILARITY_WARN a 0.70 para proyectos con fuerte especialización.
SIMILARITY_WARN     = 0.80  # <80% → posibles mejoras disponibles en forge
SIMILARITY_OUTDATED = 0.50  # <50% → probablemente desactualizado o fork intencional


# ── Parsing ───────────────────────────────────────────────────────────────────

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


def parse_frontmatter(content: str) -> dict:
    """Extrae el bloque --- ... --- del inicio del archivo."""
    m = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not m:
        return {}
    try:
        return yaml.safe_load(m.group(1)) or {}
    except Exception:
        return {}


def read_agent(path: Path) -> dict:
    """Lee un archivo de agente y retorna su metadata + contenido."""
    content = path.read_text()
    fm = parse_frontmatter(content)
    return {
        "path": path,
        "name": path.stem,
        "content": content,
        "frontmatter": fm,
        "lines": len(content.splitlines()),
    }


def get_forge_version(forge, name, profiles):
    """
    Busca la versión forge de un agente.
    Prioridad: profiles (en orden) → core.
    Retorna (path, source_label) o (None, "").
    """
    for profile in profiles:
        p = forge / "profiles" / profile / "agents" / f"{name}.md"
        if p.exists():
            return p, f"profile:{profile}"
    p = forge / "core" / "agents" / f"{name}.md"
    if p.exists():
        return p, "core"
    return None, ""


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


# ── Checks ────────────────────────────────────────────────────────────────────

def check_frontmatter(agent):
    issues = []
    fm = agent["frontmatter"]

    if not fm:
        issues.append({"level": "error", "msg": "Sin bloque frontmatter (--- ... ---)"})
        return issues

    for field in REQUIRED_FRONTMATTER:
        if field not in fm:
            issues.append({"level": "error", "msg": f"Falta campo '{field}' en frontmatter"})

    if "description" in fm:
        desc = str(fm["description"])
        if len(desc) > 120:
            issues.append({"level": "warn", "msg": f"description muy larga ({len(desc)} chars) — debe caber en 1 línea clara"})
        if "NO" not in desc.upper() and "no trabaja" not in desc.lower() and "scope" not in desc.lower():
            issues.append({"level": "warn", "msg": "description no declara scope explícito (qué NO hace / en qué directorio trabaja)"})

    if "model" in fm:
        model = str(fm["model"])
        if model not in VALID_MODELS:
            issues.append({"level": "error", "msg": f"model '{model}' inválido — usar: opus | sonnet | haiku"})
        name = agent["name"]
        if name in OPUS_ROLES and model != "opus":
            issues.append({"level": "warn", "msg": f"'{name}' debería usar model: opus (toma decisiones complejas)"})
        if name not in OPUS_ROLES and model == "opus":
            issues.append({"level": "warn", "msg": "model: opus en agente de implementación — sonnet es suficiente y más económico"})

    return issues


def check_sections(agent):
    issues = []
    content = agent["content"]

    for section in REQUIRED_SECTIONS:
        if section not in content:
            # Buscar variantes comunes
            section_key = section.replace("## ", "").lower()
            variants = [f"## anti-patterns", f"## no hacer", f"## restricciones"]
            found_variant = any(v in content.lower() for v in variants)
            if not found_variant:
                issues.append({"level": "error", "msg": f"Falta sección '{section}' (requerida por estándar)"})

    if agent["lines"] < 15:
        issues.append({"level": "warn", "msg": f"Agente muy corto ({agent['lines']} líneas) — probablemente incompleto"})

    return issues


def check_vs_forge(agent, forge, profiles):
    issues = []
    tier = agent["frontmatter"].get("tier")

    # Tier 3 (dominio): no existe en forge por diseño — correcto
    if tier == 3:
        issues.append({"level": "ok", "msg": "Tier 3 (dominio) — no se compara con forge"})
        return issues

    forge_path, source = get_forge_version(forge, agent["name"], profiles)

    if forge_path is None:
        if not tier:
            # Sin tier: posiblemente Tier 3 no anotado, reportar como sugerencia
            issues.append({"level": "info", "msg": "No encontrado en forge — si es Tier 3, agregar 'tier: 3' al frontmatter"})
        elif tier in (1, 2):
            issues.append({"level": "warn", "msg": f"Tier {tier} declarado pero no existe en forge — ¿falta crear el profile?"})
        return issues

    forge_content = forge_path.read_text()
    ratio = similarity(agent["content"], forge_content)
    forge_lines = len(forge_content.splitlines())
    project_lines = agent["lines"]

    extended = project_lines > forge_lines * 1.2   # proyecto tiene >20% más líneas
    # Divergencia simétrica: mismo orden de magnitud, contenido diferente (especialización)
    comparable = forge_lines * 0.7 <= project_lines <= forge_lines * 1.2

    if ratio >= SIMILARITY_WARN:
        issues.append({"level": "ok", "msg": f"Al día con forge ({source}) — similitud {ratio:.0%}"})
    elif ratio >= SIMILARITY_OUTDATED:
        if extended or comparable:
            diff_lines = project_lines - forge_lines
            sign = "+" if diff_lines >= 0 else ""
            issues.append({
                "level": "info",
                "msg": f"Especialización intencional vs forge ({source}) — similitud {ratio:.0%}, {sign}{diff_lines} líneas respecto a forge",
            })
        else:
            diff_lines = forge_lines - project_lines
            issues.append({
                "level": "warn",
                "msg": f"Posibles mejoras disponibles en forge ({source}) — similitud {ratio:.0%}, forge tiene +{diff_lines} líneas (puede ser reescritura intencional — verificar manualmente)",
                "may_be_intentional": True,
                "fix": f"python3 .agentic/scripts/forge-init.py --tool claude-code --force --only={agent['name']}"
            })
    else:
        if extended:
            diff_lines = project_lines - forge_lines
            issues.append({
                "level": "info",
                "msg": f"Muy extendido vs forge ({source}) — similitud {ratio:.0%}, proyecto tiene +{diff_lines} líneas (fork intencional)",
            })
        elif comparable:
            issues.append({
                "level": "warn",
                "msg": f"Contenido muy diferente a forge ({source}) — similitud {ratio:.0%}. ¿Especialización intencional o desactualizado?",
                "fix": f"Revisar manualmente vs python3 .agentic/scripts/forge-init.py --tool claude-code --force --only={agent['name']}"
            })
        else:
            issues.append({
                "level": "error",
                "msg": f"Muy diferente a forge ({source}) — similitud {ratio:.0%}. Probablemente desactualizado (diferencia mayor al 50% — verificar si coincide con cambio de versión de forge)",
                "fix": f"python3 .agentic/scripts/forge-init.py --tool claude-code --force --only={agent['name']}"
            })

    return issues


# ── Oportunidades ─────────────────────────────────────────────────────────────

def find_opportunities(forge, config, installed_names):
    opps = []
    agents_cfg = config.get("agents", {})
    active_profiles = agents_cfg.get("profiles", [])
    skills_cfg = config.get("skills", {})
    active_skills = skills_cfg.get("active", [])
    integrations = skills_cfg.get("integrations", [])

    # Profiles disponibles en forge que el proyecto no usa
    profiles_dir = forge / "profiles"
    if profiles_dir.exists():
        for profile_dir in sorted(profiles_dir.iterdir()):
            if not profile_dir.is_dir():
                continue
            profile_name = profile_dir.name
            if profile_name in active_profiles:
                continue
            agents_in_profile = list((profile_dir / "agents").glob("*.md"))
            if agents_in_profile:
                agent_names = [a.stem for a in agents_in_profile]
                opps.append({
                    "type": "profile",
                    "msg": f"Profile '{profile_name}' disponible en forge → provee: {', '.join(agent_names)}",
                    "fix": f"Agregar '{profile_name}' a agents.profiles en project.yaml"
                })

    # Skills universales disponibles que no están activos
    skills_dir = forge / "core" / "skills"
    universal_skills = {
        "security-audit", "db-migrate", "local2prod", "new-feature",
        "browser-test", "wiki-ingest", "wiki-query", "wiki-lint",
    }
    for skill in sorted(universal_skills - set(active_skills)):
        skill_path = skills_dir / skill / "SKILL.md"
        if skill_path.exists():
            opps.append({
                "type": "skill",
                "msg": f"Skill '{skill}' disponible pero no activo en project.yaml",
                "fix": f"Agregar '{skill}' a skills.active en project.yaml"
            })

    # Wiki health — si los skills están activos, verificar que el wiki existe
    wiki_skills_active = {"wiki-ingest", "wiki-query", "wiki-lint"}.intersection(active_skills)
    if wiki_skills_active:
        root = config.get("_root")
        wiki_cfg = config.get("wiki", {})
        wiki_path_str = wiki_cfg.get("path", "docs/wiki") if wiki_cfg else "docs/wiki"
        if root:
            wiki_path = Path(root) / wiki_path_str
            if not wiki_path.exists():
                opps.append({
                    "type": "wiki",
                    "msg": f"Skills de wiki activos pero {wiki_path_str}/ no existe",
                    "fix": "python3 .agentic/scripts/forge-init.py --tool claude-code  (crea la estructura inicial)"
                })
            elif not (wiki_path / "index.md").exists():
                opps.append({
                    "type": "wiki",
                    "msg": f"{wiki_path_str}/index.md falta — wiki incompleto",
                    "fix": "python3 .agentic/scripts/forge-init.py --tool claude-code  (recrea el índice)"
                })

    # Integración obsidian disponible
    if "obsidian-sync" not in integrations:
        opps.append({
            "type": "integration",
            "msg": "Skill 'obsidian-sync' disponible (requiere Obsidian + Local REST API)",
            "fix": "Agregar 'obsidian-sync' a skills.integrations si usás Obsidian"
        })

    # deploy.provider no configurado
    deploy = config.get("deploy", {})
    if not deploy.get("provider"):
        opps.append({
            "type": "config",
            "msg": "deploy.provider no configurado — skill 'local2prod' no puede funcionar sin él",
            "fix": "Configurar deploy.provider en project.yaml (vercel | railway | fly | github-actions | custom)"
        })

    return opps


# ── Report ────────────────────────────────────────────────────────────────────

def level_icon(level: str) -> str:
    return {"ok": OK("✓"), "warn": WARN("⚠"), "error": ERR("✗"), "info": INFO("→")}.get(level, " ")


def run_audit(as_json: bool = False):
    try:
        root = find_project_root()
        forge = find_forge_dir()
        config = load_project(root)
        config["_root"] = str(root)  # pass root for wiki path resolution
    except FileNotFoundError as e:
        print(ERR(f"ERROR: {e}"), file=sys.stderr)
        sys.exit(1)

    agents_dir = root / ".claude" / "agents"
    agents_cfg = config.get("agents", {})
    active_profiles = agents_cfg.get("profiles", [])

    declared = set(
        agents_cfg.get("active", []) +
        agents_cfg.get("compliance", []) +
        agents_cfg.get("specialized", []) +
        # agentes que los profiles proveerían
        [p.stem
         for profile in active_profiles
         for p in (forge / "profiles" / profile / "agents").glob("*.md")
         if (forge / "profiles" / profile / "agents").exists()]
    )

    # Leer todos los agentes instalados
    installed = {}
    if agents_dir.exists():
        for f in sorted(agents_dir.glob("*.md")):
            installed[f.stem] = read_agent(f)

    # ── Audit por agente ──────────────────────────────────────────────────────
    agent_results = {}
    for name, agent in installed.items():
        checks = []
        checks += check_frontmatter(agent)
        checks += check_sections(agent)
        checks += check_vs_forge(agent, forge, active_profiles)

        tier = agent["frontmatter"].get("tier", "?")
        in_declared = name in declared
        if not in_declared:
            checks.append({"level": "warn", "msg": "No declarado en project.yaml (active/compliance/profiles/specialized)"})

        worst = "ok"
        for c_ in checks:
            if c_["level"] == "error":
                worst = "error"
                break
            if c_["level"] == "warn" and worst != "error":
                worst = "warn"
            if c_["level"] == "info" and worst == "ok":
                worst = "info"

        agent_results[name] = {"tier": tier, "checks": checks, "status": worst}

    # ── Oportunidades ─────────────────────────────────────────────────────────
    opps = find_opportunities(forge, config, set(installed.keys()))

    # ── Huérfanos ─────────────────────────────────────────────────────────────
    orphans = [n for n in installed if n not in declared]

    # ── Output ────────────────────────────────────────────────────────────────
    if as_json:
        print(json.dumps({
            "project": config.get("project", {}).get("name"),
            "agents": {k: {**v, "path": str(v.get("path", ""))} for k, v in agent_results.items()},
            "opportunities": opps,
            "orphans": orphans,
        }, indent=2, default=str))
        return

    proj_name = config.get("project", {}).get("name", "?")
    n_ok   = sum(1 for r in agent_results.values() if r["status"] == "ok")
    n_info = sum(1 for r in agent_results.values() if r["status"] == "info")
    n_warn = sum(1 for r in agent_results.values() if r["status"] == "warn")
    n_err  = sum(1 for r in agent_results.values() if r["status"] == "error")

    print()
    print(BOLD(f"forge audit — {proj_name}"))
    print("═" * 60)

    # Resumen
    print(f"\n{BOLD('RESUMEN')}")
    print(f"  {len(installed)} agentes en .claude/agents/")
    print(f"  {len(declared)} declarados en project.yaml")
    print(f"  {OK(str(n_ok))} conformes  {INFO(str(n_info))} sugerencias  {WARN(str(n_warn))} advertencias  {ERR(str(n_err))} gaps")
    if orphans:
        print(f"  {WARN(str(len(orphans)))} huérfanos (en .claude/ pero no en project.yaml)")

    # Agentes por tier
    by_tier: dict[str, list] = {}
    for name, result in agent_results.items():
        t = str(result["tier"])
        by_tier.setdefault(t, []).append((name, result))

    tier_labels = {"1": "Tier 1 — universal (core)", "2": "Tier 2 — profile (stack-specific)", "3": "Tier 3 — dominio (proyecto)", "?": "Sin tier declarado"}
    print(f"\n{BOLD('SALUD POR AGENTE')}")
    print("─" * 60)

    for tier_key in sorted(by_tier.keys()):
        print(f"\n  {DIM(tier_labels.get(tier_key, f'Tier {tier_key}'))}")
        for name, result in sorted(by_tier[tier_key]):
            icon = level_icon(result["status"])
            print(f"  {icon}  {BOLD(name)}")
            for check in result["checks"]:
                if check["level"] == "ok":
                    continue  # no imprimir los OK a menos que sea el único
                sub_icon = level_icon(check["level"])
                print(f"       {sub_icon} {check['msg']}")
                if "fix" in check:
                    print(f"         {DIM('→ ' + check['fix'])}")
            # Si el agente está ok, mostrar el mensaje positivo (el loop no imprime "ok")
            if result["status"] == "ok":
                good = [c for c in result["checks"] if c["level"] == "ok"]
                if good:
                    print(f"       {level_icon(good[0]['level'])} {DIM(good[0]['msg'])}")

    # Oportunidades
    if opps:
        print(f"\n{BOLD('OPORTUNIDADES DE MEJORA')}")
        print("─" * 60)
        type_labels = {"profile": "Profile", "skill": "Skill", "integration": "Integración", "config": "Config", "wiki": "Wiki"}
        for opp in opps:
            label = DIM(f"[{type_labels.get(opp['type'], opp['type'])}]")
            print(f"  {INFO('→')}  {label} {opp['msg']}")
            if "fix" in opp:
                print(f"       {DIM('→ ' + opp['fix'])}")

    # Huérfanos
    if orphans:
        print(f"\n{BOLD('HUÉRFANOS')} {DIM('(en .claude/ pero no en project.yaml)')}")
        print("─" * 60)
        for name in orphans:
            print(f"  {WARN('⚠')}  {name}.md — agregar a agents.active, profiles o specialized")

    # Gaps de project.yaml
    missing_in_project = [n for n in declared if n not in installed]
    if missing_in_project:
        print(f"\n{BOLD('AGENTES DECLARADOS SIN ARCHIVO')}")
        print("─" * 60)
        for name in missing_in_project:
            print(f"  {ERR('✗')}  {name}.md — declarado en project.yaml pero no existe en .claude/agents/")
            forge_path, source = get_forge_version(forge, name, active_profiles)
            if forge_path:
                print(f"       {DIM(f'→ Disponible en forge ({source}): python3 .agentic/scripts/forge-init.py --tool claude-code')}")
            else:
                print(f"       {DIM('→ Crear manualmente en .claude/agents/')}")

    print()
    if n_err > 0:
        print(ERR(f"  {n_err} gap(s) requieren atención antes de usar este proyecto con forge."))
    elif n_warn > 0:
        print(WARN(f"  {n_warn} advertencia(s). El proyecto funciona pero puede mejorar."))
    else:
        print(OK("  Todo conforme al estándar forge."))
    print(DIM("  Nota: similitud < 0.80 puede indicar personalización intencional, no solo desactualización."))
    print()


def main():
    as_json = "--json" in sys.argv
    run_audit(as_json=as_json)


if __name__ == "__main__":
    main()
