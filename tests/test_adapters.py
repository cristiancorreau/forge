"""
Tests para los adapters de OpenCode y Kiro.
Verifica que los archivos generados contengan el contenido correcto.
"""
from __future__ import annotations

import pytest
import subprocess
import sys
from pathlib import Path
from typing import Optional
from conftest import make_project_yaml

FORGE_ROOT = Path(__file__).parent.parent
PYTHON = sys.executable


def run_adapter(script: Path, project_root: Path, extra_args: Optional[list] = None) -> subprocess.CompletedProcess:
    args = [PYTHON, str(script)] + (extra_args or [])
    return subprocess.run(args, cwd=str(project_root), capture_output=True, text=True)


# ── OpenCode adapter ──────────────────────────────────────────────────────────

class TestOpenCodeAdapter:
    SCRIPT = FORGE_ROOT / "adapters" / "opencode" / "generate-agents-md.py"

    def test_script_existe(self):
        assert self.SCRIPT.exists()

    def test_genera_agents_md(self, tmp_path):
        make_project_yaml(tmp_path)
        result = run_adapter(self.SCRIPT, tmp_path)
        assert result.returncode == 0, result.stderr
        assert (tmp_path / "AGENTS.md").exists()

    def test_agents_md_contiene_roster(self, tmp_path):
        make_project_yaml(tmp_path, {
            "agents": {
                "active": ["orchestrator", "backend-engineer"],
                "compliance": [],
                "specialized": [],
                "profiles": [],
            }
        })
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "orchestrator" in content
        assert "backend-engineer" in content

    def test_agents_md_incluye_stack(self, tmp_path):
        make_project_yaml(tmp_path, {"stack": {"backend": "fastapi", "frontend": "nextjs", "database": "postgresql", "testing": ["pytest"]}})
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "fastapi" in content
        assert "nextjs" in content

    def test_agents_md_compliance_section_con_frameworks(self, tmp_path):
        make_project_yaml(tmp_path, {"compliance": {"frameworks": ["gdpr", "ley-21719"]}})
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "GDPR" in content
        assert "LEY-21719" in content

    def test_agents_md_sin_compliance_cuando_no_hay_frameworks(self, tmp_path):
        make_project_yaml(tmp_path)
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "Compliance activo" not in content

    def test_compliance_reviewer_auto_con_frameworks(self, tmp_path):
        make_project_yaml(tmp_path, {
            "compliance": {"frameworks": ["gdpr"]},
            "agents": {"active": ["orchestrator"], "compliance": [], "specialized": [], "profiles": []},
        })
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "compliance-reviewer" in content

    def test_falla_sin_project_yaml(self, tmp_path):
        result = run_adapter(self.SCRIPT, tmp_path)
        assert result.returncode != 0


# ── Kiro adapter ──────────────────────────────────────────────────────────────

class TestKiroAdapter:
    SCRIPT = FORGE_ROOT / "adapters" / "kiro" / "generate-steering.py"

    def test_script_existe(self):
        assert self.SCRIPT.exists()

    def test_genera_steering_files(self, tmp_path):
        make_project_yaml(tmp_path)
        result = run_adapter(self.SCRIPT, tmp_path)
        assert result.returncode == 0, result.stderr
        steering = tmp_path / ".kiro" / "steering"
        assert (steering / "product.md").exists()
        assert (steering / "structure.md").exists()
        assert (steering / "agents.md").exists()

    def test_product_md_contiene_nombre_proyecto(self, tmp_path):
        make_project_yaml(tmp_path, {"project": {"name": "Mi App Especial", "slug": "mia", "description": "d", "language": "python", "status": "active"}})
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / ".kiro" / "steering" / "product.md").read_text()
        assert "Mi App Especial" in content

    def test_product_md_contiene_stack(self, tmp_path):
        make_project_yaml(tmp_path, {"stack": {"backend": "rails", "frontend": None, "database": "postgresql", "testing": ["rspec"]}})
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / ".kiro" / "steering" / "product.md").read_text()
        assert "rails" in content
        assert "postgresql" in content

    def test_structure_md_menciona_sdd(self, tmp_path):
        make_project_yaml(tmp_path)
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / ".kiro" / "steering" / "structure.md").read_text()
        assert "spec" in content.lower() or "SDD" in content or "Spec" in content

    def test_agents_md_lista_agentes(self, tmp_path):
        make_project_yaml(tmp_path, {
            "agents": {"active": ["orchestrator", "frontend-engineer"], "compliance": [], "specialized": [], "profiles": []},
        })
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / ".kiro" / "steering" / "agents.md").read_text()
        assert "orchestrator" in content
        assert "frontend-engineer" in content

    def test_genera_compliance_md_con_frameworks(self, tmp_path):
        make_project_yaml(tmp_path, {"compliance": {"frameworks": ["gdpr"]}})
        run_adapter(self.SCRIPT, tmp_path)
        compliance_path = tmp_path / ".kiro" / "steering" / "compliance.md"
        assert compliance_path.exists()
        assert "GDPR" in compliance_path.read_text()

    def test_no_genera_compliance_md_sin_frameworks(self, tmp_path):
        make_project_yaml(tmp_path)
        run_adapter(self.SCRIPT, tmp_path)
        compliance_path = tmp_path / ".kiro" / "steering" / "compliance.md"
        assert not compliance_path.exists()

    def test_keep_no_sobreescribe_por_defecto(self, tmp_path):
        make_project_yaml(tmp_path)
        run_adapter(self.SCRIPT, tmp_path)
        product_path = tmp_path / ".kiro" / "steering" / "product.md"
        product_path.write_text("# Contenido custom")
        run_adapter(self.SCRIPT, tmp_path)  # segunda ejecución sin --force
        assert product_path.read_text() == "# Contenido custom"

    def test_force_sobreescribe(self, tmp_path):
        make_project_yaml(tmp_path, {"project": {"name": "Nuevo Nombre", "slug": "nn", "description": "d", "language": "go", "status": "active"}})
        run_adapter(self.SCRIPT, tmp_path)
        product_path = tmp_path / ".kiro" / "steering" / "product.md"
        product_path.write_text("# Contenido custom")
        run_adapter(self.SCRIPT, tmp_path, ["--force"])
        assert "Nuevo Nombre" in product_path.read_text()

    def test_falla_sin_project_yaml(self, tmp_path):
        result = run_adapter(self.SCRIPT, tmp_path)
        assert result.returncode != 0


