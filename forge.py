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

def _esc(code: str) -> str:
    return f"\033[{code}"

CLEAR_LINE   = _esc("2K\r")
CURSOR_UP    = _esc("1A")
HIDE_CURSOR  = _esc("?25l")
SHOW_CURSOR  = _esc("?25h")
RESET        = "\033[0m"
BOLD         = "\033[1m"
DIM          = "\033[2m"
CYAN         = "\033[36m"
GREEN        = "\033[32m"
YELLOW       = "\033[33m"
RED          = "\033[31m"
BG_SELECTED  = "\033[48;5;236m"  # fondo gris oscuro para ítem seleccionado

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
    """Lee un carácter (o secuencia de escape) del stdin en modo raw."""
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


KEY_UP    = "\x1b[A"
KEY_DOWN  = "\x1b[B"
KEY_ENTER = "\r"
KEY_Q     = "q"
KEY_ESC   = "\x1b"
KEY_CTRL_C = "\x03"

# ---------------------------------------------------------------------------
# Menú genérico con flechas
# ---------------------------------------------------------------------------

class MenuItem:
    def __init__(self, label: str, key: Optional[str] = None, separator: bool = False):
        self.label = label
        self.key = key
        self.separator = separator


def show_menu(
    title: str,
    items: list[MenuItem],
    subtitle: str = "",
    initial: int = 0,
) -> Optional[str]:
    """
    Muestra un menú navegable con flechas. Retorna el key del ítem seleccionado,
    o None si el usuario presiona ESC/q.
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
                    print(f"  {d('─' * 38)}")
                    continue
                if idx == cursor:
                    marker = c("▶")
                    label = f"{BG_SELECTED} {item.label:<36}{RESET}"
                else:
                    marker = " "
                    label = f" {item.label}"
                print(f"  {marker}{label}")

            print()
            print(f"  {d('↑↓ navegar   Enter seleccionar   q salir')}")

            ch = getch()

            if ch in (KEY_CTRL_C, KEY_Q, KEY_ESC):
                return None

            if ch == KEY_UP:
                pos = selectable.index(cursor)
                cursor = selectable[(pos - 1) % len(selectable)]

            elif ch == KEY_DOWN:
                pos = selectable.index(cursor)
                cursor = selectable[(pos + 1) % len(selectable)]

            elif ch == KEY_ENTER:
                return items[cursor].key
    finally:
        write(SHOW_CURSOR)


# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

def _draw_header() -> None:
    width = 46
    border = "─" * width
    print(f"  {CYAN}┌{border}┐{RESET}")
    title = f"forge v{VERSION}  —  Agentic Development Framework"
    padding = width - len(title)
    print(f"  {CYAN}│{RESET} {b(title)}{' ' * padding}{CYAN}│{RESET}")
    print(f"  {CYAN}└{border}┘{RESET}")


# ---------------------------------------------------------------------------
# Pantalla de confirmación / feedback
# ---------------------------------------------------------------------------

def pause(msg: str = "Presiona cualquier tecla para continuar…") -> None:
    print(f"\n  {d(msg)}")
    getch()


def run_script(script: Path, *args: str) -> int:
    """Ejecuta un script de forge mostrando su output en pantalla."""
    clr()
    _draw_header()
    print()
    cmd = [sys.executable, str(script)] + list(args)
    print(f"  {d('$ ' + ' '.join(cmd))}\n")
    result = subprocess.run(cmd)
    return result.returncode


# ---------------------------------------------------------------------------
# Submenu: forge-init
# ---------------------------------------------------------------------------

def menu_init() -> None:
    items = [
        MenuItem("Claude Code          .claude/agents/",  key="claude-code"),
        MenuItem("OpenCode             AGENTS.md",        key="opencode"),
        MenuItem("Kiro                 .kiro/steering/",  key="kiro"),
        MenuItem("Todos los runtimes",                    key="all"),
        MenuItem("", separator=True),
        MenuItem("← Volver",                              key="back"),
    ]
    key = show_menu(
        "Inicializar proyecto — elegir runtime",
        items,
        subtitle="Instala agentes según project.yaml del proyecto",
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


# ---------------------------------------------------------------------------
# Submenu: forge-audit
# ---------------------------------------------------------------------------

def menu_audit() -> None:
    items = [
        MenuItem("Auditoría completa",      key="full"),
        MenuItem("Solo errores (--only)",   key="only"),
        MenuItem("Salida JSON (CI)",        key="json"),
        MenuItem("", separator=True),
        MenuItem("← Volver",               key="back"),
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


# ---------------------------------------------------------------------------
# Submenu: wizard
# ---------------------------------------------------------------------------

def menu_wizard() -> None:
    items = [
        MenuItem("Modo automático (detecta equipo)",   key="auto"),
        MenuItem("Startup   — 1-2 personas",           key="startup"),
        MenuItem("Standard  — 3-8 personas",           key="standard"),
        MenuItem("Enterprise — 9+ personas",           key="enterprise"),
        MenuItem("", separator=True),
        MenuItem("← Volver",                           key="back"),
    ]
    key = show_menu(
        "Wizard — nuevo proyecto",
        items,
        subtitle="Genera project.yaml adaptado a tu equipo",
    )
    if not key or key == "back":
        return

    args: list[str] = []
    if key != "auto":
        args += [f"--mode={key}"]

    run_script(SCRIPTS / "forge-wizard.py", *args)
    pause()


# ---------------------------------------------------------------------------
# Submenu: scaffold profile
# ---------------------------------------------------------------------------

def menu_scaffold() -> None:
    clr()
    _draw_header()
    print(f"\n  {b('Crear nuevo profile Tier 2')}\n")
    print(f"  Perfiles disponibles:  hono-drizzle · nextjs-admin · expo · playwright-crawler")
    print(f"                         fastapi · express · rails · nestjs\n")
    print(f"  {d('Este wizard crea un perfil para un stack no cubierto.')}\n")

    name    = _ask_input("Nombre del stack (ej: django)")
    if not name:
        return
    engineer = _ask_input("Nombre del agente (ej: api-engineer)", "api-engineer")
    desc    = _ask_input("Descripción breve del agente (Enter para generar automático)")
    details = _ask_input("Tecnologías del stack (ej: Django 4.2 + PostgreSQL)")

    args = ["--name", name, "--engineer", engineer]
    if desc:
        args += ["--description", desc]
    if details:
        args += ["--stack-details", details]

    print()
    run_script(SCRIPTS / "forge-scaffold-profile.py", *args)
    pause()


# ---------------------------------------------------------------------------
# Submenu: aitmpl search
# ---------------------------------------------------------------------------

def menu_aitmpl() -> None:
    clr()
    _draw_header()
    print(f"\n  {b('Buscar templates en aitmpl.com')}\n")
    query = _ask_input("¿Qué buscas?", "fastapi backend")
    if not query:
        return

    items = [
        MenuItem("Mostrar resultados (texto)",  key="text"),
        MenuItem("Mostrar resultados (JSON)",   key="json"),
        MenuItem("", separator=True),
        MenuItem("← Volver",                   key="back"),
    ]
    key = show_menu("Formato de salida", items)
    if not key or key == "back":
        return

    args = [query]
    if key == "json":
        args.append("--json")

    run_script(SCRIPTS / "aitmpl-search.py", *args)
    pause()


# ---------------------------------------------------------------------------
# Submenu: teardown
# ---------------------------------------------------------------------------

def menu_teardown() -> None:
    items = [
        MenuItem("Vista previa (dry-run)",  key="dry"),
        MenuItem("Ejecutar teardown",       key="confirm"),
        MenuItem("", separator=True),
        MenuItem("← Volver",               key="back"),
    ]
    key = show_menu(
        "Teardown del proyecto",
        items,
        subtitle="Elimina artefactos de forge manteniendo tu trabajo",
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
# Input helpers (sin arrows — se usan dentro de sub-flujos)
# ---------------------------------------------------------------------------

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
# Menú principal
# ---------------------------------------------------------------------------

MAIN_ITEMS = [
    MenuItem("Nuevo proyecto         wizard interactivo",       key="wizard"),
    MenuItem("Inicializar agentes    forge-init",               key="init"),
    MenuItem("Auditar proyecto       forge-audit",              key="audit"),
    MenuItem("Buscar templates       aitmpl.com",               key="aitmpl"),
    MenuItem("Nuevo profile Tier 2   scaffold",                 key="scaffold"),
    MenuItem("Teardown               revertir instalación",     key="teardown"),
    MenuItem("", separator=True),
    MenuItem("Salir",                                           key="quit"),
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
              scripts/aitmpl-search.py           Busca templates en aitmpl.com
        """))
        return

    if not IS_TTY:
        print("forge: terminal interactivo requerido. Usar --help para ver opciones.", file=sys.stderr)
        sys.exit(1)

    while True:
        key = show_menu(
            "¿Qué quieres hacer?",
            MAIN_ITEMS,
        )
        if key is None or key == "quit":
            clr()
            print(f"\n  {d('forge — hasta luego.')}\n")
            break
        action = ACTIONS.get(key)
        if action:
            action()


if __name__ == "__main__":
    main()
