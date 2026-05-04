from __future__ import annotations

import sys
from pathlib import Path

import pytest

# conftest.py expone load_module y forge_root como fixtures


@pytest.fixture(scope="module")
def wizard_mod(forge_root):
    from conftest import load_module
    return load_module(
        forge_root / "scripts" / "forge-wizard.py",
        "forge_wizard",
        argv=["forge-wizard.py", "--dry-run"],
    )


# ---------------------------------------------------------------------------
# team_size_to_mode
# ---------------------------------------------------------------------------

def test_team_size_startup(wizard_mod):
    assert wizard_mod.team_size_to_mode(1) == "startup"
    assert wizard_mod.team_size_to_mode(2) == "startup"


def test_team_size_standard(wizard_mod):
    assert wizard_mod.team_size_to_mode(3) == "standard"
    assert wizard_mod.team_size_to_mode(8) == "standard"


def test_team_size_enterprise(wizard_mod):
    assert wizard_mod.team_size_to_mode(9) == "enterprise"
    assert wizard_mod.team_size_to_mode(100) == "enterprise"


# ---------------------------------------------------------------------------
# primary_engineer
# ---------------------------------------------------------------------------

def test_primary_engineer_backend_only(wizard_mod):
    assert wizard_mod.primary_engineer("hono", "null") == "backend-engineer"


def test_primary_engineer_frontend_only(wizard_mod):
    assert wizard_mod.primary_engineer("null", "nextjs") == "frontend-engineer"


def test_primary_engineer_both_prefers_backend(wizard_mod):
    assert wizard_mod.primary_engineer("fastapi", "nextjs") == "backend-engineer"


def test_primary_engineer_neither_defaults_backend(wizard_mod):
    assert wizard_mod.primary_engineer("null", "null") == "backend-engineer"


# ---------------------------------------------------------------------------
# build_yaml_startup
# ---------------------------------------------------------------------------

DATA_STARTUP = {
    "name": "Test Project",
    "slug": "test-project",
    "description": "Una descripción",
    "language": "python",
    "backend": "fastapi",
    "frontend": "null",
    "profile": "fastapi",
    "compliance": [],
}


def test_startup_yaml_contains_mode(wizard_mod):
    yaml = wizard_mod.build_yaml_startup(DATA_STARTUP)
    assert 'mode: "startup"' in yaml


def test_startup_yaml_has_orchestrator(wizard_mod):
    yaml = wizard_mod.build_yaml_startup(DATA_STARTUP)
    assert "orchestrator" in yaml


def test_startup_yaml_has_backend_engineer_for_fastapi(wizard_mod):
    yaml = wizard_mod.build_yaml_startup(DATA_STARTUP)
    assert "backend-engineer" in yaml


def test_startup_yaml_has_profile(wizard_mod):
    yaml = wizard_mod.build_yaml_startup(DATA_STARTUP)
    assert '"fastapi"' in yaml


def test_startup_yaml_no_compliance_when_empty(wizard_mod):
    yaml = wizard_mod.build_yaml_startup(DATA_STARTUP)
    assert "frameworks: []" in yaml


def test_startup_yaml_with_compliance(wizard_mod):
    data = {**DATA_STARTUP, "compliance": ["gdpr", "lgpd"]}
    yaml = wizard_mod.build_yaml_startup(data)
    assert '"gdpr"' in yaml
    assert '"lgpd"' in yaml


def test_startup_yaml_frontend_engineer_when_frontend_only(wizard_mod):
    data = {**DATA_STARTUP, "backend": "null", "frontend": "nextjs", "profile": "nextjs-admin"}
    yaml = wizard_mod.build_yaml_startup(data)
    assert "frontend-engineer" in yaml


def test_startup_yaml_no_sprint_phases(wizard_mod):
    yaml = wizard_mod.build_yaml_startup(DATA_STARTUP)
    assert "phases:" not in yaml


def test_startup_yaml_otro_profile_gives_empty_profiles(wizard_mod):
    data = {**DATA_STARTUP, "profile": "otro"}
    yaml = wizard_mod.build_yaml_startup(data)
    assert "profiles: []" in yaml


