"""
Tests de compatibilidad de plataforma.
Verifica que forge.py y forge-wizard.py fallen con mensajes orientativos
cuando termios/tty no están disponibles (ej. Windows).
"""
from __future__ import annotations

import os
import sys
import subprocess
from pathlib import Path

import pytest

FORGE_ROOT = Path(__file__).parent.parent
PYTHON = sys.executable


def run_with_fake_termios(script: Path, tmp_path: Path) -> subprocess.CompletedProcess:
    """
    Ejecuta script con un termios.py falso en PYTHONPATH que fuerza ImportError.
    Simula el comportamiento en Windows donde termios no existe.
    """
    (tmp_path / "termios.py").write_text("raise ImportError(\"No module named 'termios'\")\n")
    env = {**os.environ, "PYTHONPATH": str(tmp_path)}
    return subprocess.run(
        [PYTHON, str(script)],
        capture_output=True,
        text=True,
        env=env,
    )


# ── forge.py ──────────────────────────────────────────────────────────────────

class TestForgePyWindowsCompat:
    SCRIPT = FORGE_ROOT / "forge.py"

    def test_falla_sin_termios(self, tmp_path):
        result = run_with_fake_termios(self.SCRIPT, tmp_path)
        assert result.returncode == 1

    def test_menciona_windows(self, tmp_path):
        result = run_with_fake_termios(self.SCRIPT, tmp_path)
        assert "Windows" in result.stderr

    def test_menciona_wsl(self, tmp_path):
        result = run_with_fake_termios(self.SCRIPT, tmp_path)
        assert "WSL" in result.stderr

    def test_menciona_unix_o_macos(self, tmp_path):
        result = run_with_fake_termios(self.SCRIPT, tmp_path)
        assert "Unix" in result.stderr or "macOS" in result.stderr or "Linux" in result.stderr

    def test_stderr_no_traceback(self, tmp_path):
        """El error debe ser un mensaje limpio, no un traceback de Python."""
        result = run_with_fake_termios(self.SCRIPT, tmp_path)
        assert "Traceback" not in result.stderr


# ── forge-wizard.py ───────────────────────────────────────────────────────────

class TestWizardWindowsCompat:
    SCRIPT = FORGE_ROOT / "scripts" / "forge-wizard.py"

    def test_falla_sin_termios(self, tmp_path):
        result = run_with_fake_termios(self.SCRIPT, tmp_path)
        assert result.returncode == 1

    def test_menciona_windows(self, tmp_path):
        result = run_with_fake_termios(self.SCRIPT, tmp_path)
        assert "Windows" in result.stderr

    def test_menciona_wsl(self, tmp_path):
        result = run_with_fake_termios(self.SCRIPT, tmp_path)
        assert "WSL" in result.stderr

    def test_stderr_no_traceback(self, tmp_path):
        result = run_with_fake_termios(self.SCRIPT, tmp_path)
        assert "Traceback" not in result.stderr
