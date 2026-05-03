"""
Fixtures compartidas para el suite de tests de forge.
"""
from __future__ import annotations

import sys
import importlib
import importlib.util
from pathlib import Path
from typing import Optional

import pytest
import yaml

FORGE_ROOT = Path(__file__).parent.parent


def load_module(script_path: Path, module_name: str, argv: Optional[list] = None):
    """
    Carga un script Python como módulo con sys.argv controlado.
    Necesario porque varios scripts evalúan --force y --only en el import.
    """
    saved = sys.argv[:]
    sys.argv = argv if argv is not None else [str(script_path)]
    try:
        spec = importlib.util.spec_from_file_location(module_name, script_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    finally:
        sys.argv = saved


@pytest.fixture(scope="session")
def forge_root():
    return FORGE_ROOT


@pytest.fixture
def forge_init(forge_root):
    """Carga forge-init.py sin flags especiales."""
    return load_module(
        forge_root / "scripts" / "forge-init.py",
        "forge_init_plain",
        argv=["forge-init.py"],
    )


@pytest.fixture
def forge_init_force(forge_root):
    """Carga forge-init.py con --force."""
    return load_module(
        forge_root / "scripts" / "forge-init.py",
        "forge_init_force",
        argv=["forge-init.py", "--force"],
    )


@pytest.fixture
def generate_claude_md_mod(forge_root):
    return load_module(
        forge_root / "adapters" / "claude-code" / "generate-claude-md.py",
        "generate_claude_md_mod",
        argv=["generate-claude-md.py"],
    )


@pytest.fixture
def forge_audit_mod(forge_root):
    return load_module(
        forge_root / "scripts" / "forge-audit.py",
        "forge_audit_mod",
        argv=["forge-audit.py"],
    )


@pytest.fixture
def forge_teardown_mod(forge_root):
    """Carga forge-teardown.py en modo dry-run (sin --confirm)."""
    return load_module(
        forge_root / "scripts" / "forge-teardown.py",
        "forge_teardown_dryrun",
        argv=["forge-teardown.py"],
    )


def make_project_yaml(tmp_path: Path, overrides: Optional[dict] = None) -> Path:
    """Escribe un project.yaml mínimo en tmp_path y retorna la ruta."""
    base = {
        "project": {
            "name": "Proyecto Test",
            "slug": "proyecto-test",
            "description": "Proyecto para tests",
            "language": "typescript",
            "status": "active",
        },
        "team": {"name": "Team Test"},
        "stack": {
            "backend": "hono",
            "frontend": "nextjs",
            "database": "postgresql",
            "testing": ["vitest"],
        },
        "agents": {
            "active": ["orchestrator", "backend-engineer"],
            "compliance": [],
            "specialized": [],
            "profiles": [],
        },
        "sprint": {"current": 1, "phases": []},
        "skills": {"active": [], "integrations": []},
        "compliance": {"frameworks": [], "pii_handling": False},
        "paths": {"specs": "docs/specs", "progress": "docs/progress.html"},
        "deploy": {"provider": None, "branch": "main"},
        "integrations": {"obsidian": {"vault_path": None, "map": {}}},
    }
    if overrides:
        _deep_merge(base, overrides)
    yaml_path = tmp_path / "project.yaml"
    yaml_path.write_text(yaml.dump(base))
    return yaml_path


def _deep_merge(base: dict, overrides: dict):
    for k, v in overrides.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v


@pytest.fixture
def fake_project(tmp_path):
    """Proyecto mínimo con project.yaml en tmp_path."""
    make_project_yaml(tmp_path)
    return tmp_path


@pytest.fixture
def fake_project_with_compliance(tmp_path):
    """Proyecto con frameworks de compliance activos."""
    make_project_yaml(tmp_path, {"compliance": {"frameworks": ["gdpr", "ley-21719"]}})
    return tmp_path


@pytest.fixture
def fake_project_with_phases(tmp_path):
    """Proyecto con fases de sprint definidas."""
    make_project_yaml(tmp_path, {
        "sprint": {
            "current": 2,
            "phases": [
                {"id": "A", "name": "Core", "status": "completada", "specs": ["auth.md"]},
                {"id": "B", "name": "Features", "status": "en-curso", "specs": ["dashboard.md", "reports.md"]},
            ],
        }
    })
    return tmp_path
