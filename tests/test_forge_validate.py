"""
Tests para forge-validate-project-yaml.py.
Verifica validación de project.yaml contra el schema v2 de Forge.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

FORGE_ROOT = Path(__file__).parent.parent
SCRIPT = FORGE_ROOT / "scripts" / "forge-validate-project-yaml.py"
PYTHON = sys.executable


def run_validate(cwd: Path, extra_args: list | None = None) -> subprocess.CompletedProcess:
    cmd = [PYTHON, str(SCRIPT)] + (extra_args or [])
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)


def write_project_yaml(tmp_path: Path, data: dict) -> Path:
    path = tmp_path / "project.yaml"
    path.write_text(yaml.dump(data))
    return path


MINIMAL_VALID = {
    "project": {
        "name": "Test Project",
        "mode": "standard",
    }
}

FULL_V2_VALID = {
    "project": {
        "name": "Full Project",
        "slug": "full-project",
        "description": "Proyecto completo v2",
        "language": "typescript",
        "mode": "enterprise",
        "status": "active",
    },
    "stack": {
        "backend": "hono",
        "frontend": "nextjs",
        "database": "postgresql",
        "orm": "drizzle",
        "package_manager": "pnpm",
        "testing": ["vitest", "playwright"],
    },
    "agents": {
        "active": ["orchestrator"],
        "compliance": [],
        "by_role": {
            "orchestrator": None,
        },
    },
    "deploy": {
        "provider": "vercel",
        "production_url": "https://example.vercel.app",
        "smoke_tests": [
            {"url": "/api/health", "expect_status": 200},
        ],
    },
    "mcp": {
        "servers": [
            {"name": "supabase", "auto_approve": ["list_tables"]},
        ],
    },
    "github": {
        "project": {
            "number": 1,
            "owner": "cristiancorreau",
            "repo": "forge",
        },
    },
    "rules": {
        "forbidden_in_production": ["console.log"],
        "conventional_commits": True,
        "required_review_before_ship": False,
        "require_spec_before_implementation": False,
        "forbidden_patterns": [],
    },
    "compliance": {
        "frameworks": ["gdpr"],
        "pii_handling": True,
    },
}


# ---------------------------------------------------------------------------
# Valid cases — exit 0
# ---------------------------------------------------------------------------

def test_valid_minimal_exits_0(tmp_path):
    """project.yaml mínimo (solo campos requeridos) → exit 0."""
    write_project_yaml(tmp_path, MINIMAL_VALID)
    result = run_validate(tmp_path)
    assert result.returncode == 0


def test_valid_full_v2_exits_0(tmp_path):
    """project.yaml completo con todas las secciones v2 → exit 0."""
    write_project_yaml(tmp_path, FULL_V2_VALID)
    result = run_validate(tmp_path)
    assert result.returncode == 0


# ---------------------------------------------------------------------------
# Missing required fields — exit 1
# ---------------------------------------------------------------------------

def test_missing_project_name_exits_1(tmp_path):
    """Falta project.name → exit 1."""
    data = {"project": {"mode": "standard"}}
    write_project_yaml(tmp_path, data)
    result = run_validate(tmp_path)
    assert result.returncode == 1


def test_missing_project_mode_exits_1(tmp_path):
    """Falta project.mode → exit 1."""
    data = {"project": {"name": "Test Project"}}
    write_project_yaml(tmp_path, data)
    result = run_validate(tmp_path)
    assert result.returncode == 1


# ---------------------------------------------------------------------------
# Invalid enum values — exit 1
# ---------------------------------------------------------------------------

def test_invalid_mode_exits_1(tmp_path):
    """project.mode con valor no válido → exit 1."""
    data = {"project": {"name": "Test", "mode": "superstar"}}
    write_project_yaml(tmp_path, data)
    result = run_validate(tmp_path)
    assert result.returncode == 1


def test_invalid_runtime_in_stack_testing_exits_1(tmp_path):
    """stack.testing con valor no válido → exit 1."""
    data = {
        "project": {"name": "Test", "mode": "standard"},
        "stack": {"testing": ["vitest", "invalid-framework"]},
    }
    write_project_yaml(tmp_path, data)
    result = run_validate(tmp_path)
    assert result.returncode == 1


# ---------------------------------------------------------------------------
# --json flag
# ---------------------------------------------------------------------------

def test_json_flag_invalid_produces_json_with_errors(tmp_path):
    """--json con YAML inválido → salida JSON con valid=false y errors no vacío."""
    data = {"project": {"name": "Test", "mode": "superstar"}}
    write_project_yaml(tmp_path, data)
    result = run_validate(tmp_path, ["--json"])
    assert result.returncode == 1
    parsed = json.loads(result.stdout)
    assert parsed["valid"] is False
    assert isinstance(parsed["errors"], list)
    assert len(parsed["errors"]) > 0


def test_json_flag_valid_produces_json_no_errors(tmp_path):
    """--json con YAML válido → salida JSON con valid=true y errors vacío."""
    write_project_yaml(tmp_path, MINIMAL_VALID)
    result = run_validate(tmp_path, ["--json"])
    assert result.returncode == 0
    parsed = json.loads(result.stdout)
    assert parsed["valid"] is True
    assert parsed["errors"] == []


# ---------------------------------------------------------------------------
# Non-existent file
# ---------------------------------------------------------------------------

def test_nonexistent_project_yaml_exits_1(tmp_path):
    """Sin project.yaml en el directorio → exit 1 con mensaje claro."""
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    result = run_validate(empty_dir)
    assert result.returncode == 1
    combined = result.stdout + result.stderr
    assert "project.yaml" in combined.lower() or "project.yaml" in combined


def test_nonexistent_json_flag_exits_1_with_json(tmp_path):
    """Sin project.yaml con --json → exit 1 con JSON válido."""
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    result = run_validate(empty_dir, ["--json"])
    assert result.returncode == 1
    parsed = json.loads(result.stdout)
    assert parsed["valid"] is False
    assert len(parsed["errors"]) > 0
