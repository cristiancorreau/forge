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
try:
    import termios
    import tty
except ImportError:
    print(
        "ERROR: forge-wizard requiere Unix o macOS.\n"
        "  Los módulos 'termios' y 'tty' no están disponibles en Windows.\n"
        "  Alternativas: WSL (Windows Subsystem for Linux) o ejecutar en macOS/Linux.",
        file=sys.stderr,
    )
    sys.exit(1)
import yaml
from pathlib import Path
from typing import List, Optional, Tuple

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------

DRY_RUN  = "--dry-run"  in sys.argv
NO_INIT  = "--no-init"  in sys.argv

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
    print(f"ERROR: --mode debe ser startup, standard o enterprise", file=sys.stderr)
    sys.exit(1)

IS_TTY = sys.stdin.isatty() and sys.stdout.isatty()

# ---------------------------------------------------------------------------
# ANSI helpers
# ---------------------------------------------------------------------------

USE_COLOR = IS_TTY

def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if USE_COLOR else text

def bold(t: str)  -> str: return _c("1", t)
def cyan(t: str)  -> str: return _c("36", t)
def green(t: str) -> str: return _c("32", t)
def yellow(t: str)-> str: return _c("33", t)
def dim(t: str)   -> str: return _c("2", t)

HIDE_CURSOR = "\033[?25l" if USE_COLOR else ""
SHOW_CURSOR = "\033[?25h" if USE_COLOR else ""

def clr() -> None:
    if IS_TTY:
        os.system("clear")

def write(text: str) -> None:
    sys.stdout.write(text)
    sys.stdout.flush()

# ---------------------------------------------------------------------------
# Raw key reading
# ---------------------------------------------------------------------------

KEY_UP    = "\x1b[A"
KEY_DOWN  = "\x1b[B"
KEY_ENTER = "\r"
KEY_SPACE = " "
KEY_Q     = "q"
KEY_CTRL_C = "\x03"
KEY_ESC   = "\x1b"


def getch() -> str:
    if not IS_TTY:
        return KEY_ENTER
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
        if ch == "\x1b":
            ch2 = sys.stdin.read(1)
            ch3 = sys.stdin.read(1)
            return f"\x1b{ch2}{ch3}"
        return ch
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)

# ---------------------------------------------------------------------------
# Menú de selección única con flechas
# ---------------------------------------------------------------------------

def pick(title: str, options: List[Tuple[str, str]], subtitle: str = "") -> Optional[str]:
    """
    Muestra un menú de selección con ↑↓ Enter.
    options: lista de (key, label). Retorna key seleccionado o None si ESC/q.
    """
    if not options:
        return None
    cursor = 0
    write(HIDE_CURSOR)
    try:
        while True:
            clr()
            _draw_section(title, subtitle)
            for i, (key, label) in enumerate(options):
                if i == cursor:
                    mark = cyan("▶")
                    line = f"\033[48;5;236m {label:<44}\033[0m" if USE_COLOR else f"[{label}]"
                else:
                    mark = " "
                    line = f" {label}"
                print(f"  {mark}{line}")
            print()
            print(f"  {dim('↑↓ navegar   Enter seleccionar   q salir')}")

            ch = getch()
            if ch in (KEY_CTRL_C, KEY_Q, KEY_ESC):
                return None
            if ch == KEY_UP:
                cursor = (cursor - 1) % len(options)
            elif ch == KEY_DOWN:
                cursor = (cursor + 1) % len(options)
            elif ch == KEY_ENTER:
                return options[cursor][0]
    finally:
        write(SHOW_CURSOR)


