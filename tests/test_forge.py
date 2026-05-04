"""
Tests para forge.py — ISS-004 (modo no-interactivo) e ISS-011 (terminal estrecha).
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

FORGE_ROOT = Path(__file__).parent.parent
FORGE_PY = FORGE_ROOT / "forge.py"


def _import_forge():
    """Importa forge.py como módulo limpio."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("forge_main", FORGE_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# ISS-004 — Modo no-interactivo
# ---------------------------------------------------------------------------

def test_main_no_tty_sin_batch_imprime_tip(capsys):
    """Sin TTY y sin --batch → stderr contiene 'Tip'."""
    forge = _import_forge()
    with patch.object(forge, "IS_TTY", False):
        with patch.object(sys, "argv", ["forge.py"]):
            with pytest.raises(SystemExit) as exc_info:
                forge.main()
    assert exc_info.value.code == 1
    captured = capsys.readouterr()
    assert "Tip" in captured.err


def test_main_batch_muestra_scripts(capsys):
    """Con --batch → stdout contiene 'forge-init' y 'forge-audit'."""
    forge = _import_forge()
    with patch.object(sys, "argv", ["forge.py", "--batch"]):
        forge.main()
    captured = capsys.readouterr()
    assert "forge-init" in captured.out
    assert "forge-audit" in captured.out


def test_main_batch_no_llama_sys_exit(capsys):
    """Con --batch no debe llamar sys.exit (retorna normalmente)."""
    forge = _import_forge()
    with patch.object(sys, "argv", ["forge.py", "--batch"]):
        forge.main()  # no debe lanzar SystemExit


# ---------------------------------------------------------------------------
# ISS-011 — Terminal demasiado estrecha
# ---------------------------------------------------------------------------

def test_main_terminal_estrecha_aborta(capsys):
    """Terminal de 40 cols con TTY → sys.exit(1)."""
    forge = _import_forge()
    with patch.object(forge, "IS_TTY", True):
        with patch.object(sys, "argv", ["forge.py"]):
            with patch("os.get_terminal_size", return_value=type("ts", (), {"columns": 40, "lines": 24})()):
                with pytest.raises(SystemExit) as exc_info:
                    forge.main()
    assert exc_info.value.code == 1
    captured = capsys.readouterr()
    assert "estrecha" in captured.err
