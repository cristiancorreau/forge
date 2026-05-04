#!/usr/bin/env python3
"""
forge — CLI principal del framework de desarrollo con agentes IA.

Uso:
  python3 .agentic/forge.py
  python3 .agentic/forge.py --help
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
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
MAGENTA     = "\033[35m"
BG_SEL      = "\033[48;5;235m"   # selección: fondo gris oscuro
FG_DESC     = "\033[38;5;252m"   # descripción: gris claro
ACCENT      = "\033[38;5;75m"    # acento: azul claro (key hints)
FG_MUTED    = "\033[38;5;240m"   # separadores y texto secundario

# Pills de categoría: (bg_color, fg_color, label_4chars)
_CAT_PILL: dict[str, tuple[str, str, str]] = {
    "framework":  ("\033[48;5;55m",  "\033[97m", " FW "),
    "mcp-server": ("\033[48;5;23m",  "\033[97m", "MCP "),
    "profile":    ("\033[48;5;22m",  "\033[97m", "PRF "),
    "tool":       ("\033[48;5;130m", "\033[97m", " TL "),
    "resource":   ("\033[48;5;17m",  "\033[97m", "DOC "),
}

_ANSI_ESC = re.compile(r'\x1b\[[0-9;?]*[a-zA-Z]')


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

def _strip_ansi(s: str) -> str:
    return _ANSI_ESC.sub("", s)

def _padded(s: str, width: int) -> str:
    """Pad s to visible width, ignorando códigos ANSI."""
    return s + " " * max(0, width - len(_strip_ansi(s)))

def _hint(key: str, action: str) -> str:
    return f"{ACCENT}{key}{RESET} {DIM}{action}{RESET}"

def _cat_pill(category: str) -> str:
    bg, fg, label = _CAT_PILL.get(category, ("\033[48;5;238m", "\033[97m", " ?? "))
    return f"{bg}{fg}{label}{RESET}"


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
    if not text:
        print()
        return

    border  = "─" * DESC_WIDTH
    wrapped = textwrap.wrap(text, width=DESC_WIDTH - 2)

    print(f"  {FG_MUTED}╭{border}╮{RESET}")
    for line in wrapped:
        padding = DESC_WIDTH - 2 - len(line)
        print(f"  {FG_MUTED}│{RESET} {FG_DESC}{line}{' ' * padding}{RESET} {FG_MUTED}│{RESET}")
    print(f"  {FG_MUTED}╰{border}╯{RESET}")

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
                    print(f"  {FG_MUTED}{'─' * 40}{RESET}")
                    continue
                if idx == cursor:
                    marker = f"{ACCENT}❯{RESET}"
                    label  = f"{BG_SEL} {_padded(item.label, 43)}{RESET}"
                else:
                    marker = " "
                    label  = f" {item.label}"
                print(f"  {marker}{label}")

            print()
            current_desc = items[cursor].description if not items[cursor].separator else ""
            _draw_description(current_desc)
            print()
            print(f"  {_hint('↑↓', 'navegar')}    {_hint('⏎', 'seleccionar')}    {_hint('q', 'salir')}")

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
    W       = 54
    inner   = "─" * W
    badge   = f"\033[48;5;238m\033[97m v{VERSION} {RESET}"   # pill de versión
    name    = f"{CYAN}{BOLD}forge{RESET}"
    dot     = f" {FG_MUTED}·{RESET} "
    tag     = f"{DIM}Agentic Development Framework{RESET}"
    content = f" {name} {badge}{dot}{tag}"
    print(f"  {CYAN}╭{inner}╮{RESET}")
    print(f"  {CYAN}│{RESET}{_padded(content, W)}{CYAN}│{RESET}")
    print(f"  {CYAN}╰{inner}╯{RESET}")

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def pause(msg: str = "Presiona Enter para volver al menú…") -> None:
    write(SHOW_CURSOR)
    print(f"\n  {d(msg)}", flush=True)
    try:
        # Limpiar stdin residual del subprocess antes de leer
        import termios as _t
        _t.tcflush(sys.stdin.fileno(), _t.TCIFLUSH)
    except Exception:
        pass
    try:
        input()
    except (KeyboardInterrupt, EOFError):
        pass
    write(HIDE_CURSOR)


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
# Catálogo — helpers de integración
# ---------------------------------------------------------------------------

_AITMPL_MOD = None  # cache del módulo cargado

def _load_aitmpl_mod():
    global _AITMPL_MOD
    if _AITMPL_MOD is not None:
        return _AITMPL_MOD
    script = SCRIPTS / "aitmpl-search.py"
    spec = importlib.util.spec_from_file_location("aitmpl_search", script)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    _AITMPL_MOD = mod
    return mod


CATEGORY_LABELS_MENU = {
    "framework":  "Framework",
    "mcp-server": "MCP Server",
    "profile":    "Profile forge",
    "tool":       "Herramienta",
    "resource":   "Recurso",
}


def _mcp_slug(item: dict) -> str:
    install = item.get("install")
    if install:
        return install["slug"]
    name = item.get("name", "")
    if "—" in name:
        return name.split("—", 1)[1].strip().split()[0].lower()
    return name.lower().replace(" ", "-")


def _profile_slug(item: dict) -> str:
    name = item.get("name", "")
    if "—" in name:
        return name.split("—", 1)[1].strip().lower()
    return name.lower().replace(" ", "-")


def _copy_to_clipboard(text: str) -> None:
    try:
        subprocess.run(["pbcopy"], input=text.encode(), check=True, timeout=3)
        clr()
        _draw_header()
        print(f"\n  {g('Copiado al portapapeles.')}\n  {d(text)}")
    except Exception:
        clr()
        _draw_header()
        print(f"\n  URL: {text}")
    pause()


def _load_settings() -> dict:
    f = Path.cwd() / ".claude" / "settings.json"
    if not f.exists():
        return {}
    try:
        with open(f) as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError):
        return {}


def _save_settings(data: dict) -> None:
    f = Path.cwd() / ".claude" / "settings.json"
    f.parent.mkdir(parents=True, exist_ok=True)
    with open(f, "w") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def _is_mcp_installed(slug: str) -> bool:
    return slug in _load_settings().get("mcpServers", {})


def _install_mcp_server(item: dict) -> None:
    install = item["install"]
    slug    = install["slug"]
    params  = install.get("params", [])
    env_defs = install.get("env", [])

    clr()
    _draw_header()
    print(f"\n  Instalando {b(item['name'])}\n")

    # Prompts para parámetros en args
    values: dict[str, str] = {}
    for p in params:
        default = p.get("default", "")
        val = _ask_input(p["label"], default)
        values[p["key"]] = val if val else default

    # Construir args finales sustituyendo placeholders
    final_args = []
    for a in install.get("args", []):
        try:
            final_args.append(a.format_map(values))
        except KeyError:
            final_args.append(a)

    # Prompts para variables de entorno
    env_block: dict[str, str] = {}
    for e in env_defs:
        val = _ask_input(e["label"], e.get("default", ""))
        if val:
            env_block[e["key"]] = val

    # Construir config del server
    server_cfg: dict = {
        "command": install["command"],
        "args":    final_args,
    }
    if env_block:
        server_cfg["env"] = env_block

    # Merge en settings.json
    settings = _load_settings()
    already  = slug in settings.get("mcpServers", {})
    if "mcpServers" not in settings:
        settings["mcpServers"] = {}
    settings["mcpServers"][slug] = server_cfg
    _save_settings(settings)

    print()
    if already:
        print(f"  {y('Actualizado')} — '{slug}' ya existía en .claude/settings.json (reemplazado).")
    else:
        print(f"  {g('Instalado')} — '{slug}' agregado a .claude/settings.json.")
    print(f"\n  Reinicia Claude Code para activar el servidor MCP.")
    pause()


def _find_project_yaml() -> Optional[Path]:
    cwd = Path.cwd()
    for candidate in [cwd / "project.yaml", cwd / ".claude" / "project.yaml"]:
        if candidate.exists():
            return candidate
    return None


def _is_profile_in_project(slug: str) -> bool:
    yaml_file = _find_project_yaml()
    if not yaml_file:
        return False
    try:
        import yaml  # type: ignore
        with open(yaml_file) as f:
            data = yaml.safe_load(f)
        return slug in (data or {}).get("agents", {}).get("profiles", [])
    except Exception:
        return False


def _add_profile_to_project(slug: str) -> None:
    yaml_file = _find_project_yaml()
    if not yaml_file:
        clr()
        _draw_header()
        print(f"\n  {r('No se encontró project.yaml')} en el directorio actual.")
        print(f"  Ejecuta primero el wizard para crear el proyecto.")
        pause()
        return

    try:
        import yaml  # type: ignore
    except ImportError:
        clr()
        _draw_header()
        print(f"\n  {r('PyYAML no está instalado.')} Instálalo con: pip install pyyaml")
        pause()
        return

    try:
        with open(yaml_file) as f:
            data = yaml.safe_load(f) or {}

        agents   = data.setdefault("agents", {})
        profiles = agents.setdefault("profiles", [])

        clr()
        _draw_header()
        if slug in profiles:
            print(f"\n  El profile '{b(slug)}' ya está en project.yaml.")
        else:
            profiles.append(slug)
            with open(yaml_file, "w") as f:
                yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
            print(f"\n  {g('Agregado')} — profile '{b(slug)}' añadido a project.yaml.")
            print(f"\n  Ejecuta 'Inicializar agentes' para instalar el agente en el proyecto.")
        pause()
    except Exception as exc:
        clr()
        _draw_header()
        print(f"\n  {r('Error al modificar project.yaml:')} {exc}")
        pause()


def _build_result_menu(results: list[dict]) -> list[MenuItem]:
    items = []
    for i, r in enumerate(results):
        cat     = r.get("category", "")
        pill    = _cat_pill(cat)          # 4 visible chars
        name    = r.get("name", "")
        display = name.split("—", 1)[1].strip() if "—" in name else name
        if len(display) > 37:
            display = display[:34] + "…"
        label = f"{pill} {display}"      # pill(4) + space(1) + display(≤37) = ≤42 visible
        items.append(MenuItem(label, key=str(i), description=r.get("description", "")))
    items.append(MenuItem("", separator=True))
    items.append(MenuItem("← Volver", key="back", description="Regresa al menú de búsqueda."))
    return items


def _action_menu_item(item: dict) -> None:
    category = item.get("category", "")
    name     = item.get("name", "")
    url      = item.get("url", "")

    actions: list[MenuItem] = []

    # MCP server: instalar
    if category == "mcp-server" and item.get("install"):
        slug    = _mcp_slug(item)
        already = _is_mcp_installed(slug)
        if already:
            label = f"{g('✓')} Instalado — reinstalar  ({slug})"
            desc  = f"'{slug}' ya está en .claude/settings.json. Reinstalar sobreescribirá la config."
        else:
            label = f"+ Instalar en proyecto  (.claude/settings.json)"
            desc  = "Agrega este MCP server a .claude/settings.json con los parámetros que indiques."
        actions.append(MenuItem(label, key="install", description=desc))

    # Profile: agregar a project.yaml
    if category == "profile":
        slug    = _profile_slug(item)
        already = _is_profile_in_project(slug)
        if already:
            actions.append(MenuItem(
                f"{g('✓')} En project.yaml  ({slug})", key="noop",
                description=f"El profile '{slug}' ya está en agents.profiles de project.yaml.",
            ))
        else:
            actions.append(MenuItem(
                f"+ Agregar a project.yaml  ({slug})", key="add-profile",
                description=f"Añade '{slug}' a agents.profiles en project.yaml. Luego ejecuta 'Inicializar agentes'.",
            ))

    # Abrir en browser / copiar URL
    if url:
        actions.append(MenuItem(
            "↗ Abrir en browser", key="open",
            description=f"Abre {url[:60]} en el navegador predeterminado.",
        ))
        actions.append(MenuItem(
            "⎘ Copiar URL", key="copy",
            description=url,
        ))

    actions.append(MenuItem("", separator=True))
    actions.append(MenuItem("← Volver", key="back", description="Regresa a la lista de resultados."))

    title_short = name if len(name) <= 52 else name[:49] + "…"
    key = show_menu(title_short, actions)

    if key == "install":
        _install_mcp_server(item)
    elif key == "add-profile":
        _add_profile_to_project(_profile_slug(item))
    elif key == "open":
        subprocess.Popen(["open", url])
    elif key == "copy":
        _copy_to_clipboard(url)

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
    mod = _load_aitmpl_mod()

    while True:
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
        mode = show_menu("Buscar templates y recursos", items_mode,
                         subtitle="Catálogo curado — instala MCP servers y profiles directamente")
        if not mode or mode == "back":
            return

        results: list[dict] = []

        if mode == "category":
            cat_items = [
                MenuItem("framework    Frameworks de agentes IA",     key="framework",
                         description="forge, aider, micro-agent, anthropic-quickstarts, claude-code-action."),
                MenuItem("mcp-server   Servidores MCP instalables",   key="mcp-server",
                         description="20 servers con instalación directa: filesystem, git, github, postgres, slack, playwright, docker, cloudflare, vercel y más."),
                MenuItem("profile      Profiles de stack para forge", key="profile",
                         description="9 profiles: hono-drizzle, nextjs-admin, astro, fastapi, rails, nestjs, express, expo, playwright-crawler."),
                MenuItem("tool         Herramientas CLI",             key="tool",
                         description="Claude Code CLI, MCP Inspector."),
                MenuItem("resource     Documentación y listas",       key="resource",
                         description="Docs oficiales MCP, docs Claude Code, awesome-mcp-servers."),
                MenuItem("", separator=True),
                MenuItem("← Volver", key="back", description="Regresa al menú anterior."),
            ]
            cat = show_menu("Seleccionar categoría", cat_items)
            if not cat or cat == "back":
                continue
            results = mod._search_local("", category=cat)
        else:
            clr()
            _draw_header()
            print()
            query = _ask_input("¿Qué buscas?", "mcp postgres")
            if not query:
                continue
            results = mod._search_local(query)

        if not results:
            clr()
            _draw_header()
            print(f"\n  {y('Sin resultados.')} Prueba con otro término o cambia la categoría.\n")
            pause()
            continue

        # Mostrar resultados navegables
        while True:
            result_items = _build_result_menu(results)
            n = len(results)
            sel = show_menu(
                f"Resultados — {n} encontrado{'s' if n != 1 else ''}",
                result_items,
                subtitle="Enter para ver acciones  ·  instalar MCP · agregar profile · abrir URL",
            )
            if not sel or sel == "back":
                break
            _action_menu_item(results[int(sel)])


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
