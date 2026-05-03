"""
Tests para generate-claude-md.py.
Verifica que el CLAUDE.md generado refleje correctamente el project.yaml.
"""
import pytest
from pathlib import Path
from conftest import load_module, make_project_yaml

FORGE_ROOT = Path(__file__).parent.parent
SCRIPT = FORGE_ROOT / "adapters" / "claude-code" / "generate-claude-md.py"


@pytest.fixture(scope="module")
def mod():
    return load_module(SCRIPT, "gen_claude_md", argv=["generate-claude-md.py"])


# ── _render_phases ─────────────────────────────────────────────────────────────

def test_render_phases_sin_fases(mod):
    config = {"sprint": {"current": 1, "phases": []}}
    out = mod._render_phases(config)
    assert "Sprint 1" in out
    assert "Completadas" in out  # fallback


def test_render_phases_numero_sprint(mod):
    config = {"sprint": {"current": 3, "phases": []}}
    out = mod._render_phases(config)
    assert "Sprint 3" in out


def test_render_phases_con_fases(mod):
    config = {
        "sprint": {
            "current": 2,
            "phases": [
                {"id": "A", "name": "Core", "status": "completada", "specs": ["auth.md"]},
                {"id": "B", "name": "Features", "status": "en-curso", "specs": ["dashboard.md"]},
            ],
        }
    }
    out = mod._render_phases(config)
    assert "Sprint 2" in out
    assert "Fase A" in out
    assert "Core" in out
    assert "completada" in out
    assert "auth.md" in out
    assert "Fase B" in out
    assert "Features" in out
    assert "en-curso" in out
    assert "dashboard.md" in out


def test_render_phases_sin_specs_muestra_guion(mod):
    config = {"sprint": {"current": 1, "phases": [
        {"id": "A", "name": "Core", "specs": []}
    ]}}
    out = mod._render_phases(config)
    assert "—" in out  # guion para specs vacías


def test_render_phases_ausencia_sprint_key(mod):
    """Sin clave sprint en config → no falla."""
    out = mod._render_phases({})
    assert "Sprint 1" in out  # default


# ── generate_claude_md — comandos por lenguaje ────────────────────────────────

def _config(language: str) -> dict:
    return {
        "project": {"name": "P", "slug": "p", "description": "d", "language": language},
        "stack": {"backend": None, "frontend": None, "database": None, "testing": []},
        "compliance": {"frameworks": []},
        "agents": {"active": []},
        "paths": {"specs": "docs/specs", "progress": "docs/progress.html"},
        "sprint": {"current": 1, "phases": []},
    }


def test_typescript_usa_pnpm(mod):
    out = mod.generate_claude_md(_config("typescript"))
    assert "pnpm dev" in out
    assert "pnpm test" in out
    assert "pnpm lint" in out


def test_python_usa_pytest_y_ruff(mod):
    out = mod.generate_claude_md(_config("python"))
    assert "pytest" in out
    assert "ruff check" in out


def test_ruby_usa_rspec_y_rubocop(mod):
    out = mod.generate_claude_md(_config("ruby"))
    assert "rspec" in out
    assert "rubocop" in out


def test_go_usa_go_test(mod):
    out = mod.generate_claude_md(_config("go"))
    assert "go test" in out
    assert "golangci-lint" in out


def test_php_usa_phpunit(mod):
    out = mod.generate_claude_md(_config("php"))
    assert "phpunit" in out
    assert "phpstan" in out


def test_mixed_no_usa_comandos_vacios(mod):
    """Lenguaje 'mixed' debe tener texto placeholder, no strings vacíos."""
    out = mod.generate_claude_md(_config("mixed"))
    assert "stack mixto" in out


def test_lenguaje_desconocido_no_explota(mod):
    out = mod.generate_claude_md(_config("cobol"))
    assert "ver documentación del proyecto" in out


# ── Sección compliance ────────────────────────────────────────────────────────

def test_compliance_section_aparece_con_frameworks(mod):
    config = _config("typescript")
    config["compliance"]["frameworks"] = ["gdpr", "ley-21719"]
    out = mod.generate_claude_md(config)
    assert "Compliance activo" in out
    assert "GDPR" in out
    assert "LEY-21719" in out


def test_compliance_section_ausente_sin_frameworks(mod):
    out = mod.generate_claude_md(_config("typescript"))
    assert "Compliance activo" not in out


# ── Contenido mínimo garantizado ─────────────────────────────────────────────

def test_siempre_incluye_seccion_sdd(mod):
    out = mod.generate_claude_md(_config("typescript"))
    assert "Cómo trabajar (SDD)" in out


def test_siempre_incluye_que_no_hacer(mod):
    out = mod.generate_claude_md(_config("typescript"))
    assert "NO hacer" in out


def test_specs_path_aparece_en_output(mod):
    config = _config("typescript")
    config["paths"] = {"specs": "mi/specs/custom", "progress": "docs/progress.html"}
    out = mod.generate_claude_md(config)
    assert "mi/specs/custom" in out


def test_fases_conectadas_con_project_yaml(mod):
    """El CLAUDE.md generado debe reflejar las fases del sprint, no texto hardcodeado."""
    config = _config("typescript")
    config["sprint"] = {
        "current": 2,
        "phases": [{"id": "X", "name": "Test Phase", "status": "en-curso", "specs": []}],
    }
    out = mod.generate_claude_md(config)
    assert "Sprint 2" in out
    assert "Fase X" in out
    assert "Test Phase" in out
    # No debe tener el texto fijo del fallback cuando hay fases definidas
    assert "Completadas: —" not in out
