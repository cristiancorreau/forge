from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml


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
# detect_language
# ---------------------------------------------------------------------------

def test_detect_language_typescript_from_nextjs(wizard_mod):
    assert wizard_mod.detect_language("nextjs", "none") == "typescript"


def test_detect_language_python_from_fastapi(wizard_mod):
    assert wizard_mod.detect_language("none", "fastapi") == "python"


def test_detect_language_ruby_from_rails(wizard_mod):
    assert wizard_mod.detect_language("none", "rails") == "ruby"


def test_detect_language_mixed_when_both(wizard_mod):
    assert wizard_mod.detect_language("nextjs", "fastapi") == "mixed"


def test_detect_language_defaults_to_typescript(wizard_mod):
    assert wizard_mod.detect_language("none", "none") == "typescript"


# ---------------------------------------------------------------------------
# suggest_profiles
# ---------------------------------------------------------------------------

def test_suggest_profiles_expo_for_mobile(wizard_mod):
    assert wizard_mod.suggest_profiles("mobile", "expo", "none") == ["expo"]


def test_suggest_profiles_crawler(wizard_mod):
    assert wizard_mod.suggest_profiles("crawler", "none", "none") == ["playwright-crawler"]


def test_suggest_profiles_nextjs_admin(wizard_mod):
    profiles = wizard_mod.suggest_profiles("webapp", "nextjs", "none")
    assert "nextjs-admin" in profiles


def test_suggest_profiles_astro(wizard_mod):
    profiles = wizard_mod.suggest_profiles("static", "astro", "none")
    assert "astro" in profiles


def test_suggest_profiles_hono_drizzle(wizard_mod):
    profiles = wizard_mod.suggest_profiles("api", "none", "hono")
    assert "hono-drizzle" in profiles


def test_suggest_profiles_fastapi(wizard_mod):
    profiles = wizard_mod.suggest_profiles("api", "none", "fastapi")
    assert "fastapi" in profiles


def test_suggest_profiles_rails(wizard_mod):
    profiles = wizard_mod.suggest_profiles("fullstack", "none", "rails")
    assert "rails" in profiles


def test_suggest_profiles_no_duplicates(wizard_mod):
    profiles = wizard_mod.suggest_profiles("fullstack", "nextjs", "hono")
    assert len(profiles) == len(set(profiles))


def test_suggest_profiles_unknown_stack_returns_empty(wizard_mod):
    profiles = wizard_mod.suggest_profiles("api", "none", "spring-boot")
    assert profiles == []


def test_suggest_profiles_laravel(wizard_mod):
    profiles = wizard_mod.suggest_profiles("api", "none", "laravel")
    assert "laravel" in profiles


def test_suggest_profiles_wordpress(wizard_mod):
    profiles = wizard_mod.suggest_profiles("wordpress", "none", "wordpress")
    assert "wordpress" in profiles


# ---------------------------------------------------------------------------
# primary_engineer
# ---------------------------------------------------------------------------

def test_primary_engineer_backend(wizard_mod):
    assert wizard_mod.primary_engineer("none", "fastapi") == "backend-engineer"


def test_primary_engineer_frontend_only(wizard_mod):
    assert wizard_mod.primary_engineer("nextjs", "none") == "frontend-engineer"


def test_primary_engineer_both_prefers_backend(wizard_mod):
    assert wizard_mod.primary_engineer("nextjs", "hono") == "backend-engineer"


# ---------------------------------------------------------------------------
# build_yaml — startup
# ---------------------------------------------------------------------------

BASE = {
    "mode":         "startup",
    "name":         "Test",
    "slug":         "test",
    "description":  "desc",
    "language":     "typescript",
    "project_type": "webapp",
    "frontend":     "nextjs",
    "backend":      "hono",
    "database":     "postgresql",
    "deploy":       "vercel",
    "profiles":     ["hono-drizzle", "nextjs-admin"],
    "runtime":      "claude-code",
    "compliance":   [],
}


def test_startup_yaml_has_mode(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "startup"})
    assert 'mode: "startup"' in y


def test_startup_yaml_has_orchestrator(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "startup"})
    assert "orchestrator" in y


def test_startup_yaml_no_phases(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "startup"})
    assert "phases:" not in y


def test_startup_yaml_no_compliance_when_empty(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "startup"})
    assert "frameworks: []" in y