# ── Codex adapter ─────────────────────────────────────────────────────────────

class TestCodexAdapter:
    SCRIPT = FORGE_ROOT / "adapters" / "codex" / "generate-codex-config.py"

    def test_script_existe(self):
        assert self.SCRIPT.exists()

    def test_genera_agents_md(self, tmp_path):
        make_project_yaml(tmp_path)
        result = run_adapter(self.SCRIPT, tmp_path)
        assert result.returncode == 0, result.stderr
        assert (tmp_path / "AGENTS.md").exists()

    def test_no_genera_codex_md(self, tmp_path):
        make_project_yaml(tmp_path)
        run_adapter(self.SCRIPT, tmp_path)
        assert not (tmp_path / "codex.md").exists()

    def test_agents_md_contiene_roster(self, tmp_path):
        make_project_yaml(tmp_path, {
            "agents": {
                "active": ["orchestrator", "backend-engineer"],
                "compliance": [],
                "specialized": [],
                "profiles": [],
            }
        })
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "orchestrator" in content
        assert "backend-engineer" in content

    def test_agents_md_incluye_sdd_workflow(self, tmp_path):
        make_project_yaml(tmp_path)
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "Spec-Driven" in content or "spec" in content.lower()

    def test_agents_md_incluye_security_rules(self, tmp_path):
        make_project_yaml(tmp_path)
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "seguridad" in content.lower() or "security" in content.lower()
        assert "secrets" in content.lower() or "tokens" in content.lower()

    def test_agents_md_incluye_autonomy_limits(self, tmp_path):
        make_project_yaml(tmp_path)
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "autonomía" in content.lower() or "autonomy" in content.lower()

    def test_agents_md_incluye_stack(self, tmp_path):
        make_project_yaml(tmp_path, {"stack": {"backend": "fastapi", "frontend": "nextjs", "database": "postgresql", "testing": ["pytest"]}})
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "fastapi" in content
        assert "nextjs" in content

    def test_compliance_reviewer_auto_con_frameworks(self, tmp_path):
        make_project_yaml(tmp_path, {
            "compliance": {"frameworks": ["gdpr"]},
            "agents": {"active": ["orchestrator"], "compliance": [], "specialized": [], "profiles": []},
        })
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "compliance-reviewer" in content

    def test_agents_md_compliance_section_con_frameworks(self, tmp_path):
        make_project_yaml(tmp_path, {"compliance": {"frameworks": ["gdpr", "ley-21719"]}})
        run_adapter(self.SCRIPT, tmp_path)
        content = (tmp_path / "AGENTS.md").read_text()
        assert "GDPR" in content
        assert "LEY-21719" in content

    def test_distinto_de_opencode_agents_md(self, tmp_path):
        """El AGENTS.md de Codex debe ser diferente al de OpenCode."""
        make_project_yaml(tmp_path)
        opencode_script = FORGE_ROOT / "adapters" / "opencode" / "generate-agents-md.py"
        run_adapter(opencode_script, tmp_path)
        opencode_content = (tmp_path / "AGENTS.md").read_text()
        run_adapter(self.SCRIPT, tmp_path)
        codex_content = (tmp_path / "AGENTS.md").read_text()
        assert codex_content != opencode_content

    def test_falla_sin_project_yaml(self, tmp_path):
        result = run_adapter(self.SCRIPT, tmp_path)
        assert result.returncode != 0
