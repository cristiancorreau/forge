#!/usr/bin/env python3
"""
forge — CLI principal del framework de desarrollo con agentes IA.

Uso:
  python3 .agentic/forge.py
  python3 .agentic/forge.py --help
"""
from __future__ import annotations

import os
import sys
import subprocess
import textwrap
import termios
import tty
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Versión y rutas
# ---------------------------------------------------------------------------

VERSION = "2.0"
FORGE_DIR = Path(__file__).parent
SCRIPTS = FORGE_DIR / "scripts"

# ---------------------------------------------------------------------------
# Terminal helpers
# ---------------------------------------------------------------------------

IS_TTY = sys.stdin.isatty() and sys.stdout.isatty()

HIDE_CURSOR = "\033[?25l"
SHOW_CURSOR = "\033[?25h"
RESET       = "\033[0m"
BOLD        = "\033[1m"
DIM         = "\033[2m"
CYAN        = "\033[36m"
GREEN       = "\033[32m"
YELLOW      = "\033[33m"
RED         = "\033[31m"
BG_SEL      = "\033[48;5;236m"
FG_DESC     = "\033[38;5;252m"


def clr() -> None:
    os.system("clear")

def write(text: str) -> None:
    sys.stdout.write(text)
    sys.stdout.flush()

def b(t: str) -> str:  return f"{BOLD}{t}{RESET}"
def d(t: str) -> str:  return f"{DIM}{t}{RESET}"
def c(t: str) -> str:  return f"{CYAN}{t}{RESET}"
def g(t: str) -> str:  return f"{GREEN}{t}{RESET}"
def y(t: str) -> str:  return f"{YELLOW}{t}{RESET}"
def r(t: str) -> str:  return f"{RED}{t}{RESET}"


def getch() -> str:
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


KEY_UP     = "\x1b[A"
KEY_DOWN   = "\x1b[B"
KEY_ENTER  = "\r"
KEY_Q      = "q"
KEY_ESC    = "\x1b"
KEY_CTRL_C = "\x03"

# ---------------------------------------------------------------------------
# MenuItem
# ---------------------------------------------------------------------------

class MenuItem:
    def __init__(
        self,
        label: str,
        key: Optional[str] = None,
        separator: bool = False,
        description: str = "",
    ):
        self.label       = label
        self.key         = key
        self.separator   = separator
        self.description = description  # texto explicativo que aparece al seleccionar

# ---------------------------------------------------------------------------
# Panel de descripción
# ---------------------------------------------------------------------------

DESC_WIDTH = 50  # ancho interior del panel

def _draw_description(text: str) -> None:
    """Dibuja un panel con la descripción del ítem actualmente seleccionado."""
    if not text:
        print()
        return

    border = "─" * DESC_WIDTH
    wrapped = textwrap.wrap(text, width=DESC_WIDTH - 2)

    print(f"  {DIM}┌{border}┐{RESET}")
    for line in wrapped:
        padding = DESC_WIDTH - 2 - len(line)
        print(f"  {DIM}│{RESET} {FG_DESC}{line}{' ' * padding}{RESET} {DIM}│{RESET}")
    print(f"  {DIM}└{border}┘{RESET}")

# ---------------------------------------------------------------------------
# Menú genérico con flechas + panel de descripción
# ---------------------------------------------------------------------------

def show_menu(
    title: str,
    items: list[MenuItem],
    subtitle: str = "",
    initial: int = 0,
) -> Optional[str]:
    """
    Menú navegable con ↑↓ Enter. Muestra la descripción del ítem activo
    en un panel debajo de la lista. Retorna el key seleccionado o None.
    """
    selectable = [i for i, it in enumerate(items) if not it.separator]
    if not selectable:
        return None

    cursor = initial
    if cursor not in selectable:
        cursor = selectable[0]

    write(HIDE_CURSOR)
    try:
        while True:
            clr()
            _draw_header()
            print(f"\n  {b(title)}")
            if subtitle:
                print(f"  {d(subtitle)}")
            print()

            for idx, item in enumerate(items):
                if item.separator:
                    print(f"  {d('─' * 40)}")
                    continue
                if idx == cursor:
                    marker = c("▶")
                    label  = f"{BG_SEL} {item.label:<44}{RESET}"
                else:
                    marker = " "
                    label  = f" {item.label}"
                print(f"  {marker}{label}")

            print()
            current_desc = items[cursor].description if not items[cursor].separator else ""
            _draw_description(current_desc)
            print()
            print(f"  {d('↑↓ navegar   Enter seleccionar   q salir')}")

            ch = getch()

            if ch in (KEY_CTRL_C, KEY_Q, KEY_ESC):
                return None
            if ch == KEY_UP:
                pos    = selectable.index(cursor)
                cursor = selectable[(pos - 1) % len(selectable)]
            elif ch == KEY_DOWN:
                pos    = selectable.index(cursor)
                cursor = selectable[(pos + 1) % len(selectable)]
            elif ch == KEY_ENTER:
                return items[cursor].key
    finally:
        write(SHOW_CURSOR)

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

