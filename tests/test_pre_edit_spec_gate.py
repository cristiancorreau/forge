"""
Tests para el spec gate (issue #28) de core/hooks/pre-edit-check.py.

El gate exige una spec APPROVED en docs/specs/ al editar código en una rama
feature. Es backward-compatible: advierte por defecto y solo bloquea (exit 2)
con mode=enterprise + rules.require_spec_before_implementation.

API de Claude Code hooks:
  stdin: {"tool_name": "Edit", "tool_input": {"file_path": "...", "new_string": "..."}}

Exit codes:
  0 — permitido (o solo advertencia)
  2 — BLOQUEADO
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

FORGE_ROOT = Path(__file__).parent.parent
SCRIPT = FORGE_ROOT / "core" / "hooks" / "pre-edit-check.py"
PYTHON = sys.executable

ENTERPRISE_YAML = (
    'project:\n  mode: "enterprise"\n'
    "rules:\n  require_spec_before_implementation: true\n"
)
STANDARD_YAML = 'project:\n  mode: "standard"\n'

APPROVED_SPEC = "# SPEC-001 Demo\n\n> Estado: APPROVED\n\n## Decisión\nalgo\n"
TEMPLATE_SPEC = "# [ID] Título\n\n> Estado: DRAFT | REVIEW | APPROVED | IMPLEMENTED\n"


def _git(args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


def make_repo(tmp_path: Path, project_yaml: str, spec: str | None = None) -> Path:
    """Crea un repo git temporal en una rama feature."""
    _git(["init", "-q"], tmp_path)
    _git(["config", "user.email", "test@example.com"], tmp_path)
    _git(["config", "user.name", "test"], tmp_path)
    _git(["checkout", "-q", "-b", "feat/demo"], tmp_path)
    (tmp_path / "project.yaml").write_text(project_yaml)
    specs = tmp_path / "docs" / "specs"
    specs.mkdir(parents=True)
    (specs / "_template.md").write_text(TEMPLATE_SPEC)
    if spec:
        (specs / "SPEC-001-demo.md").write_text(spec)
    return tmp_path


def run_hook(cwd: Path, file_path: str = "src/app.py", new_string: str = "x = 1\n"):
    payload = json.dumps(
        {"tool_name": "Edit", "tool_input": {"file_path": file_path, "new_string": new_string}}
    )
    return subprocess.run(
        [PYTHON, str(SCRIPT)],
        input=payload,
        cwd=str(cwd),
        capture_output=True,
        text=True,
    )


def test_warns_without_spec_in_default_mode(tmp_path):
    repo = make_repo(tmp_path, STANDARD_YAML)
    res = run_hook(repo)
    assert res.returncode == 0, f"no debe bloquear por defecto: {res.stdout}"
    assert "spec gate" in res.stdout.lower()


def test_blocks_enterprise_without_spec(tmp_path):
    repo = make_repo(tmp_path, ENTERPRISE_YAML)
    res = run_hook(repo)
    assert res.returncode == 2, f"enterprise + opt-in debe bloquear: {res.stdout}"
    assert "APPROVED" in res.stdout


def test_template_alone_does_not_satisfy_gate(tmp_path):
    repo = make_repo(tmp_path, ENTERPRISE_YAML)  # solo _template.md
    res = run_hook(repo)
    assert res.returncode == 2


def test_allows_with_approved_spec(tmp_path):
    repo = make_repo(tmp_path, ENTERPRISE_YAML, spec=APPROVED_SPEC)
    res = run_hook(repo)
    assert res.returncode == 0, f"con spec APPROVED debe permitir: {res.stdout}"
    assert "spec gate" not in res.stdout.lower()


def test_doc_file_is_exempt(tmp_path):
    repo = make_repo(tmp_path, ENTERPRISE_YAML)
    res = run_hook(repo, file_path="docs/notes.md", new_string="# notes\n")
    assert res.returncode == 0, "docs nunca deben ser bloqueados por el spec gate"
    assert "spec gate" not in res.stdout.lower()