def pick_multi(title: str, options: List[Tuple[str, str]], subtitle: str = "") -> List[str]:
    """
    Menú de selección múltiple con Space para marcar, Enter para confirmar.
    Retorna lista de keys seleccionados.
    """
    if not options:
        return []
    cursor  = 0
    selected: set[int] = set()
    write(HIDE_CURSOR)
    try:
        while True:
            clr()
            _draw_section(title, subtitle)
            for i, (key, label) in enumerate(options):
                check  = green("✓") if i in selected else dim("○")
                arrow  = cyan("▶") if i == cursor else " "
                if i == cursor:
                    line = f"\033[48;5;236m {check} {label:<40}\033[0m" if USE_COLOR else f"[{check}] {label}"
                else:
                    line = f" {check} {label}"
                print(f"  {arrow}{line}")
            print()
            count = len(selected)
            print(f"  {dim('Space marcar/desmarcar   Enter confirmar')}  {cyan(str(count))} seleccionado{'s' if count != 1 else ''}")

            ch = getch()
            if ch in (KEY_CTRL_C, KEY_ESC):
                return []
            if ch == KEY_UP:
                cursor = (cursor - 1) % len(options)
            elif ch == KEY_DOWN:
                cursor = (cursor + 1) % len(options)
            elif ch == KEY_SPACE:
                if cursor in selected:
                    selected.discard(cursor)
                else:
                    selected.add(cursor)
            elif ch == KEY_ENTER:
                return [options[i][0] for i in sorted(selected)]
    finally:
        write(SHOW_CURSOR)


def ask_text(prompt: str, default: str = "") -> str:
    """Input de texto libre — solo para nombre y descripción."""
    write(SHOW_CURSOR)
    hint = f" {dim(f'[{default}]')}" if default else ""
    try:
        val = input(f"  {cyan('?')} {prompt}{hint}: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\n\nInterrumpido.")
        sys.exit(0)
    finally:
        write(HIDE_CURSOR)
    return val if val else default


def _draw_section(title: str, subtitle: str = "") -> None:
    print()
    print(f"  {bold(title)}")
    if subtitle:
        print(f"  {dim(subtitle)}")
    print()

# ---------------------------------------------------------------------------
# Catálogo de opciones
# ---------------------------------------------------------------------------

PROJECT_TYPES = [
    ("static",      "Sitio estático / SSG          Astro, Hugo, 11ty"),
    ("webapp",      "Web app dinámica               Next.js, Nuxt, SvelteKit, Remix"),
    ("api",         "API / Backend                  FastAPI, Express, NestJS, Rails, Hono"),
    ("fullstack",   "Full-stack                     Frontend + Backend en el mismo repo"),
    ("wordpress",   "WordPress                      CMS · Divi · Elementor · FSE · plugins"),
    ("mobile",      "App móvil                      React Native / Expo"),
    ("saas",        "SaaS                           Full-stack con auth, billing y multi-tenant"),
    ("crawler",     "Crawler / Scraper              Playwright, Puppeteer"),
    ("cli",         "Herramienta CLI                Python, Go, Node"),
]

FRONTEND_FRAMEWORKS = [
    ("nextjs",      "Next.js           React + SSR/SSG · TypeScript"),
    ("astro",       "Astro             SSG/SSR · islands · TypeScript"),
    ("nuxt",        "Nuxt              Vue 3 + SSR/SSG · TypeScript"),
    ("sveltekit",   "SvelteKit         Svelte + SSR/SSG · TypeScript"),
    ("remix",       "Remix             React + SSR · TypeScript"),
    ("react-vite",  "React + Vite      SPA · TypeScript"),
    ("vue-vite",    "Vue + Vite        SPA · TypeScript"),
    ("angular",     "Angular           SPA · TypeScript"),
    ("none",        "Sin framework frontend"),
]

BACKEND_FRAMEWORKS = [
    ("hono",        "Hono              TypeScript · edge-ready · Drizzle ORM"),
    ("express",     "Express           Node.js · TypeScript"),
    ("nestjs",      "NestJS            Node.js · TypeScript · arquitectura modular"),
    ("fastapi",     "FastAPI           Python · async · Pydantic"),
    ("django",      "Django            Python · batteries-included · DRF"),
    ("rails",       "Ruby on Rails     Ruby · convención sobre config"),
    ("laravel",     "Laravel           PHP · Eloquent ORM · Sanctum"),
    ("gin",         "Gin               Go · alta performance"),
    ("none",        "Sin framework backend"),
]

WORDPRESS_PAGE_BUILDERS = [
    ("divi",        "Divi              Elegant Themes · Theme Builder · módulos custom"),
    ("elementor",   "Elementor Pro     Page Builder · Dynamic Tags · Loop Grid"),
    ("gutenberg",   "Gutenberg / FSE   Block Editor nativo · Full Site Editing"),
    ("none",        "Sin page builder   desarrollo de plugins o themes puros"),
]

