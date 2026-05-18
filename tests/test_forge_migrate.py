"""
Tests para forge-migrate-project-yaml.py.
Verifica migración de project.yaml de v1 a v2, dry-run y backup.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
import yaml

FORGE_ROOT = Path(__file__).parent.parent
SCRIPT = FORGE_ROOT / "scripts" / "forge-migrate-project-yaml.py"
PYTHON = sys.executable


def run_migrate(cwd: Path, extra_args: list | None = None) -> subprocess.CompletedProcess:
    cmd = [PYTHON, str(SCRIPT)] + (extra_args or [])
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)


V1_YAML = {
    "project": {
        "name": "Proyecto v1",
        "slug": "proyecto-v1",
        "description": "Proyecto sin campos v2",
        "language": "typescript",
        "status": "active",
    },
    "stack": {
        "backend": "hono",
        "frontend": "nextjs",
        "database": "postgresql",
        "testing": ["vitest"],
    },
    "agents": {
        "active": ["orchestrator"],
        "compliance": [],
    },
    "sprint": {"current": 1, "phases": []},
}

# v2 detectado por presencia de 'rules', 'mcp', 'github' o 'project.mode'
V2_YAML = {
    "project": {
        "name": "Proyecto v2",
        "slug": "proyecto-v2",
        "mode": "standard",
        "language": "typescript",
    },
    "rules": {
        "conventional_commits": True,
        "forbidden_in_production": ["console.log"],
        "forbidden_patterns": [],
        "required_review_before_ship": False,
        "require_spec_before_implementation": False,
    },
    "mcp": {"servers": []},
    "github": {"project": {"number": None, "owner": None, "repo": None}},
}


# ---------------------------------------------------------------------------
# v1 → v2 migration
# ---------------------------------------------------------------------------

def test_migrate_v1_adds_version_sections(tmp_path):
    """v1 project.yaml → resultado contiene secciones v2 (rules, mcp, github)."""
    path = tmp_path / "project.yaml"
    path.write_text(yaml.dump(V1_YAML))

    result = run_migrate(tmp_path)
    assert result.returncode == 0

    content = path.read_text()
    # El migrador agrega estas secciones al archivo
    assert "rules:" in content
    assert "mcp:" in content
    assert "github:" in content


def test_migrate_v1_adds_schema_version_comment(tmp_path):
    """v1 project.yaml migrado → archivo contiene comentario de schema_version: \"2\"."""
    path = tmp_path / "project.yaml"
    path.write_text(yaml.dump(V1_YAML))

    run_migrate(tmp_path)
    content = path.read_text()
    assert 'schema_version: "2"' in content


def test_migrate_v1_preserves_original_content(tmp_path):
    """v1 project.yaml → el proyecto original se preserva después de migrar."""
    path = tmp_path / "project.yaml"
    path.write_text(yaml.dump(V1_YAML))

    run_migrate(tmp_path)
    content = path.read_text()
    assert "Proyecto v1" in content
    assert "hono" in content


# ---------------------------------------------------------------------------
# Idempotent: v2 → sin cambios
# ---------------------------------------------------------------------------

def test_migrate_v2_is_idempotent(tmp_path):
    """project.yaml ya en v2 → no se modifica, exit 0."""
    path = tmp_path / "project.yaml"
    original = yaml.dump(V2_YAML)
    path.write_text(original)

    result = run_migrate(tmp_path)
    assert result.returncode == 0

    # El archivo no debe cambiar (v2 detectado por project.mode/rules/mcp/github)
    assert "ya está en v2" in result.stdout or "No se requiere" in result.stdout


def test_migrate_v2_file_not_modified(tmp_path):
    """project.yaml en v2 → contenido del archivo no cambia."""
    path = tmp_path / "project.yaml"
    original = yaml.dump(V2_YAML)
    path.write_text(original)

    run_migrate(tmp_path)
    assert path.read_text() == original


# ---------------------------------------------------------------------------
# --dry-run
# ---------------------------------------------------------------------------

def test_dry_run_does_not_write_file(tmp_path):
    """--dry-run → muestra diff pero NO modifica el archivo."""
    path = tmp_path / "project.yaml"
    original = yaml.dump(V1_YAML)
    path.write_text(original)

    result = run_migrate(tmp_path, ["--dry-run"])
    assert result.returncode == 0
    # El archivo no debe haber cambiado
    assert path.read_text() == original


def test_dry_run_prints_diff(tmp_path):
    """--dry-run → stdout contiene diff o indicación de cambios."""
    path = tmp_path / "project.yaml"
    path.write_text(yaml.dump(V1_YAML))

    result = run_migrate(tmp_path, ["--dry-run"])
    assert result.returncode == 0
    # El dry-run muestra "DRY RUN" y el diff
    assert "DRY RUN" in result.stdout or "dry-run" in result.stdout.lower() or "---" in result.stdout


# ---------------------------------------------------------------------------
# --backup
# ---------------------------------------------------------------------------

def test_backup_creates_bak_file(tmp_path):
    """--backup → crea project.yaml.bak antes de escribir."""
    path = tmp_path / "project.yaml"
    original = yaml.dump(V1_YAML)
    path.write_text(original)

    result = run_migrate(tmp_path, ["--backup"])
    assert result.returncode == 0

    bak_path = tmp_path / "project.yaml.bak"
    assert bak_path.exists(), "Debe existir project.yaml.bak"


def test_backup_preserves_original_content(tmp_path):
    """--backup → el .bak tiene el contenido original."""
    path = tmp_path / "project.yaml"
    original = yaml.dump(V1_YAML)
    path.write_text(original)

    run_migrate(tmp_path, ["--backup"])

    bak_path = tmp_path / "project.yaml.bak"
    assert bak_path.read_text() == original


# ---------------------------------------------------------------------------
# Missing project.yaml
# ---------------------------------------------------------------------------

def test_missing_project_yaml_exits_1(tmp_path):
    """Sin project.yaml → exit 1 con mensaje claro."""
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()

    result = run_migrate(empty_dir)
    assert result.returncode == 1
    combined = result.stdout + result.stderr
    assert "project.yaml" in combined.lower() or "ERROR" in combined
