"""
Tests para install_agent() en forge-init.py.
Verifica todos los status posibles: OK, UPDATE, KEEP, MISS, SKIP.
"""
from __future__ import annotations

import pytest
from pathlib import Path
from conftest import load_module

FORGE_ROOT = Path(__file__).parent.parent
SCRIPT = FORGE_ROOT / "scripts" / "forge-init.py"


def _mod(argv):
    return load_module(SCRIPT, f"forge_init_{hash(str(argv))}", argv=argv)


# ── Casos básicos ─────────────────────────────────────────────────────────────

def test_miss_cuando_src_no_existe(tmp_path):
    mod = _mod(["forge-init.py"])
    src = tmp_path / "no-existe.md"
    dst = tmp_path / "dst.md"
    assert mod.install_agent(src, dst, "no-existe", "core") == "MISS"
    assert not dst.exists()


def test_ok_instalacion_nueva(tmp_path):
    mod = _mod(["forge-init.py"])
    src = tmp_path / "src.md"
    src.write_text("# Agent")
    dst = tmp_path / "dst.md"
    assert mod.install_agent(src, dst, "mi-agente", "core") == "OK"
    assert dst.exists()
    assert dst.read_text() == "# Agent"


def test_keep_sin_force_cuando_dst_existe(tmp_path):
    mod = _mod(["forge-init.py"])  # sin --force
    src = tmp_path / "src.md"
    src.write_text("# Nuevo")
    dst = tmp_path / "dst.md"
    dst.write_text("# Original")
    assert mod.install_agent(src, dst, "mi-agente", "core") == "KEEP"
    assert dst.read_text() == "# Original"  # no fue sobreescrito


def test_update_con_force_cuando_dst_existe(tmp_path):
    mod = _mod(["forge-init.py", "--force"])
    src = tmp_path / "src.md"
    src.write_text("# Actualizado")
    dst = tmp_path / "dst.md"
    dst.write_text("# Original")
    assert mod.install_agent(src, dst, "mi-agente", "core") == "UPDATE"
    assert dst.read_text() == "# Actualizado"


def test_ok_no_es_update_en_instalacion_nueva(tmp_path):
    """Bug original: siempre retornaba UPDATE. Ahora OK para instalaciones nuevas."""
    mod = _mod(["forge-init.py", "--force"])
    src = tmp_path / "src.md"
    src.write_text("# Nuevo")
    dst = tmp_path / "dst.md"
    assert not dst.exists()
    status = mod.install_agent(src, dst, "mi-agente", "core")
    assert status == "OK", f"Instalación nueva debe retornar OK, no {status!r}"


# ── Flag --only ───────────────────────────────────────────────────────────────

def test_skip_cuando_only_filtra_agente(tmp_path):
    mod = _mod(["forge-init.py", "--force", "--only=backend-engineer"])
    src = tmp_path / "src.md"
    src.write_text("# Agent")
    dst = tmp_path / "dst.md"
    status = mod.install_agent(src, dst, "orchestrator", "core")
    assert status == "SKIP"
    assert not dst.exists()


def test_only_no_bloquea_agente_correcto(tmp_path):
    mod = _mod(["forge-init.py", "--force", "--only=backend-engineer"])
    src = tmp_path / "src.md"
    src.write_text("# Backend Engineer")
    dst = tmp_path / "dst.md"
    status = mod.install_agent(src, dst, "backend-engineer", "core")
    assert status in ("OK", "UPDATE")
    assert dst.exists()


def test_only_con_signo_igual(tmp_path):
    """--only=nombre funciona igual que --only nombre."""
    mod = _mod(["forge-init.py", "--force", "--only=test-engineer"])
    assert mod.ONLY_AGENT == "test-engineer"


def test_only_con_espacio(tmp_path):
    """--only nombre (separado por espacio) también funciona."""
    mod = _mod(["forge-init.py", "--force", "--only", "test-engineer"])
    assert mod.ONLY_AGENT == "test-engineer"


# ── Flags globales ────────────────────────────────────────────────────────────

def test_force_false_por_defecto():
    mod = _mod(["forge-init.py"])
    assert mod.FORCE is False


def test_force_true_con_flag():
    mod = _mod(["forge-init.py", "--force"])
    assert mod.FORCE is True


def test_only_agent_none_por_defecto():
    mod = _mod(["forge-init.py"])
    assert mod.ONLY_AGENT is None
