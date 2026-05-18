"""
Tests para core/hooks/pre-bash-check.py.
Verifica bloqueo de comandos destructivos en contexto de producción.

El hook usa la API de Claude Code hooks:
  stdin: {"tool_name": "Bash", "tool_input": {"command": "..."}}

Exit codes:
  0 — permitido (o solo advertencia)
  2 — BLOQUEADO (patrón peligroso + contexto de producción)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

FORGE_ROOT = Path(__file__).parent.parent
SCRIPT = FORGE_ROOT / "core" / "hooks" / "pre-bash-check.py"
PYTHON = sys.executable


def make_hook_input(command: str) -> str:
    """Construye el JSON de entrada en formato Claude Code hooks API."""
    return json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})


def run_hook(
    command: str,
    production: bool = False,
    extra_env: dict | None = None,
) -> subprocess.CompletedProcess:
    """
    Ejecuta el hook con stdin del formato de Claude Code hooks.
    Si production=True, inyecta PROD_ENV=true para activar contexto de producción.
    """
    env = os.environ.copy()
    # Limpiar variables de producción que podrían estar en el entorno de CI
    for key in list(env.keys()):
        if key.upper().startswith(("PROD_", "PRODUCTION_")) or key.upper() in ("PROD", "PRODUCTION"):
            del env[key]
    if production:
        env["PROD_ENV"] = "true"
    if extra_env:
        env.update(extra_env)

    return subprocess.run(
        [PYTHON, str(SCRIPT)],
        input=make_hook_input(command),
        capture_output=True,
        text=True,
        env=env,
    )


# ---------------------------------------------------------------------------
# Comandos bloqueados (exit 2) — requieren contexto de producción
# ---------------------------------------------------------------------------

def test_force_reset_blocked_in_production():
    """--force-reset en producción → exit 2 (BLOQUEADO)."""
    result = run_hook("prisma migrate --force-reset", production=True)
    assert result.returncode == 2
    assert "BLOQUEADO" in result.stdout


def test_drop_table_blocked_in_production():
    """DROP TABLE en producción → exit 2 (BLOQUEADO)."""
    result = run_hook("psql -c 'DROP TABLE users;'", production=True)
    assert result.returncode == 2
    assert "BLOQUEADO" in result.stdout


def test_delete_without_where_blocked_in_production():
    """DELETE FROM users; (sin WHERE) en producción → exit 2 (BLOQUEADO)."""
    result = run_hook("psql -c 'DELETE FROM users;'", production=True)
    assert result.returncode == 2
    assert "BLOQUEADO" in result.stdout


def test_git_push_force_blocked_in_production():
    """git push --force en producción → exit 2 (BLOQUEADO)."""
    result = run_hook("git push --force", production=True)
    assert result.returncode == 2
    assert "BLOQUEADO" in result.stdout


def test_rm_rf_root_blocked_in_production():
    """rm -rf / en producción → exit 2 (BLOQUEADO)."""
    result = run_hook("rm -rf /", production=True)
    assert result.returncode == 2
    assert "BLOQUEADO" in result.stdout


# ---------------------------------------------------------------------------
# Comandos permitidos (exit 0)
# ---------------------------------------------------------------------------

def test_delete_with_where_allowed():
    """DELETE FROM users WHERE id=1 (con WHERE) → exit 0 (permitido)."""
    result = run_hook("DELETE FROM users WHERE id=1")
    assert result.returncode == 0


def test_git_push_force_with_lease_allowed():
    """git push --force-with-lease → exit 0 (sin contexto de producción)."""
    result = run_hook("git push --force-with-lease")
    assert result.returncode == 0


def test_rm_rf_tmp_allowed_without_production():
    """rm -rf /tmp/test sin producción → exit 0 (advertencia, no bloqueado)."""
    result = run_hook("rm -rf /tmp/test")
    assert result.returncode == 0


def test_rm_rf_root_warns_without_production():
    """rm -rf / sin contexto de producción → exit 0 (solo advertencia, no bloqueado)."""
    result = run_hook("rm -rf /")
    assert result.returncode == 0
    # Debe mostrar advertencia, no bloqueo
    assert "ADVERTENCIA" in result.stdout
    assert "BLOQUEADO" not in result.stdout


# ---------------------------------------------------------------------------
# Herramienta distinta a Bash → siempre permitido
# ---------------------------------------------------------------------------

def test_non_bash_tool_allowed():
    """tool_name != Bash → exit 0 siempre."""
    payload = json.dumps({
        "tool_name": "Read",
        "tool_input": {"command": "DROP TABLE users;"},
    })
    result = subprocess.run(
        [PYTHON, str(SCRIPT)],
        input=payload,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

def test_empty_stdin_allowed():
    """stdin vacío → exit 0 (sin errores)."""
    result = subprocess.run(
        [PYTHON, str(SCRIPT)],
        input="",
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0


def test_empty_command_allowed():
    """Comando vacío → exit 0."""
    result = run_hook("")
    assert result.returncode == 0


def test_safe_command_allowed():
    """Comando seguro (git status) → exit 0."""
    result = run_hook("git status")
    assert result.returncode == 0


def test_safe_command_allowed_in_production():
    """Comando seguro en producción → exit 0."""
    result = run_hook("git status", production=True)
    assert result.returncode == 0