DATABASES = [
    ("postgresql",  "PostgreSQL        Relacional · producción"),
    ("mysql",       "MySQL / MariaDB   Relacional · hosting compartido"),
    ("sqlite",      "SQLite            Relacional · local / edge"),
    ("mongodb",     "MongoDB           Documento · NoSQL"),
    ("supabase",    "Supabase          PostgreSQL as a Service + Auth"),
    ("planetscale", "PlanetScale       MySQL serverless · branching"),
    ("turso",       "Turso             SQLite edge · libSQL"),
    ("redis",       "Redis             Cache / pub-sub"),
    ("none",        "Sin base de datos"),
]

DEPLOY_TARGETS = [
    ("vercel",      "Vercel            Serverless · Edge · integración Git"),
    ("netlify",     "Netlify           Serverless · Edge · forms"),
    ("cloudflare",  "Cloudflare        Workers · Pages · R2 · D1"),
    ("railway",     "Railway           PaaS · containers · DB managed"),
    ("fly",         "Fly.io            VMs · Docker · multi-región"),
    ("aws",         "AWS               EC2 / Lambda / ECS / S3"),
    ("gcp",         "GCP               Cloud Run / GKE / Firebase"),
    ("digitalocean","DigitalOcean      Droplets · App Platform"),
    ("shared",      "Hosting compartido cPanel / FTP / PHP"),
    ("selfhosted",  "Self-hosted / VPS  Docker Compose · Nginx"),
    ("none",        "Sin deploy configurado aún"),
]

RUNTIMES = [
    ("claude-code", "Claude Code  — CLI de Anthropic · .claude/agents/   (recomendado)"),
    ("opencode",    "OpenCode     — editor alternativo open source · AGENTS.md"),
    ("kiro",        "Kiro         — IDE de AWS con IA integrada · .kiro/steering/"),
    ("codex",       "Codex CLI    — CLI de OpenAI · AGENTS.md"),
    ("all",         "Todos        — genera los cuatro formatos (para migrar después)"),
]

COMPLIANCE_OPTIONS = [
    ("gdpr",        "GDPR              Unión Europea"),
    ("lgpd",        "LGPD              Brasil"),
    ("ley-21719",   "Ley 21.719        Chile"),
    ("ccpa",        "CCPA              California, EE.UU."),
    ("hipaa",       "HIPAA             Salud · EE.UU."),
    ("pci-dss",     "PCI-DSS           Pagos con tarjeta"),
]

LANGUAGES = [
    ("typescript",  "TypeScript"),
    ("python",      "Python"),
    ("ruby",        "Ruby"),
    ("php",         "PHP"),
    ("go",          "Go"),
    ("mixed",       "Mixto  (varios lenguajes)"),
]

# ---------------------------------------------------------------------------
# Lógica de perfil sugerido
# ---------------------------------------------------------------------------

def suggest_profiles(ptype: str, frontend: str, backend: str,
                     page_builder: str = "none") -> List[str]:
    """Retorna los profiles de forge más adecuados según el tipo y stack."""
    profiles: List[str] = []

    frontend_map = {
        "nextjs":    "nextjs-admin",
        "astro":     "astro",
        "nuxt":      "vuenuxt",
        "sveltekit": "sveltekit",
    }
    backend_map = {
        "hono":      "hono-drizzle",
        "express":   "express",
        "nestjs":    "nestjs",
        "fastapi":   "fastapi",
        "rails":     "rails",
        "django":    "django",
        "laravel":   "laravel",
        "gin":       "go-gin",
    }

    if ptype == "mobile":
        return ["expo"]
    if ptype == "crawler":
        return ["playwright-crawler"]
    if ptype == "wordpress":
        return ["wordpress"]

    if frontend in frontend_map:
        profiles.append(frontend_map[frontend])
    if backend in backend_map:
        p = backend_map[backend]
        if p not in profiles:
            profiles.append(p)

    return profiles


def detect_language(frontend: str, backend: str, ptype: str = "") -> str:
    ts = {"nextjs", "astro", "sveltekit", "remix", "react-vite", "vue-vite",
          "angular", "nuxt", "hono", "express", "nestjs"}
    py  = {"fastapi", "django"}
    rb  = {"rails"}
    php = {"laravel", "wordpress"}
    go  = {"gin"}

    if ptype == "wordpress":
        return "php"

    langs: set[str] = set()
    if frontend in ts or backend in ts:
        langs.add("typescript")
    if backend in py:
        langs.add("python")
    if backend in rb:
        langs.add("ruby")
    if backend in php:
        langs.add("php")
    if backend in go:
        langs.add("go")

    if not langs:
        return "typescript"
    if len(langs) == 1:
        return langs.pop()
    return "mixed"