# ---------------------------------------------------------------------------
# build_yaml — standard
# ---------------------------------------------------------------------------

def test_standard_yaml_has_phases(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard"})
    assert "phases:" in y


def test_standard_yaml_compliance_reviewer_when_compliance(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard", "compliance": ["gdpr"]})
    assert "compliance-reviewer" in y


def test_standard_yaml_no_compliance_reviewer_without_compliance(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard", "compliance": []})
    assert "compliance-reviewer" not in y


def test_standard_yaml_has_deploy_field(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard"})
    assert '"vercel"' in y


def test_standard_yaml_has_database_field(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard"})
    assert '"postgresql"' in y


def test_standard_yaml_db_migrate_when_database(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard"})
    assert "db-migrate" in y


def test_standard_yaml_no_db_migrate_without_database(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard", "database": "none"})
    assert "# - db-migrate" in y


# ---------------------------------------------------------------------------
# build_yaml — enterprise
# ---------------------------------------------------------------------------

def test_enterprise_yaml_has_four_phases(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "enterprise"})
    assert y.count('id: "') >= 4


def test_enterprise_yaml_audit_logs_true_when_compliance(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "enterprise", "compliance": ["gdpr"]})
    assert "audit_logs: true" in y


def test_enterprise_yaml_audit_logs_false_without_compliance(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "enterprise", "compliance": []})
    assert "audit_logs: false" in y


def test_enterprise_yaml_pii_true_when_compliance(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "enterprise", "compliance": ["ley-21719"]})
    assert "pii_handling: true" in y


def test_enterprise_has_security_auditor_when_compliance(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "enterprise", "compliance": ["gdpr"]})
    assert "security-auditor" in y


# ---------------------------------------------------------------------------
# Profiles en YAML
# ---------------------------------------------------------------------------

def test_yaml_profiles_listed(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard", "profiles": ["hono-drizzle", "nextjs-admin"]})
    assert '"hono-drizzle"' in y
    assert '"nextjs-admin"' in y


def test_yaml_empty_profiles(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard", "profiles": []})
    assert "profiles: []" in y


# ---------------------------------------------------------------------------
# Stack fields
# ---------------------------------------------------------------------------

def test_yaml_has_project_type_field(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard"})
    assert 'type: "webapp"' in y


def test_yaml_null_when_none(wizard_mod):
    y = wizard_mod.build_yaml({**BASE, "mode": "standard", "database": "none", "deploy": "none"})
    assert "database: null" in y
    assert "deploy: null" in y


# ---------------------------------------------------------------------------
# build_yaml — caracteres especiales en inputs del usuario (ISS-001)
# ---------------------------------------------------------------------------

def test_build_yaml_name_with_double_quotes(wizard_mod):
    """Un nombre con comillas dobles debe generar YAML válido."""
    y = wizard_mod.build_yaml({**BASE, "mode": "startup", "name": 'My "Awesome" App'})
    parsed = yaml.safe_load(y)
    assert parsed["project"]["name"] == 'My "Awesome" App'


def test_build_yaml_name_with_colon(wizard_mod):
    """Un nombre con dos puntos debe generar YAML válido."""
    y = wizard_mod.build_yaml({**BASE, "mode": "startup", "name": "Project: Alpha"})
    parsed = yaml.safe_load(y)
    assert parsed["project"]["name"] == "Project: Alpha"


def test_build_yaml_name_with_special_chars(wizard_mod):
    """Un nombre con &, # y . debe generar YAML válido."""
    y = wizard_mod.build_yaml({**BASE, "mode": "startup", "name": "App & Co. #1"})
    parsed = yaml.safe_load(y)
    assert parsed["project"]["name"] == "App & Co. #1"


def test_suggest_profiles_django(wizard_mod):
    profiles = wizard_mod.suggest_profiles("api", "none", "django")
    assert "django" in profiles


def test_suggest_profiles_nuxt(wizard_mod):
    profiles = wizard_mod.suggest_profiles("webapp", "nuxt", "none")
    assert "vuenuxt" in profiles


def test_suggest_profiles_go_gin(wizard_mod):
    profiles = wizard_mod.suggest_profiles("api", "none", "gin")
    assert "go-gin" in profiles


def test_suggest_profiles_sveltekit(wizard_mod):
    profiles = wizard_mod.suggest_profiles("webapp", "sveltekit", "none")
    assert "sveltekit" in profiles