def _draw_header() -> None:
    width  = 50
    border = "─" * width
    title  = f"forge v{VERSION}  —  Agentic Development Framework"
    pad    = width - len(title)
    print(f"  {CYAN}┌{border}┐{RESET}")
    print(f"  {CYAN}│{RESET} {b(title)}{' ' * pad}{CYAN}│{RESET}")
    print(f"  {CYAN}└{border}┘{RESET}")

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def pause(msg: str = "Presiona cualquier tecla para continuar…") -> None:
    print(f"\n  {d(msg)}")
    getch()


def run_script(script: Path, *args: str) -> int:
    clr()
    _draw_header()
    print()
    cmd = [sys.executable, str(script)] + list(args)
    print(f"  {d('$ ' + ' '.join(cmd))}\n")
    result = subprocess.run(cmd)
    return result.returncode


def _ask_input(prompt: str, default: str = "") -> str:
    write(SHOW_CURSOR)
    hint = f" {d(f'[{default}]')}" if default else ""
    try:
        val = input(f"  {c('?')} {prompt}{hint}: ").strip()
    except (KeyboardInterrupt, EOFError):
        return default
    finally:
        write(HIDE_CURSOR)
    return val if val else default


def _ask_yes_no(prompt: str, default: bool = True) -> bool:
    write(SHOW_CURSOR)
    hint = "S/n" if default else "s/N"
    try:
        raw = input(f"  {c('?')} {prompt} {d(f'[{hint}]')}: ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        return default
    finally:
        write(HIDE_CURSOR)
    if not raw:
        return default
    return raw in ("s", "si", "sí", "y", "yes")

# ---------------------------------------------------------------------------
# Submenús
# ---------------------------------------------------------------------------

def menu_wizard() -> None:
    items = [
        MenuItem(
            "Automático  — detecta el modo según equipo", key="auto",
            description=(
                "Pregunta cuántas personas hay en el equipo y elige el modo correcto: "
                "Startup (1-2 personas), Standard (3-8) o Enterprise (9+). "
                "Luego guía la selección de stack, deploy, runtime y compliance."
            ),
        ),
        MenuItem(
            "Startup     — 1-2 personas", key="startup",
            description=(
                "Configuración mínima para equipos pequeños o proyectos en exploración. "
                "Un solo agente de implementación, sin fases de sprint formales y SDD opcional. "
                "Ideal para prototipos y MVPs donde el overhead debe ser mínimo."
            ),
        ),
        MenuItem(
            "Standard    — 3-8 personas", key="standard",
            description=(
                "Configuración completa con roster de agentes, fases de sprint A/B, "
                "skills de seguridad y features. Pensado para equipos de producto "
                "que trabajan con Claude Code de forma activa en el loop de desarrollo."
            ),
        ),
        MenuItem(
            "Enterprise  — 9+ personas", key="enterprise",
            description=(
                "Configuración con compliance activo (GDPR, Ley 21719, etc.), "
                "audit logs, security-auditor obligatorio y 4 fases de sprint. "
                "Incluye hint para integrar forge-audit --json en pipelines de CI."
            ),
        ),
        MenuItem("", separator=True),
        MenuItem("← Volver", key="back", description="Regresa al menú principal."),
    ]
    key = show_menu(
        "Nuevo proyecto — elegir modo",
        items,
        subtitle="El wizard genera project.yaml y opcionalmente ejecuta forge-init",
    )
    if not key or key == "back":
        return
    args: list[str] = [] if key == "auto" else [f"--mode={key}"]
    run_script(SCRIPTS / "forge-wizard.py", *args)
    pause()


def menu_init() -> None:
    items = [
        MenuItem(
            "Claude Code   →  .claude/agents/  +  CLAUDE.md", key="claude-code",
            description=(
                "Instala los agentes de forge en .claude/agents/ y genera CLAUDE.md "
                "con el contexto del proyecto. Es el runtime principal y el más completo. "
                "Los agentes existentes se preservan salvo que uses --force."
            ),
        ),
        MenuItem(
            "OpenCode      →  AGENTS.md", key="opencode",
            description=(
                "Genera AGENTS.md con el roster y descripción de cada agente "
                "en el formato que OpenCode y Codex esperan. "
                "No toca .claude/ ni otros archivos del proyecto."
            ),
        ),
        MenuItem(
            "Kiro          →  .kiro/steering/", key="kiro",
            description=(
                "Genera los steering files de Kiro: product.md, structure.md, "
                "agents.md y compliance.md (si hay frameworks configurados). "
                "Las reglas de compliance se propagan automáticamente desde project.yaml."
            ),
        ),
        MenuItem(
            "Todos         →  genera los tres formatos", key="all",
            description=(
                "Ejecuta los tres adapters en secuencia: Claude Code, OpenCode y Kiro. "
                "Útil cuando el equipo usa más de un runtime o quiere tener "
                "todos los formatos disponibles sin pasos adicionales."
            ),
        ),
        MenuItem("", separator=True),
        MenuItem("← Volver", key="back", description="Regresa al menú principal."),
    ]
    key = show_menu(
        "Inicializar agentes — elegir runtime",
        items,
        subtitle="Lee project.yaml e instala los agentes del proyecto",
    )
    if not key or key == "back":
        return
    clr()
    _draw_header()
    print(f"\n  Runtime: {b(key)}\n")
    force = _ask_yes_no("¿Sobreescribir agentes existentes? (--force)")
    extra = ["--force"] if force else []
    run_script(SCRIPTS / "forge-init.py", f"--tool={key}", *extra)
    pause()


def menu_audit() -> None:
    items = [
        MenuItem(
            "Auditoría completa", key="full",
            description=(
                "Compara todos los agentes instalados en .claude/agents/ contra "
                "los archivos de referencia en forge. Muestra similitud, errores "
                "de frontmatter, campos faltantes y acciones correctivas con el "
                "comando exacto para corregir cada problema."
            ),
        ),
        MenuItem(
            "Agente específico  (--only)", key="only",
            description=(
                "Audita un solo agente por nombre. Útil cuando actualizaste "
                "un agente y quieres verificar que está sincronizado sin "
                "revisar el roster completo."
            ),
        ),
        MenuItem(
            "Salida JSON  — para CI/CD", key="json",
            description=(
                "Imprime el resultado en JSON estructurado. Retorna exit code 1 "
                "si hay errores de severidad 'error' o 'critical'. "
                "Integrar en pipelines con: forge-audit.py --json | jq '.summary'"
            ),
        ),
        MenuItem("", separator=True),
        MenuItem("← Volver", key="back", description="Regresa al menú principal."),
    ]
    key = show_menu("Auditar proyecto", items)
    if not key or key == "back":
        return
    if key == "full":
        run_script(SCRIPTS / "forge-audit.py")
    elif key == "only":
        clr()
        _draw_header()
        print()
        agent = _ask_input("Nombre del agente a auditar", "backend-engineer")
        run_script(SCRIPTS / "forge-audit.py", f"--only={agent}")
    elif key == "json":
        run_script(SCRIPTS / "forge-audit.py", "--json")
    pause()


def menu_aitmpl() -> None:
    clr()
    _draw_header()
    print(f"\n  {b('Buscar templates y recursos de agentes IA')}\n")
    print(f"  {d('Catálogo curado: frameworks, MCP servers, profiles y herramientas.')}\n")
    items_mode = [
        MenuItem(
            "Buscar por palabra clave", key="query",
            description=(
                "Busca en el catálogo por nombre, descripción o tecnología. "
                "Ejemplos: 'postgres', 'rails', 'nextjs typescript', 'playwright'."
            ),
        ),
        MenuItem(
            "Ver por categoría        framework · mcp-server · profile · tool", key="category",
            description=(
                "Muestra todos los items de una categoría: frameworks de agentes, "
                "MCP servers (20 disponibles), profiles de forge (9), herramientas y recursos."
            ),
        ),
        MenuItem("", separator=True),
        MenuItem("← Volver", key="back", description="Regresa al menú principal."),
    ]
    mode = show_menu("¿Cómo quieres buscar?", items_mode)
    if not mode or mode == "back":
        return

    if mode == "category":
        categories = ["framework", "mcp-server", "profile", "tool", "resource"]
        cat_items = [
            MenuItem("framework    Frameworks de agentes IA",        key="framework",
                     description="forge, aider, micro-agent, anthropic-quickstarts, claude-code-action."),
            MenuItem("mcp-server   Servidores MCP",                  key="mcp-server",
                     description="20 servers: filesystem, git, github, postgres, sqlite, slack, puppeteer, playwright, docker, cloudflare, vercel y más."),
            MenuItem("profile      Profiles de stack para forge",    key="profile",
                     description="Los 9 profiles actuales: hono-drizzle, nextjs-admin, astro, fastapi, rails, nestjs, express, expo, playwright-crawler."),
            MenuItem("tool         Herramientas CLI",                key="tool",
                     description="Claude Code CLI, MCP Inspector."),
            MenuItem("resource     Documentación y listas",          key="resource",
                     description="Docs oficiales MCP, docs Claude Code, awesome-mcp-servers."),
            MenuItem("", separator=True),
            MenuItem("← Volver", key="back", description="Regresa al menú anterior."),
        ]
        cat = show_menu("Seleccionar categoría", cat_items)
        if not cat or cat == "back":
            return
        run_script(SCRIPTS / "aitmpl-search.py", "--category", cat)
    else:
        query = _ask_input("¿Qué buscas?", "mcp postgres")
        if not query:
            return
        run_script(SCRIPTS / "aitmpl-search.py", query)
    pause()


def menu_scaffold() -> None:
    clr()
    _draw_header()
    print(f"\n  {b('Crear nuevo profile Tier 2')}\n")
    print(textwrap.fill(
        "Un profile Tier 2 es un agente especializado para un stack tecnológico "
        "específico. Por ejemplo: un api-engineer para Django conoce los modelos, "
        "las migraciones y DRF — cosas que el agente genérico no sabe.",
        width=60, initial_indent="  ", subsequent_indent="  ",
    ))
    print()
    print(f"  {d('Profiles disponibles hoy: hono-drizzle · nextjs-admin · astro · expo')}")
    print(f"  {d('  playwright-crawler · fastapi · express · rails · nestjs')}\n")

    name = _ask_input("Nombre del stack nuevo  (ej: django, laravel, gin)")
    if not name:
        return
    engineer = _ask_input("Nombre del agente       (ej: api-engineer)", "api-engineer")
    desc     = _ask_input("Descripción breve       (Enter = generar automático)")
    details  = _ask_input("Tecnologías del stack   (ej: Django 4.2 + PostgreSQL + DRF)")

    args = ["--name", name, "--engineer", engineer]
    if desc:
        args += ["--description", desc]
    if details:
        args += ["--stack-details", details]
    print()
    run_script(SCRIPTS / "forge-scaffold-profile.py", *args)
    pause()


def menu_teardown() -> None:
    items = [
        MenuItem(
            "Vista previa  (dry-run)", key="dry",
            description=(
                "Muestra qué archivos serían eliminados sin borrar nada. "
                "Siempre es recomendable ejecutar esto primero para verificar "
                "que el teardown no toca archivos propios del proyecto."
            ),
        ),
        MenuItem(
            "Ejecutar teardown", key="confirm",
            description=(
                "Elimina los agentes instalados por forge de .claude/agents/, "
                "preservando los agentes Tier 3 (propios del proyecto) y los "
                "archivos de trabajo como CLAUDE.md y project.yaml. "
                "Pedirá confirmación antes de proceder."
            ),
        ),
        MenuItem("", separator=True),
        MenuItem("← Volver", key="back", description="Regresa al menú principal."),
    ]
    key = show_menu(
        "Teardown del proyecto",
        items,
        subtitle="Revierte la instalación de forge preservando el trabajo del proyecto",
    )
    if not key or key == "back":
        return
    if key == "dry":
        run_script(SCRIPTS / "forge-teardown.py")
    elif key == "confirm":
        clr()
        _draw_header()
        print(f"\n  {r(b('ATENCIÓN'))} — Esta operación elimina agentes instalados por forge.\n")
        if _ask_yes_no("¿Confirmar teardown?", default=False):
            run_script(SCRIPTS / "forge-teardown.py", "--confirm")
        else:
            print(f"\n  Cancelado.")
    pause()

# ---------------------------------------------------------------------------
# Menú principal
# ---------------------------------------------------------------------------

MAIN_ITEMS = [
    MenuItem(
        "Nuevo proyecto         wizard interactivo", key="wizard",
        description=(
            "Genera project.yaml paso a paso eligiendo tipo de proyecto, "
            "framework frontend/backend, base de datos, plataforma de deploy "
            "y compliance. Al terminar instala los agentes automáticamente."
        ),
    ),
    MenuItem(
        "Inicializar agentes    forge-init", key="init",
        description=(
            "Lee el project.yaml existente e instala los agentes de forge "
            "en el runtime elegido (Claude Code, OpenCode o Kiro). "
            "Por defecto no sobreescribe agentes ya existentes."
        ),
    ),
    MenuItem(
        "Auditar proyecto       forge-audit", key="audit",
        description=(
            "Compara los agentes instalados contra los de forge para detectar "
            "campos faltantes, versiones desactualizadas o agentes que ya no "
            "están en el roster activo. Soporta salida JSON para CI/CD."
        ),
    ),
    MenuItem(
        "Buscar templates       frameworks · MCP · profiles", key="aitmpl",
        description=(
            "Catálogo curado de 40+ recursos: frameworks (forge, aider), "
            "20 MCP servers (postgres, github, slack, playwright...), "
            "profiles de stack y herramientas. Filtrable por categoría. "
            "Funciona offline — sin dependencias de red."
        ),
    ),
    MenuItem(
        "Nuevo profile Tier 2   scaffold", key="scaffold",
        description=(
            "Crea el esqueleto de un agente especializado para un stack no cubierto "
            "por los profiles actuales (django, laravel, gin, sveltekit, etc.). "
            "Genera el .md con frontmatter correcto y todas las secciones obligatorias."
        ),
    ),
    MenuItem(
        "Teardown               revertir instalación", key="teardown",
        description=(
            "Elimina los artefactos que forge instaló en el proyecto: agentes en "
            ".claude/agents/, AGENTS.md, steering files de Kiro. "
            "Preserva tu trabajo: CLAUDE.md, project.yaml y agentes Tier 3 propios."
        ),
    ),
    MenuItem("", separator=True),
    MenuItem(
        "Salir", key="quit",
        description="Cierra el CLI de forge.",
    ),
]

ACTIONS = {
    "wizard":   menu_wizard,
    "init":     menu_init,
    "audit":    menu_audit,
    "aitmpl":   menu_aitmpl,
    "scaffold": menu_scaffold,
    "teardown": menu_teardown,
}


def main() -> None:
    if "--help" in sys.argv or "-h" in sys.argv:
        print(textwrap.dedent(f"""\
            forge v{VERSION} — Framework de desarrollo con agentes IA

            Uso:
              python3 .agentic/forge.py          Abre el CLI interactivo
              python3 .agentic/forge.py --help   Muestra esta ayuda

            Scripts disponibles directamente:
              scripts/forge-wizard.py            Wizard de nuevo proyecto
              scripts/forge-init.py              Instala agentes
              scripts/forge-audit.py             Audita el proyecto
              scripts/forge-scaffold-profile.py  Crea un profile Tier 2
              scripts/forge-teardown.py          Revierte la instalación
              scripts/aitmpl-search.py           Busca templates y recursos de agentes IA
        """))
        return

    if not IS_TTY:
        print("forge: terminal interactivo requerido. Usar --help para ver opciones.", file=sys.stderr)
        sys.exit(1)

    while True:
        key = show_menu("¿Qué quieres hacer?", MAIN_ITEMS)
        if key is None or key == "quit":
            clr()
            print(f"\n  {d('forge — hasta luego.')}\n")
            break
        action = ACTIONS.get(key)
        if action:
            action()


if __name__ == "__main__":
    main()
