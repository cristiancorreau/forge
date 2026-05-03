"""
Tests para forge-teardown.py.
Verifica dry-run, eliminación selectiva y que no toca archivos fuera del scope.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from conftest import make_project_yaml

FORGE_ROOT = Path(__file__).parent.parent
SCRIPT = FORGE_ROOT / "scripts" / "forge-teardown.py"
PYTHON = sys.executable


def run_teardown(project_root: Path, confirm: bool = False) -> subprocess.CompletedProcess:
    args = [PYTHON, str(SCRIPT)]
    if confirm:
        args.append("--confirm")
    return subprocess.run(args, cwd=str(project_root), capture_output=True, text=True)


def setup_project_with_agents(tmp_path: Path) -> Path:
    """Crea proyecto con agentes instalados por forge."""
    make_project_yaml(tmp_path, {
        "agents": {
            "active": ["orchestrator", "backend-engineer"],
            "compliance": ["compliance-reviewer"],
            "specialized": [],
            "profiles": [],
        }
    })
    agents_dir = tmp_path / ".claude" / "agents"
    agents_dir.mkdir(parents=True)
    # Simular agentes instalados por forge (copiar desde core)
    for name in ["orchestrator", "backend-engineer", "compliance-reviewer"]:
        src = FORGE_ROOT / "core" / "agents" / f"{name}.md"
        if src.exists():
            (agents_dir / f"{name}.md").write_text(src.read_text())
    return tmp_path


# ── Dry-run (comportamiento por defecto) ──────────────────────────────────────

def test_script_existe():
    assert SCRIPT.exists()


def test_dryrun_no_elimina_archivos(tmp_path):
    project = setup_project_with_agents(tmp_path)
    agents_dir = project / ".claude" / "agents"
    before = set(agents_dir.glob("*.md"))

    run_teardown(project, confirm=False)

    after = set(agents_dir.glob("*.md"))
    assert before == after, "Dry-run no debe eliminar ningún archivo"


def test_dryrun_retorna_exit_0(tmp_path):
    project = setup_project_with_agents(tmp_path)
    result = run_teardown(project, confirm=False)
    assert result.returncode == 0


def test_dryrun_output_menciona_dry_run(tmp_path):
    project = setup_project_with_agents(tmp_path)
    result = run_teardown(project, confirm=False)
    assert "DRY" in result.stdout.upper() or "dry" in result.stdout.lower()


# ── Con --confirm ─────────────────────────────────────────────────────────────

def test_confirm_elimina_agentes_de_forge(tmp_path):
    project = setup_project_with_agents(tmp_path)
    agents_dir = project / ".claude" / "agents"
    assert (agents_dir / "orchestrator.md").exists()

    run_teardown(project, confirm=True)

    assert not (agents_dir / "orchestrator.md").exists()
    assert not (agents_dir / "backend-engineer.md").exists()


def test_confirm_elimina_agents_md(tmp_path):
    project = setup_project_with_agents(tmp_path)
    agents_md = project / "AGENTS.md"
    agents_md.write_text("# AGENTS generado por forge")

    run_teardown(project, confirm=True)

    assert not agents_md.exists()


def test_confirm_no_elimina_claude_md(tmp_path):
    project = setup_project_with_agents(tmp_path)
    claude_md = project / "CLAUDE.md"
    claude_md.write_text("# CLAUDE.md customizado")

    run_teardown(project, confirm=True)

    assert claude_md.exists(), "CLAUDE.md no debe ser eliminado por teardown"


def test_confirm_no_elimina_project_yaml(tmp_path):
    project = setup_project_with_agents(tmp_path)
    run_teardown(project, confirm=True)
    assert (project / "project.yaml").exists()


def test_confirm_no_elimina_agentes_tier3(tmp_path):
    """Agentes especializados del proyecto (Tier 3) no deben ser tocados."""
    project = setup_project_with_agents(tmp_path)
    agents_dir = project / ".claude" / "agents"
    # Agente Tier 3: existe en el proyecto pero NO está en forge core
    tier3 = agents_dir / "mi-agente-dominio.md"
    tier3.write_text("---\nname: mi-agente-dominio\ntier: 3\n---\n# Custom")

    run_teardown(project, confirm=True)

    assert tier3.exists(), "Agentes Tier 3 no deben ser eliminados por teardown"


def test_confirm_elimina_wiki_commands(tmp_path):
    """Los slash commands de wiki instalados por forge deben eliminarse."""
    project = setup_project_with_agents(tmp_path)
    commands_dir = project / ".claude" / "commands"
    commands_dir.mkdir(parents=True)
    (commands_dir / "wiki-ingest.md").write_text("# wiki-ingest")
    (commands_dir / "wiki-query.md").write_text("# wiki-query")

    run_teardown(project, confirm=True)

    assert not (commands_dir / "wiki-ingest.md").exists()
    assert not (commands_dir / "wiki-query.md").exists()


def test_retorna_exit_0_sin_project_yaml(tmp_path):
    """Sin project.yaml, el script debe fallar con mensaje claro."""
    result = run_teardown(tmp_path, confirm=False)
    assert result.returncode != 0
    assert "ERROR" in result.stderr or "error" in result.stderr.lower()
