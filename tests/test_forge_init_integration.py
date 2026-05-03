"""
Tests de integración para forge-init.py.
Verifica el flujo completo: project.yaml → .claude/agents/ + AGENTS.md.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Optional
from conftest import make_project_yaml

FORGE_ROOT = Path(__file__).parent.parent
SCRIPT = FORGE_ROOT / "scripts" / "forge-init.py"
PYTHON = sys.executable


def run_init(project_root: Path, args: Optional[list] = None) -> subprocess.CompletedProcess:
    base_args = [PYTHON, str(SCRIPT), "--tool", "claude-code"]
    return subprocess.run(
        base_args + (args or []),
        cwd=str(project_root),
        capture_output=True,
        text=True,
    )


# ── Instalación básica ────────────────────────────────────────────────────────

def test_init_crea_directorio_agents(tmp_path):
    make_project_yaml(tmp_path)
    run_init(tmp_path)
    assert (tmp_path / ".claude" / "agents").exists()


def test_init_instala_agentes_declarados(tmp_path):
    make_project_yaml(tmp_path, {
        "agents": {"active": ["orchestrator", "backend-engineer"], "compliance": [], "specialized": [], "profiles": []},
    })
    run_init(tmp_path)
    agents_dir = tmp_path / ".claude" / "agents"
    assert (agents_dir / "orchestrator.md").exists()
    assert (agents_dir / "backend-engineer.md").exists()


def test_init_genera_agents_md(tmp_path):
    make_project_yaml(tmp_path)
    run_init(tmp_path)
    assert (tmp_path / "AGENTS.md").exists()


def test_agents_md_contiene_agentes_activos(tmp_path):
    make_project_yaml(tmp_path, {
        "agents": {"active": ["orchestrator", "test-engineer"], "compliance": [], "specialized": [], "profiles": []},
    })
    run_init(tmp_path)
    content = (tmp_path / "AGENTS.md").read_text()
    assert "orchestrator" in content
    assert "test-engineer" in content


def test_init_retorna_exit_0(tmp_path):
    make_project_yaml(tmp_path)
    result = run_init(tmp_path)
    assert result.returncode == 0, result.stderr


def test_init_falla_sin_project_yaml(tmp_path):
    result = run_init(tmp_path)
    assert result.returncode != 0


# ── Comportamiento --force ────────────────────────────────────────────────────

def test_sin_force_no_sobreescribe(tmp_path):
    make_project_yaml(tmp_path, {
        "agents": {"active": ["orchestrator"], "compliance": [], "specialized": [], "profiles": []},
    })
    run_init(tmp_path)
    agent_path = tmp_path / ".claude" / "agents" / "orchestrator.md"
    agent_path.write_text("# Custom modificado")

    run_init(tmp_path)  # segunda ejecución sin --force
    assert agent_path.read_text() == "# Custom modificado"


def test_con_force_sobreescribe(tmp_path):
    make_project_yaml(tmp_path, {
        "agents": {"active": ["orchestrator"], "compliance": [], "specialized": [], "profiles": []},
    })
    run_init(tmp_path)
    agent_path = tmp_path / ".claude" / "agents" / "orchestrator.md"
    agent_path.write_text("# Custom modificado")

    run_init(tmp_path, ["--force"])
    assert agent_path.read_text() != "# Custom modificado"
    assert "orchestrator" in agent_path.read_text().lower()


# ── Flag --only ───────────────────────────────────────────────────────────────

def test_only_instala_un_solo_agente(tmp_path):
    make_project_yaml(tmp_path, {
        "agents": {"active": ["orchestrator", "backend-engineer", "frontend-engineer"], "compliance": [], "specialized": [], "profiles": []},
    })
    run_init(tmp_path, ["--force", "--only=backend-engineer"])
    agents_dir = tmp_path / ".claude" / "agents"
    # Solo backend-engineer debe estar instalado
    installed = [f.stem for f in agents_dir.glob("*.md")]
    assert "backend-engineer" in installed
    assert "orchestrator" not in installed
    assert "frontend-engineer" not in installed


def test_only_con_signo_igual(tmp_path):
    make_project_yaml(tmp_path, {
        "agents": {"active": ["orchestrator", "test-engineer"], "compliance": [], "specialized": [], "profiles": []},
    })
    run_init(tmp_path, ["--force", "--only=test-engineer"])
    agents_dir = tmp_path / ".claude" / "agents"
    assert (agents_dir / "test-engineer.md").exists()
    assert not (agents_dir / "orchestrator.md").exists()


# ── Prioridad Tier 2 > Tier 1 ─────────────────────────────────────────────────

def test_profile_reemplaza_agente_core_mismo_nombre(tmp_path):
    """El agente api-engineer del profile hono-drizzle debe instalarse en lugar del core."""
    make_project_yaml(tmp_path, {
        "agents": {
            "active": ["orchestrator"],
            "compliance": [],
            "specialized": [],
            "profiles": ["hono-drizzle"],
        },
    })
    run_init(tmp_path)
    agent_path = tmp_path / ".claude" / "agents" / "api-engineer.md"
    assert agent_path.exists()
    content = agent_path.read_text()
    # Debe ser la versión del profile, que menciona Hono
    assert "Hono" in content or "hono" in content or "profile: hono-drizzle" in content


def test_core_no_sobreescribe_profile(tmp_path):
    """Si el profile instaló api-engineer, el core no debe sobreescribirlo."""
    make_project_yaml(tmp_path, {
        "agents": {
            "active": ["orchestrator", "api-engineer"],  # también en active
            "compliance": [],
            "specialized": [],
            "profiles": ["hono-drizzle"],
        },
    })
    run_init(tmp_path)
    agent_path = tmp_path / ".claude" / "agents" / "api-engineer.md"
    assert agent_path.exists()
    content = agent_path.read_text()
    assert "hono-drizzle" in content.lower() or "Hono" in content


# ── Compliance automático ─────────────────────────────────────────────────────

def test_compliance_reviewer_auto_con_frameworks(tmp_path):
    make_project_yaml(tmp_path, {
        "agents": {"active": ["orchestrator"], "compliance": [], "specialized": [], "profiles": []},
        "compliance": {"frameworks": ["gdpr"]},
    })
    run_init(tmp_path)
    agents_dir = tmp_path / ".claude" / "agents"
    assert (agents_dir / "compliance-reviewer.md").exists()


def test_compliance_reviewer_no_duplicado(tmp_path):
    """Si compliance-reviewer ya está en compliance[], no debe duplicarse."""
    make_project_yaml(tmp_path, {
        "agents": {
            "active": ["orchestrator"],
            "compliance": ["compliance-reviewer"],
            "specialized": [],
            "profiles": [],
        },
        "compliance": {"frameworks": ["gdpr"]},
    })
    run_init(tmp_path)
    content = (tmp_path / "AGENTS.md").read_text()
    # No debe aparecer duplicado
    count = content.count("compliance-reviewer")
    assert count <= 3, f"compliance-reviewer aparece {count} veces, posible duplicado"


# ── Wiki skills → slash commands ──────────────────────────────────────────────

def test_wiki_commands_se_instalan(tmp_path):
    make_project_yaml(tmp_path, {
        "skills": {"active": ["wiki-ingest", "wiki-query", "wiki-lint"], "integrations": []},
    })
    run_init(tmp_path)
    commands_dir = tmp_path / ".claude" / "commands"
    assert (commands_dir / "wiki-ingest.md").exists()
    assert (commands_dir / "wiki-query.md").exists()
    assert (commands_dir / "wiki-lint.md").exists()


def test_wiki_commands_no_se_instalan_sin_skills(tmp_path):
    make_project_yaml(tmp_path)  # sin skills de wiki
    run_init(tmp_path)
    commands_dir = tmp_path / ".claude" / "commands"
    assert not (commands_dir / "wiki-ingest.md").exists()
