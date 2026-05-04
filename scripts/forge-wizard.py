#!/usr/bin/env python3
"""
forge-wizard.py — Wizard interactivo para configurar un proyecto nuevo con forge.

Usage:
  python3 .agentic/scripts/forge-wizard.py
  python3 .agentic/scripts/forge-wizard.py --dry-run
  python3 .agentic/scripts/forge-wizard.py --mode startup
  python3 .agentic/scripts/forge-wizard.py --mode enterprise --no-init
"""
from __future__ import annotations

import os
import sys
import textwrap
from pathlib import Path
from typing import List, Optional

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------

DRY_RUN = "--dry-run" in sys.argv
NO_INIT = "--no-init" in sys.argv

MODE_OVERRIDE: Optional[str] = None
for _arg in sys.argv[1:]:
    if _arg.startswith("--mode="):
        MODE_OVERRIDE = _arg.split("=", 1)[1].strip()
        break
if MODE_OVERRIDE is None and "--mode" in sys.argv:
    _idx = sys.argv.index("--mode")
    if _idx + 1 < len(sys.argv):
        MODE_OVERRIDE = sys.argv[_idx + 1].strip()

if MODE_OVERRIDE and MODE_OVERRIDE not in ("startup", "standard", "enterprise"):
    print(f"ERROR: --mode debe ser startup, standard o enterprise (recibido: {MODE_OVERRIDE})", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------

USE_COLOR = sys.stdout.isatty()

def _c(code: str, text: str) -> str:
    if not USE_COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"

def bold(t: str) -> str:
    return _c("1", t)

def cyan(t: str) -> str:
    return _c("36", t)

def green(t: str) -> str:
    return _c("32", t)

def yellow(t: str) -> str:
    return _c("33", t)

def dim(t: str) -> str:
    return _c("2", t)

# ---------------------------------------------------------------------------
# Input helpers
# ---------------------------------------------------------------------------

def ask(prompt: str, default: Optional[str] = None) -> str:
    hint = f" {dim(f'[{default}]')}" if default else ""
    try:
        value = input(f"{cyan('?')} {prompt}{hint}: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\n\nInterrumpido.")
        sys.exit(0)
    return value if value else (default or "")


def ask_choice(prompt: str, options: List[str], default: Optional[str] = None) -> str:
    opts_display = "  ".join(
        bold(f"[{o}]") if o == default else f"[{o}]"
        for o in options
    )
    print(f"{cyan('?')} {prompt}")
    print(f"  {opts_display}")
    while True:
        try:
            value = input(f"  Opción: ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\n\nInterrumpido.")
            sys.exit(0)
        if not value and default:
            return default
        if value in options:
            return value
        print(f"  {yellow('!')} Elige una de: {', '.join(options)}")


def ask_multiselect(prompt: str, options: List[str]) -> List[str]:
    print(f"{cyan('?')} {prompt}")
    for i, opt in enumerate(options, 1):
        print(f"  {dim(str(i))}) {opt}")
    print(f"  {dim('0')} ninguno")
    print(f"  {dim('Ejemplo: 1 3  o  ninguno')}")
    while True:
        try:
            raw = input(f"  Selección: ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\n\nInterrumpido.")
            sys.exit(0)
        if raw in ("0", "ninguno", "none", ""):
            return []
        parts = raw.replace(",", " ").split()
        try:
            indices = [int(p) for p in parts]
            if all(1 <= i <= len(options) for i in indices):
                return [options[i - 1] for i in indices]
        except ValueError:
            pass
        print(f"  {yellow('!')} Ingresa números separados por espacio (ej: 1 3) o 0 para ninguno")


def ask_yes_no(prompt: str, default: bool = True) -> bool:
    hint = "S/n" if default else "s/N"
    while True:
        try:
            raw = input(f"{cyan('?')} {prompt} {dim(f'[{hint}]')}: ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\n\nInterrumpido.")
            sys.exit(0)
        if not raw:
            return default
        if raw in ("s", "si", "sí", "y", "yes"):
            return True
        if raw in ("n", "no"):
            return False


def divider() -> None:
    width = min(os.get_terminal_size().columns if USE_COLOR else 60, 72)
    print(dim("─" * width))

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

PROFILES = [
    "hono-drizzle",
    "nextjs-admin",
    "expo",
    "playwright-crawler",
    "fastapi",
    "express",
    "rails",
    "nestjs",
    "otro",
]

STACK_HINTS = {
    "hono-drizzle":      ("hono",    "null",    "typescript"),
    "nextjs-admin":      ("null",    "nextjs",  "typescript"),
    "expo":              ("null",    "expo",    "typescript"),
    "playwright-crawler":("null",    "null",    "typescript"),
    "fastapi":           ("fastapi", "null",    "python"),
    "express":           ("express", "null",    "typescript"),
    "rails":             ("rails",   "rails-views", "ruby"),
    "nestjs":            ("nestjs",  "null",    "typescript"),
    "otro":              ("null",    "null",    "mixed"),
}

COMPLIANCE_OPTIONS = ["gdpr", "lgpd", "ley-21719", "ccpa"]

RUNTIMES = ["claude-code", "opencode", "kiro", "todos"]

CORE_AGENTS = [
    "orchestrator",
    "backend-engineer",
    "frontend-engineer",
    "test-engineer",
    "docs-writer",
    "compliance-reviewer",
    "security-auditor",
]

# ---------------------------------------------------------------------------
# Mode detection
# ---------------------------------------------------------------------------

def team_size_to_mode(size: int) -> str:
    if size <= 2:
        return "startup"
    if size <= 8:
        return "standard"
    return "enterprise"


def detect_mode() -> str:
    if MODE_OVERRIDE:
        return MODE_OVERRIDE
    print(f"{cyan('?')} ¿Cuántas personas hay en el equipo de desarrollo?")
    while True:
        try:
            raw = input(f"  Número de personas: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n\nInterrumpido.")
            sys.exit(0)
        try:
            n = int(raw)
            if n > 0:
                return team_size_to_mode(n)
        except ValueError:
            pass
        print(f"  {yellow('!')} Ingresa un número mayor a 0")

# ---------------------------------------------------------------------------
# Primary engineer heuristic for startup mode
# ---------------------------------------------------------------------------

def primary_engineer(backend: str, frontend: str) -> str:
    if backend != "null" and frontend != "null":
        return "backend-engineer"
    if backend != "null":
        return "backend-engineer"
    if frontend != "null":
        return "frontend-engineer"
    return "backend-engineer"

# ---------------------------------------------------------------------------
# YAML generators
# ---------------------------------------------------------------------------

def _null(v: str) -> str:
    return "null" if not v or v == "null" else f'"{v}"'


def build_yaml_startup(data: dict) -> str:
    name = data["name"]
    slug = data["slug"]
    desc = data["description"]
    lang = data["language"]
    backend = data["backend"]
    frontend = data["frontend"]
    profile = data["profile"]
    compliance = data["compliance"]

    engineer = primary_engineer(backend, frontend)
    profiles_line = f'["{profile}"]' if profile and profile != "otro" else "[]"
    compliance_line = (
        "[" + ", ".join(f'"{c}"' for c in compliance) + "]"
        if compliance else "[]"
    )

    return textwrap.dedent(f"""\
        # forge — modo startup (1-2 personas)
        # Overhead mínimo: no requiere SDD estricto ni compliance
        # Para equipos pequeños en fase de exploración
        project:
          name: "{name}"
          slug: "{slug}"
          description: "{desc}"
          language: "{lang}"
          mode: "startup"    # startup | standard | enterprise
          status: "active"

        team:
          name: "Equipo"
          members: []

        stack:
          backend: {_null(backend)}
          frontend: {_null(frontend)}
          database: null

        agents:
          active:
            - orchestrator
            - {engineer}
          compliance: []
          profiles: {profiles_line}

        sprint:
          current: 1

        compliance:
          frameworks: {compliance_line}
          pii_handling: false
          audit_logs: false
    """)


def build_yaml_standard(data: dict) -> str:
    name = data["name"]
    slug = data["slug"]
    desc = data["description"]
    lang = data["language"]
    backend = data["backend"]
    frontend = data["frontend"]
    profile = data["profile"]
    compliance = data["compliance"]

    profiles_line = f'["{profile}"]' if profile and profile != "otro" else "[]"
    compliance_agents = '    - compliance-reviewer' if compliance else ''
    compliance_line = (
        "[" + ", ".join(f'"{c}"' for c in compliance) + "]"
        if compliance else "[]"
    )
    pii = "true" if compliance else "false"

    agents_block = textwrap.dedent(f"""\
        agents:
          active:
            - orchestrator
            - backend-engineer
            - frontend-engineer
            - test-engineer
            - docs-writer
          compliance:
    """)
    if compliance:
        agents_block += "    - compliance-reviewer\n"
    else:
        agents_block += "    []\n"
    agents_block += f"  profiles: {profiles_line}\n"

    return textwrap.dedent(f"""\
        # forge — project.yaml
        project:
          name: "{name}"
          slug: "{slug}"
          description: "{desc}"
          language: "{lang}"
          mode: "standard"
          status: "active"

        team:
          name: "Equipo"
          members: []

        stack:
          backend: {_null(backend)}
          frontend: {_null(frontend)}
          database: null
          cache: null
          testing: []

        {agents_block}
        sprint:
          current: 1
          length_days: 14
          phases:
            - id: "A"
              name: "Core"
              specs: []
            - id: "B"
              name: "Features"
              specs: []

        skills:
          active:
            - security-audit
            - new-feature
          integrations: []

        deploy:
          provider: null
          branch: "main"

        compliance:
          frameworks: {compliance_line}
          pii_handling: {pii}
          audit_logs: false

        paths:
          specs: "docs/specs"
          progress: "docs/progress.html"
          migrations: null
          tests: null
    """)


def build_yaml_enterprise(data: dict) -> str:
    name = data["name"]
    slug = data["slug"]
    desc = data["description"]
    lang = data["language"]
    backend = data["backend"]
    frontend = data["frontend"]
    profile = data["profile"]
    compliance = data["compliance"]

    profiles_line = f'["{profile}"]' if profile and profile != "otro" else "[]"
    compliance_line = (
        "[" + ", ".join(f'"{c}"' for c in compliance) + "]"
        if compliance else "[]"
    )
    pii = "true" if compliance else "false"
    audit = "true" if compliance else "false"

    compliance_agents_block = ""
    if compliance:
        compliance_agents_block = "    - compliance-reviewer\n    - security-auditor"
    else:
        compliance_agents_block = "    []"

    return textwrap.dedent(f"""\
        # forge — project.yaml (enterprise)
        project:
          name: "{name}"
          slug: "{slug}"
          description: "{desc}"
          language: "{lang}"
          mode: "enterprise"
          status: "active"

        team:
          name: "Equipo"
          members: []

        stack:
          backend: {_null(backend)}
          frontend: {_null(frontend)}
          database: null
          cache: null
          testing: []

        agents:
          active:
            - orchestrator
            - backend-engineer
            - frontend-engineer
            - test-engineer
            - docs-writer
          compliance:
        {compliance_agents_block}
          profiles: {profiles_line}

        sprint:
          current: 1
          length_days: 14
          phases:
            - id: "A"
              name: "Arquitectura y SDD"
              specs: []
            - id: "B"
              name: "Core"
              specs: []
            - id: "C"
              name: "Features"
              specs: []
            - id: "D"
              name: "Compliance & Auditoría"
              specs: []

        skills:
          active:
            - security-audit
            - db-migrate
            - local2prod
            - new-feature
          integrations: []

        deploy:
          provider: null
          branch: "main"

        compliance:
          frameworks: {compliance_line}
          pii_handling: {pii}
          audit_logs: {audit}

        paths:
          specs: "docs/specs"
          progress: "docs/progress.html"
          migrations: null
          tests: null

        integrations:
          obsidian:
            vault_path: null
            map:
              api: null
              database: null
              frontend: null
              deploy: null
              decisions: null
    """)

# ---------------------------------------------------------------------------
# Main wizard
# ---------------------------------------------------------------------------

def main() -> None:
    print()
    print(bold("forge — Wizard de configuración de proyecto"))
    print(dim("Genera project.yaml adaptado a tu equipo y stack."))
    if DRY_RUN:
        print(yellow("  Modo --dry-run activo: no se escribirá ningún archivo."))
    divider()

    # 1. Mode
    mode = detect_mode()
    mode_labels = {"startup": "Startup (1-2 personas)", "standard": "Standard (3-8)", "enterprise": "Enterprise (9+)"}
    print(f"  Modo detectado: {bold(mode_labels[mode])}")
    divider()

    # 2. Project metadata
    print(bold("Datos del proyecto"))
    name = ask("Nombre del proyecto", "Mi Proyecto")
    slug_default = name.lower().replace(" ", "-")
    slug = ask("Slug (lowercase, sin espacios)", slug_default)
    desc = ask("Descripción breve")
    divider()

    # 3. Stack / profile
    print(bold("Stack"))
    print(f"  Perfiles disponibles:")
    for p in PROFILES:
        if p == "otro":
            print(f"    {dim('otro')}  — stack no cubierto, crear perfil nuevo")
        else:
            print(f"    {p}")
    profile = ask_choice("¿Qué perfil describe mejor tu stack?", PROFILES, default="hono-drizzle")
    backend, frontend, lang_default = STACK_HINTS.get(profile, ("null", "null", "mixed"))
    lang = ask("Lenguaje principal del proyecto", lang_default)
    divider()

    # 4. Runtime
    print(bold("Runtime"))
    runtime = ask_choice("¿Qué herramienta usas para los agentes?", RUNTIMES, default="claude-code")
    divider()

    # 5. Compliance
    print(bold("Compliance"))
    compliance = ask_multiselect(
        "¿Qué frameworks de compliance aplican? (0 = ninguno)",
        COMPLIANCE_OPTIONS,
    )
    divider()

    # 6. Output path
    print(bold("Destino"))
    out_default = str(Path.cwd() / "project.yaml")
    out_path_str = ask("Ruta donde guardar project.yaml", out_default)
    out_path = Path(out_path_str).expanduser().resolve()
    divider()

    # Build YAML
    data = {
        "name": name,
        "slug": slug,
        "description": desc,
        "language": lang,
        "backend": backend,
        "frontend": frontend,
        "profile": profile,
        "compliance": compliance,
    }

    if mode == "startup":
        yaml_content = build_yaml_startup(data)
    elif mode == "enterprise":
        yaml_content = build_yaml_enterprise(data)
    else:
        yaml_content = build_yaml_standard(data)

    # Write
    if DRY_RUN:
        print(bold("--- project.yaml (dry-run) ---"))
        print(yaml_content)
        print(bold("--- fin ---"))
    else:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(yaml_content, encoding="utf-8")
        print(green(f"  project.yaml escrito en: {out_path}"))

    divider()

    # 7. Scaffold hint for "otro"
    if profile == "otro":
        print(yellow("Stack no cubierto por perfiles existentes."))
        print(textwrap.dedent("""\
            Para crear un perfil Tier 2 nuevo:

              1. Crea el directorio:  .agentic/profiles/<tu-stack>/
              2. Agrega un AGENTS.md describiendo los agentes especializados
              3. Agrega los archivos de agente en  .agentic/profiles/<tu-stack>/agents/
              4. Registra el perfil en  .agentic/profiles/<tu-stack>/profile.yaml

        """))
        scaffold_script = Path(__file__).parent / "forge-scaffold-profile.py"
        if scaffold_script.exists():
            run_scaffold = ask_yes_no("¿Ejecutar forge-scaffold-profile.py para iniciar el scaffolding?", default=False)
            if run_scaffold and not DRY_RUN:
                import subprocess
                subprocess.run([sys.executable, str(scaffold_script)], check=False)
        else:
            print(dim("  (forge-scaffold-profile.py no encontrado — crea el perfil manualmente)"))
        divider()

    # 8. Run forge-init
    if not NO_INIT:
        tool_arg = runtime if runtime != "todos" else "all"
        run_init = ask_yes_no(
            f"¿Ejecutar forge-init.py --tool {tool_arg} ahora?",
            default=True,
        )
        if run_init and not DRY_RUN:
            forge_init = _find_forge_init()
            if forge_init:
                import subprocess
                cmd = [sys.executable, str(forge_init), f"--tool={tool_arg}"]
                print(dim(f"  $ {' '.join(cmd)}"))
                subprocess.run(cmd, check=False)
            else:
                print(yellow("  No se encontró forge-init.py. Ejecútalo manualmente:"))
                print(f"  python3 .agentic/scripts/forge-init.py --tool {tool_arg}")
        elif run_init and DRY_RUN:
            print(dim(f"  [dry-run] ejecutaría: forge-init.py --tool {tool_arg}"))
    divider()

    # 9. Próximos pasos
    print(bold("Próximos pasos"))
    steps = _build_next_steps(mode, out_path, runtime, compliance, profile, DRY_RUN, NO_INIT)
    for step in steps:
        print(f"  {step}")
    print()


def _find_forge_init() -> Optional[Path]:
    candidates = [
        Path(__file__).parent / "forge-init.py",
        Path.cwd() / ".agentic" / "scripts" / "forge-init.py",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def _build_next_steps(
    mode: str,
    out_path: Path,
    runtime: str,
    compliance: List[str],
    profile: str,
    dry_run: bool,
    no_init: bool,
) -> List[str]:
    steps = []
    if dry_run:
        steps.append(f"Quita --dry-run y vuelve a ejecutar para escribir los archivos.")
        return steps

    steps.append(f"Revisa {bold(str(out_path))} y ajusta las secciones que necesites.")

    tool_arg = runtime if runtime != "todos" else "all"
    if no_init:
        steps.append(f"Ejecuta:  {bold(f'python3 .agentic/scripts/forge-init.py --tool {tool_arg}')}")

    if profile == "otro":
        steps.append("Crea el perfil Tier 2 en  .agentic/profiles/<tu-stack>/")

    if mode == "startup":
        steps.append("Cuando el equipo crezca, cambia  mode: startup → standard  en project.yaml.")

    if mode == "enterprise" and compliance:
        steps.append("Revisa la sección compliance:  pii_handling y audit_logs ya están en true.")
        steps.append("Configura las integraciones de auditoría según los frameworks seleccionados.")

    if compliance:
        steps.append(
            "Compliance activo: "
            + ", ".join(bold(c) for c in compliance)
            + " — el compliance-reviewer estará disponible."
        )

    steps.append(
        "Documentación de forge: "
        + bold("https://github.com/socialweb-cl/forge")
    )
    return steps


if __name__ == "__main__":
    main()
