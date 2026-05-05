"""
Tests para la extensión VS Code de forge.
Verifica la coherencia entre package.json (declaraciones) y extension.ts (implementación).
No requiere Node.js ni VS Code instalados.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

FORGE_ROOT = Path(__file__).parent.parent
EXT_DIR = FORGE_ROOT / "vscode-extension"
PKG_PATH = EXT_DIR / "package.json"
EXT_PATH = EXT_DIR / "src" / "extension.ts"


@pytest.fixture(scope="module")
def package_json() -> dict:
    return json.loads(PKG_PATH.read_text())


@pytest.fixture(scope="module")
def extension_ts() -> str:
    return EXT_PATH.read_text()


# ── Estructura de package.json ────────────────────────────────────────────────

def test_package_json_existe():
    assert PKG_PATH.exists()


def test_extension_ts_existe():
    assert EXT_PATH.exists()


def test_package_json_tiene_campos_requeridos(package_json):
    for field in ("name", "displayName", "version", "engines", "main", "contributes"):
        assert field in package_json, f"Falta campo '{field}' en package.json"


def test_engines_vscode_declarado(package_json):
    assert "vscode" in package_json["engines"]


def test_activation_events_declarados(package_json):
    events = package_json.get("activationEvents", [])
    assert len(events) > 0, "No hay activationEvents declarados"


def test_activation_siempre_activa(package_json):
    """onStartupFinished garantiza que la extensión esté siempre disponible."""
    events = package_json.get("activationEvents", [])
    assert "onStartupFinished" in events


def test_views_welcome_declarado(package_json):
    """viewsWelcome muestra instrucciones cuando no hay project.yaml."""
    welcome = package_json.get("contributes", {}).get("viewsWelcome", [])
    assert len(welcome) > 0, "Debe haber al menos un viewsWelcome"
    assert any("forge.openWizard" in w.get("contents", "") for w in welcome)


def test_commands_declarados(package_json):
    commands = package_json["contributes"]["commands"]
    assert len(commands) >= 6, "La extensión debe declarar al menos 6 comandos"


def test_configuracion_declarada(package_json):
    config = package_json["contributes"].get("configuration", {})
    props = config.get("properties", {})
    assert "forge.forgePath" in props
    assert "forge.tool" in props
    assert "forge.autoAuditOnSave" in props


def test_forge_tool_enum_incluye_runtimes(package_json):
    props = package_json["contributes"]["configuration"]["properties"]
    enum = props["forge.tool"].get("enum", [])
    for runtime in ("claude-code", "opencode", "kiro", "codex"):
        assert runtime in enum, f"Runtime '{runtime}' no está en forge.tool enum"


def test_views_container_declarado(package_json):
    containers = package_json["contributes"].get("viewsContainers", {})
    activitybar = containers.get("activitybar", [])
    assert len(activitybar) > 0, "Debe haber un viewsContainer en la activity bar"


# ── Coherencia package.json ↔ extension.ts ────────────────────────────────────

def test_cada_comando_registrado_en_extension_ts(package_json, extension_ts):
    """Cada comando declarado en package.json debe estar registrado en extension.ts."""
    commands = package_json["contributes"]["commands"]
    for cmd in commands:
        command_id = cmd["command"]
        assert command_id in extension_ts, (
            f"Comando '{command_id}' declarado en package.json "
            f"pero no encontrado en extension.ts"
        )


def test_extension_exporta_activate(extension_ts):
    assert "export function activate" in extension_ts


def test_extension_exporta_deactivate(extension_ts):
    assert "export function deactivate" in extension_ts


def test_extension_tiene_status_bar(extension_ts):
    assert "statusBarItem" in extension_ts or "createStatusBarItem" in extension_ts


def test_extension_usa_output_channel(extension_ts):
    assert "createOutputChannel" in extension_ts


def test_extension_detecta_forge_dir(extension_ts):
    assert "findForgeDir" in extension_ts or ".agentic" in extension_ts


def test_extension_maneja_project_yaml(extension_ts):
    assert "project.yaml" in extension_ts


def test_extension_usa_child_process(extension_ts):
    assert "child_process" in extension_ts or "spawn" in extension_ts


def test_extension_tiene_tree_provider(extension_ts):
    assert "TreeDataProvider" in extension_ts or "registerTreeDataProvider" in extension_ts
