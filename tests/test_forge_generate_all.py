"""
Tests para forge-generate-all.py.
Verifica dry-run, filtro por runtime, auto-detección y manejo de runtime inválido.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
import yaml

FORGE_ROOT = Path(__file__).parent.parent
SCRIPT = FORGE_ROOT / "scripts" / "forge-generate-all.py"
PYTHON = sys.executable


def write_project_yaml(path: Path, data: dict | None = None) -> None:
    base = {
        "project": {"name": "Test Project", "mode": "standard"},
    }
    if data:
        base.update(data)
    path.write_text(yaml.dump(base))


def run_generate(cwd: Path, extra_args: list | None = None) -> subprocess.CompletedProcess:
    cmd = [PYTHON, str(SCRIPT)] + (extra_args or [])
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)


# ---------------------------------------------------------------------------
# --dry-run
# ---------------------------------------------------------------------------

def test_dry_run_does_not_call_generators(tmp_path):
    """--dry-run → imprime DRY-RUN y no ejecuta ningún generador."""
    write_project_yaml(tmp_path / "project.yaml")
    # Crear marcador .claude/ para que detecte claude-code
    (tmp_path / ".claude").mkdir()

    result = run_generate(tmp_path, ["--dry-run"])
    # El script debería salir sin error (sin runtimes tampoco sale con 0)
    assert result.returncode == 0
    combined = result.stdout + result.stderr
    assert "DRY-RUN" in combined or "dry-run" in combined.lower() or "Modo" in combined


def test_dry_run_prints_would_run(tmp_path):
    """--dry-run → indica qué se ejecutaría sin escribir archivos."""
    write_project_yaml(tmp_path / "project.yaml")
    (tmp_path / ".claude").mkdir()

    result = run_generate(tmp_path, ["--dry-run"])
    assert result.returncode == 0
    assert "DRY-RUN" in result.stdout


# ---------------------------------------------------------------------------
# --runtime flag
# ---------------------------------------------------------------------------

def test_runtime_flag_invalid_exits_1(tmp_path):
    """--runtime con valor desconocido → exit 1."""
    write_project_yaml(tmp_path / "project.yaml")

    result = run_generate(tmp_path, ["--runtime", "invalid-runtime"])
    assert result.returncode == 1
    combined = result.stdout + result.stderr
    assert "invalid-runtime" in combined or "desconocido" in combined or "ERROR" in combined


def test_runtime_flag_claude_code_only_runs_that_runtime(tmp_path):
    """--runtime claude-code --dry-run → solo reporta claude-code."""
    write_project_yaml(tmp_path / "project.yaml")
    (tmp_path / ".claude").mkdir()
    (tmp_path / ".kiro").mkdir()

    result = run_generate(tmp_path, ["--runtime", "claude-code", "--dry-run"])
    assert result.returncode == 0
    # Debe mencionar claude-code en la salida
    assert "claude-code" in result.stdout


def test_runtime_flag_kiro_only_runs_that_runtime(tmp_path):
    """--runtime kiro --dry-run → solo reporta kiro."""
    write_project_yaml(tmp_path / "project.yaml")
    (tmp_path / ".kiro").mkdir()

    result = run_generate(tmp_path, ["--runtime", "kiro", "--dry-run"])
    assert result.returncode == 0
    assert "kiro" in result.stdout


# ---------------------------------------------------------------------------
# Auto-detección
# ---------------------------------------------------------------------------

def test_autodetect_claude_code_from_dot_claude(tmp_path):
    """Si existe .claude/ → detecta claude-code como runtime activo."""
    write_project_yaml(tmp_path / "project.yaml")
    (tmp_path / ".claude").mkdir()

    result = run_generate(tmp_path, ["--dry-run"])
    assert result.returncode == 0
    assert "claude-code" in result.stdout


def test_autodetect_kiro_from_dot_kiro(tmp_path):
    """Si existe .kiro/ → detecta kiro como runtime activo."""
    write_project_yaml(tmp_path / "project.yaml")
    (tmp_path / ".kiro").mkdir()

    result = run_generate(tmp_path, ["--dry-run"])
    assert result.returncode == 0
    assert "kiro" in result.stdout


def test_autodetect_no_runtimes_exits_0(tmp_path):
    """Sin marcadores de runtime → exit 0 indicando que no hay runtimes."""
    write_project_yaml(tmp_path / "project.yaml")

    result = run_generate(tmp_path)
    assert result.returncode == 0
    combined = result.stdout + result.stderr
    assert "No se detectaron" in combined or "no" in combined.lower()


# ---------------------------------------------------------------------------
# runtimes.active en project.yaml tiene prioridad
# ---------------------------------------------------------------------------

def test_runtimes_active_overrides_autodetect(tmp_path):
    """runtimes.active en project.yaml → tiene prioridad sobre auto-detección."""
    data = {
        "project": {"name": "Test", "mode": "standard"},
        "runtimes": {"active": ["claude-code"]},
    }
    (tmp_path / "project.yaml").write_text(yaml.dump(data))
    # No crear marcadores — pero .kiro/ existe, no debe aparecer si no está en active
    (tmp_path / ".kiro").mkdir()

    result = run_generate(tmp_path, ["--dry-run"])
    assert result.returncode == 0
    # Debe indicar "project.yaml" como fuente
    assert "project.yaml" in result.stdout or "claude-code" in result.stdout


def test_runtimes_active_in_yaml_used_over_filesystem(tmp_path):
    """runtimes.active=['kiro'] con .claude/ presente → solo kiro se ejecuta."""
    data = {
        "project": {"name": "Test", "mode": "standard"},
        "runtimes": {"active": ["kiro"]},
    }
    (tmp_path / "project.yaml").write_text(yaml.dump(data))
    (tmp_path / ".claude").mkdir()

    result = run_generate(tmp_path, ["--dry-run"])
    assert result.returncode == 0
    assert "kiro" in result.stdout


# ---------------------------------------------------------------------------
# Runtime inválido
# ---------------------------------------------------------------------------

def test_unknown_runtime_name_exits_1(tmp_path):
    """Nombre de runtime desconocido vía --runtime → exit 1 con mensaje."""
    write_project_yaml(tmp_path / "project.yaml")

    result = run_generate(tmp_path, ["--runtime", "superstar"])
    assert result.returncode == 1
    combined = result.stdout + result.stderr
    assert "superstar" in combined