# ---------------------------------------------------------------------------
# build_yaml_standard
# ---------------------------------------------------------------------------

DATA_STANDARD = {
    "name": "Standard Project",
    "slug": "standard-project",
    "description": "Proyecto estándar",
    "language": "typescript",
    "backend": "hono",
    "frontend": "nextjs",
    "profile": "hono-drizzle",
    "compliance": ["gdpr"],
}


def test_standard_yaml_contains_mode(wizard_mod):
    yaml = wizard_mod.build_yaml_standard(DATA_STANDARD)
    assert 'mode: "standard"' in yaml


def test_standard_yaml_has_phases(wizard_mod):
    yaml = wizard_mod.build_yaml_standard(DATA_STANDARD)
    assert "phases:" in yaml


def test_standard_yaml_has_compliance_reviewer_when_compliance(wizard_mod):
    yaml = wizard_mod.build_yaml_standard(DATA_STANDARD)
    assert "compliance-reviewer" in yaml


def test_standard_yaml_no_compliance_reviewer_when_no_compliance(wizard_mod):
    data = {**DATA_STANDARD, "compliance": []}
    yaml = wizard_mod.build_yaml_standard(data)
    assert "compliance-reviewer" not in yaml


def test_standard_yaml_has_skills(wizard_mod):
    yaml = wizard_mod.build_yaml_standard(DATA_STANDARD)
    assert "security-audit" in yaml


def test_standard_yaml_has_full_agent_roster(wizard_mod):
    yaml = wizard_mod.build_yaml_standard(DATA_STANDARD)
    for agent in ("orchestrator", "backend-engineer", "frontend-engineer", "test-engineer", "docs-writer"):
        assert agent in yaml


# ---------------------------------------------------------------------------
# build_yaml_enterprise
# ---------------------------------------------------------------------------

DATA_ENTERPRISE = {
    "name": "Enterprise Project",
    "slug": "enterprise-project",
    "description": "Proyecto enterprise",
    "language": "typescript",
    "backend": "nestjs",
    "frontend": "nextjs",
    "profile": "nestjs",
    "compliance": ["gdpr", "ley-21719"],
}


def test_enterprise_yaml_contains_mode(wizard_mod):
    yaml = wizard_mod.build_yaml_enterprise(DATA_ENTERPRISE)
    assert 'mode: "enterprise"' in yaml


def test_enterprise_yaml_has_four_phases(wizard_mod):
    yaml = wizard_mod.build_yaml_enterprise(DATA_ENTERPRISE)
    assert yaml.count('id: "') >= 4


def test_enterprise_yaml_has_compliance_agents_when_compliance(wizard_mod):
    yaml = wizard_mod.build_yaml_enterprise(DATA_ENTERPRISE)
    assert "compliance-reviewer" in yaml
    assert "security-auditor" in yaml


def test_enterprise_yaml_audit_logs_true_when_compliance(wizard_mod):
    yaml = wizard_mod.build_yaml_enterprise(DATA_ENTERPRISE)
    assert "audit_logs: true" in yaml


def test_enterprise_yaml_pii_true_when_compliance(wizard_mod):
    yaml = wizard_mod.build_yaml_enterprise(DATA_ENTERPRISE)
    assert "pii_handling: true" in yaml


def test_enterprise_yaml_no_audit_logs_when_no_compliance(wizard_mod):
    data = {**DATA_ENTERPRISE, "compliance": []}
    yaml = wizard_mod.build_yaml_enterprise(data)
    assert "audit_logs: false" in yaml


def test_enterprise_yaml_has_frameworks(wizard_mod):
    yaml = wizard_mod.build_yaml_enterprise(DATA_ENTERPRISE)
    assert '"gdpr"' in yaml
    assert '"ley-21719"' in yaml


def test_enterprise_yaml_has_obsidian_section(wizard_mod):
    yaml = wizard_mod.build_yaml_enterprise(DATA_ENTERPRISE)
    assert "obsidian" in yaml


def test_enterprise_yaml_otro_profile_gives_empty_profiles(wizard_mod):
    data = {**DATA_ENTERPRISE, "profile": "otro"}
    yaml = wizard_mod.build_yaml_enterprise(data)
    assert "profiles: []" in yaml