def primary_engineer(frontend: str, backend: str) -> str:
    if backend not in ("none", ""):
        return "backend-engineer"
    if frontend not in ("none", ""):
        return "frontend-engineer"
    return "backend-engineer"


def team_size_to_mode(size: int) -> str:
    if size <= 2:
        return "startup"
    if size <= 8:
        return "standard"
    return "enterprise"

# ---------------------------------------------------------------------------
# YAML builders
# ---------------------------------------------------------------------------

def _yaml_str(value: str) -> str:
    """Serializa un string de input del usuario como valor YAML seguro entre comillas dobles."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _null(v: str) -> str:
    return "null" if not v or v in ("none", "null") else f'"{v}"'

def _profiles_yaml(profiles: List[str]) -> str:
    if not profiles:
        return "[]  # sin profile Tier 2 — usa forge-scaffold-profile.py para crear uno"
    return "[" + ", ".join(f'"{p}"' for p in profiles) + "]"

def _compliance_yaml(frameworks: List[str]) -> str:
    if not frameworks:
        return "[]"
    return "[" + ", ".join(f'"{f}"' for f in frameworks) + "]"


def build_yaml(data: dict) -> str:
    mode       = data["mode"]
    name       = data["name"]
    slug       = data["slug"]
    desc       = data["description"]
    lang       = data["language"]
    ptype      = data["project_type"]
    frontend   = data["frontend"]
    backend    = data["backend"]
    database   = data["database"]
    deploy     = data["deploy"]
    profiles   = data["profiles"]
    runtime    = data["runtime"]
    compliance = data["compliance"]

    pii        = "true" if compliance else "false"
    audit      = "true" if any(f in compliance for f in ("gdpr", "lgpd", "ley-21719", "ccpa", "hipaa")) else "false"

    if mode == "startup":
        eng = primary_engineer(frontend, backend)
        return textwrap.dedent(f"""\
            # forge — project.yaml (modo startup)
            project:
              name: {_yaml_str(name)}
              slug: {_yaml_str(slug)}
              description: {_yaml_str(desc)}
              language: "{lang}"
              type: "{ptype}"
              mode: "startup"
              status: "active"

            team:
              name: "Equipo"
              members: []

            stack:
              frontend: {_null(frontend)}
              backend: {_null(backend)}
              database: {_null(database)}
              deploy: {_null(deploy)}

            agents:
              active:
                - orchestrator
                - {eng}
              compliance: []
              profiles: {_profiles_yaml(profiles)}

            sprint:
              current: 1

            compliance:
              frameworks: {_compliance_yaml(compliance)}
              pii_handling: false
              audit_logs: false

            paths:
              specs: "docs/specs"
              progress: "docs/progress.html"
        """)

    compliance_agents = "    - compliance-reviewer\n    - security-auditor" if compliance else "    []"
    phases_block = _phases_for_mode(mode)

    return textwrap.dedent(f"""\
        # forge — project.yaml (modo {mode})
        project:
          name: {_yaml_str(name)}
          slug: {_yaml_str(slug)}
          description: {_yaml_str(desc)}
          language: "{lang}"
          type: "{ptype}"
          mode: "{mode}"
          status: "active"

        team:
          name: "Equipo"
          members: []

        stack:
          frontend: {_null(frontend)}
          backend: {_null(backend)}
          database: {_null(database)}
          deploy: {_null(deploy)}

        agents:
          active:
            - orchestrator
            - backend-engineer
            - frontend-engineer
            - test-engineer
            - docs-writer
          compliance:
        {compliance_agents}
          profiles: {_profiles_yaml(profiles)}

        sprint:
          current: 1
          length_days: 14
          phases:
        {phases_block}

        skills:
          active:
            - security-audit
            - new-feature
            {('- db-migrate' if database not in ('none', '') else '# - db-migrate')}
          integrations: []

        deploy:
          provider: {_null(deploy)}
          branch: "main"

        compliance:
          frameworks: {_compliance_yaml(compliance)}
          pii_handling: {pii}
          audit_logs: {audit}

        paths:
          specs: "docs/specs"
          progress: "docs/progress.html"
          migrations: null
          tests: null
    """)


def _phases_for_mode(mode: str) -> str:
    if mode == "enterprise":
        return textwrap.dedent("""\
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
                  name: "Compliance y Auditoría"
                  specs: []""")
    return textwrap.dedent("""\
            - id: "A"
              name: "Core"
              specs: []
            - id: "B"
              name: "Features"
              specs: []""")

# ---------------------------------------------------------------------------
# Wizard principal
# ---------------------------------------------------------------------------

def main() -> None:
    clr()
    print()
    print(f"  {bold('forge — Wizard de proyecto nuevo')}")
    print()
    print(f"  forge organiza tu proyecto con un equipo de agentes IA.")
    print(f"  {dim('Cada agente tiene un rol fijo: backend, frontend, tests, documentación.')}")
    print()
    print(f"  Al terminar tendrás un {bold('project.yaml')} que:")
    print(f"  {dim('  · instala los agentes correctos para tu stack tecnológico')}")
    print(f"  {dim('  · configura Claude Code (u otro runtime) automáticamente')}")
    print(f"  {dim('  · adapta el nivel de proceso al tamaño de tu equipo')}")
    print()
    if DRY_RUN:
        print(f"  {yellow('--dry-run activo: no se escribirá ningún archivo')}")
        print()
    print(f"  {dim('↑↓ navegar   Enter seleccionar   q salir')}")
    print()
    input(f"  Presiona Enter para comenzar... ")

    # 1 — Modo / tamaño de equipo
    if MODE_OVERRIDE:
        mode = MODE_OVERRIDE
    else:
        size_key = pick(
            "¿Cuántas personas hay en el equipo de desarrollo?",
            [
                ("1",  "Solo yo / 1 persona"),
                ("2",  "2 personas"),
                ("4",  "3-8 personas"),
                ("9",  "9 o más personas"),
            ],
        )
        if size_key is None:
            sys.exit(0)
        mode = team_size_to_mode(int(size_key))

    mode_label = {"startup": "Startup (1-2)", "standard": "Standard (3-8)", "enterprise": "Enterprise (9+)"}
    print(f"  Modo: {bold(mode_label[mode])}\n")

    # 2 — Nombre del proyecto (único campo de texto libre)
    clr()
    _draw_section("Datos del proyecto")
    name = ask_text("Nombre del proyecto", "Mi Proyecto")
    slug = name.lower().replace(" ", "-").replace("_", "-")
    slug = ask_text("Slug (lowercase, sin espacios)", slug)
    desc = ask_text("Descripción breve", "")

    # 3 — Tipo de proyecto
    ptype_key = pick(
        "¿Qué tipo de proyecto es?",
        PROJECT_TYPES,
    )
    if ptype_key is None:
        sys.exit(0)

    # 4 — Frontend (si aplica)
    frontend     = "none"
    page_builder = "none"

    if ptype_key == "wordpress":
        # WordPress: preguntar page builder en vez de frontend/backend
        pb = pick(
            "¿Qué page builder / entorno usa el proyecto?",
            WORDPRESS_PAGE_BUILDERS,
            subtitle="Determina qué agente especializado se instalará.",
        )
        page_builder = pb if pb else "none"
        frontend = "none"
    elif ptype_key not in ("api", "cli"):
        if ptype_key == "mobile":
            frontend = "expo"
        elif ptype_key == "crawler":
            frontend = "none"
        else:
            opts = FRONTEND_FRAMEWORKS
            if ptype_key == "static":
                opts = [o for o in opts if o[0] in ("astro", "nextjs", "nuxt", "sveltekit", "none")]
            fk = pick("Framework frontend", opts)
            frontend = fk if fk else "none"

    # 5 — Backend (si aplica)
    backend = "none"
    if ptype_key == "wordpress":
        backend = "wordpress"
    elif ptype_key not in ("static", "mobile", "crawler"):
        if ptype_key == "api":
            bk = pick("Framework backend", [o for o in BACKEND_FRAMEWORKS if o[0] != "none"])
            backend = bk if bk else "none"
        else:
            bk = pick("Framework backend", BACKEND_FRAMEWORKS)
            backend = bk if bk else "none"
        if ptype_key == "crawler":
            backend = "none"

    if ptype_key in ("mobile", "expo"):
        frontend = "expo"
        backend  = "none"
    if ptype_key == "crawler":
        frontend = "none"
        backend  = "none"

    # Aviso temprano: stack seleccionado sin profile Tier 2
    _early_profiles = suggest_profiles(ptype_key, frontend, backend, page_builder)
    _stack_specified = backend not in ("none", "") or frontend not in ("none", "")
    if not _early_profiles and _stack_specified and ptype_key not in ("cli",):
        clr()
        _draw_section("Nota sobre tu stack")
        _stack_label = " + ".join(x for x in (frontend, backend) if x and x != "none")
        print(f"  {yellow('Sin agente especializado para:')} {bold(_stack_label)}")
        print()
        print(f"  forge instalará agentes genéricos que funcionan con cualquier stack.")
        print(f"  Los stacks con agente especializado (profile) son:")
        print(f"  {dim('  API/Backend:  hono · express · nestjs · fastapi · django · rails · laravel · gin')}")
        print(f"  {dim('  Frontend:     nextjs · astro · nuxt · sveltekit')}")
        print(f"  {dim('  CMS:          wordpress (Divi · Elementor · FSE)')}")
        print(f"  {dim('  Otros:        expo (mobile) · playwright (crawler)')}")
        print()
        print(f"  {dim('Puedes crear un agente propio después con forge-scaffold-profile.py')}")
        print()
        input(f"  Presiona Enter para continuar... ")

    # 6 — Base de datos
    database = "none"
    if ptype_key not in ("static", "mobile", "cli", "crawler"):
        db_opts = DATABASES
        if ptype_key == "api" and backend in ("fastapi", "django", "rails"):
            db_opts = [o for o in DATABASES if o[0] not in ("none",)]
        dk = pick("Base de datos", db_opts)
        database = dk if dk else "none"

    # 7 — Deploy
    deploy_key = pick(
        "¿Dónde se va a desplegar?",
        DEPLOY_TARGETS,
        subtitle="Elige la infraestructura principal",
    )
    deploy = deploy_key if deploy_key else "none"

    # 8 — Runtime
    runtime_key = pick(
        "¿Qué herramienta de IA usas?",
        RUNTIMES,
        subtitle="Elige la que ya tienes instalada. Si empiezas ahora, Claude Code es la más completa.",
    )
    runtime = runtime_key if runtime_key else "claude-code"

    # 9 — Compliance (multi-select)
    compliance = pick_multi(
        "¿Tu proyecto debe cumplir alguna regulación de privacidad?",
        COMPLIANCE_OPTIONS,
        subtitle="Activa los que aplican a tu mercado. Si no sabes, deja todos sin marcar.",
    )

    # 10 — Lenguaje y profiles detectados
    lang     = detect_language(frontend, backend, ptype_key)
    profiles = suggest_profiles(ptype_key, frontend, backend, page_builder)

    # Mostrar resumen antes de escribir
    clr()
    _draw_section("Resumen de configuración")
    rows = [
        ("Modo",          mode_label[mode]),
        ("Proyecto",      f"{name}  ({slug})"),
        ("Tipo",          ptype_key),
        ("Frontend",      frontend),
        ("Backend",       backend),
    ]
    if ptype_key == "wordpress":
        rows.append(("Page Builder", page_builder))
    rows += [
        ("Base datos",    database),
        ("Deploy",        deploy),
        ("Runtime",       runtime),
        ("Compliance",    ", ".join(compliance) if compliance else "ninguno"),
        ("Profiles",      ", ".join(profiles) if profiles else "ninguno (ver nota)"),
        ("Lenguaje",      lang),
    ]
    for label, value in rows:
        print(f"  {dim(f'{label:<12}')} {bold(value)}")

    if not profiles:
        print()
        print(f"  {yellow('Nota:')} No hay profile Tier 2 para esta combinación de stack.")
        print(f"  Los profiles disponibles son:")
        print(f"  {dim('  API/Backend:')}")
        print(f"  {dim('    hono-drizzle · express · nestjs · fastapi · django · rails · go-gin · laravel')}")
        print(f"  {dim('  Frontend:')}")
        print(f"  {dim('    nextjs-admin · astro · vuenuxt · sveltekit')}")
        print(f"  {dim('  CMS:')}")
        print(f"  {dim('    wordpress (Divi · Elementor · FSE)')}")
        print(f"  {dim('  Otros:')}")
        print(f"  {dim('    expo (mobile) · playwright-crawler (scraping)')}")
        print()
        print(f"  Para crear un profile propio para tu stack:")
        print(f"  {dim('python3 .agentic/scripts/forge-scaffold-profile.py --name <stack> --engineer <agente>')}")

    # 11 — Destino del project.yaml
    print()
    write(SHOW_CURSOR)
    out_default = str(Path.cwd() / "project.yaml")
    out_str = ask_text("Ruta para guardar project.yaml", out_default)
    out_path = Path(out_str).expanduser().resolve()
    write(HIDE_CURSOR)

    # Build YAML
    data = {
        "mode":         mode,
        "name":         name,
        "slug":         slug,
        "description":  desc,
        "language":     lang,
        "project_type": ptype_key,
        "frontend":     frontend,
        "backend":      backend,
        "database":     database,
        "deploy":       deploy,
        "profiles":     profiles,
        "runtime":      runtime,
        "compliance":   compliance,
    }
    yaml_content = build_yaml(data)

    if DRY_RUN:
        print()
        print(f"  {bold('--- project.yaml (dry-run) ---')}")
        print()
        print(yaml_content)
        print(f"  {bold('--- fin ---')}")
    else:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(yaml_content, encoding="utf-8")
        with open(out_path, encoding="utf-8") as _f:
            try:
                yaml.safe_load(_f)
            except yaml.YAMLError as _e:
                print(f"\n  ERROR: el YAML generado no es válido: {_e}", file=sys.stderr)
                out_path.unlink(missing_ok=True)
                sys.exit(1)
        print(f"\n  {green('✓')} project.yaml escrito en: {bold(str(out_path))}")

    # 12 — Ejecutar forge-init
    if not NO_INIT and not DRY_RUN:
        print()
        write(SHOW_CURSOR)
        tool_arg = runtime if runtime != "todos" else "all"
        try:
            raw = input(f"  {cyan('?')} ¿Ejecutar forge-init --tool {tool_arg} ahora? {dim('[S/n]')}: ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            raw = "n"
        write(HIDE_CURSOR)
        run_init = raw in ("", "s", "si", "sí", "y", "yes")

        if run_init:
            forge_init = _find_forge_init()
            if forge_init:
                import subprocess
                cmd = [sys.executable, str(forge_init), f"--tool={tool_arg}"]
                print(f"  {dim('$ ' + ' '.join(cmd))}\n")
                subprocess.run(cmd, check=False)
            else:
                print(f"  {yellow('!')} forge-init.py no encontrado. Ejecutar manualmente:")
                print(f"  python3 .agentic/scripts/forge-init.py --tool {tool_arg}")

    # 13 — Próximos pasos
    print()
    print(f"  {bold('Próximos pasos')}")
    steps = _next_steps(mode, out_path, runtime, compliance, profiles, DRY_RUN)
    for step in steps:
        print(f"  {step}")
    print()
    write(SHOW_CURSOR)


def _find_forge_init() -> Optional[Path]:
    for c in [Path(__file__).parent / "forge-init.py",
              Path.cwd() / ".agentic" / "scripts" / "forge-init.py"]:
        if c.exists():
            return c
    return None


def _next_steps(mode: str, out: Path, runtime: str, compliance: List[str],
                profiles: List[str], dry: bool) -> List[str]:
    steps: List[str] = []
    if dry:
        steps.append("Quita --dry-run y vuelve a ejecutar para escribir los archivos.")
        return steps

    steps.append(f"Revisar {bold(str(out))} y ajustar lo que necesites.")
    tool_arg = runtime if runtime != "todos" else "all"
    steps.append(f"Ejecutar: {bold(f'python3 .agentic/scripts/forge-init.py --tool {tool_arg}')}")

    if not profiles:
        steps.append(f"Crear un profile Tier 2 con forge-scaffold-profile.py para tu stack.")

    if mode == "startup":
        steps.append("Cuando el equipo crezca: cambiar  mode: startup → standard.")
    if compliance:
        steps.append("Compliance activo — compliance-reviewer incluido en el roster.")
    if mode == "enterprise":
        steps.append("Integrar forge-audit --json en el pipeline de CI.")

    return steps


if __name__ == "__main__":
    main()
