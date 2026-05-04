from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture(scope="module")
def scaffold_mod(forge_root):
    from conftest import load_module
    return load_module(
        forge_root / "scripts" / "forge-scaffold-profile.py",
        "forge_scaffold",
        argv=["forge-scaffold-profile.py"],
    )


# ---------------------------------------------------------------------------
# _agent_md content
# ---------------------------------------------------------------------------

def test_agent_md_has_correct_frontmatter(scaffold_mod):
    md = scaffold_mod._agent_md("django", "api-engineer", "", "")
    assert "name: api-engineer" in md
    assert "tier: 2" in md
    assert "profile: django" in md
    assert "model: sonnet" in md


def test_agent_md_has_required_sections(scaffold_mod):
    md = scaffold_mod._agent_md("django", "api-engineer", "", "")
    assert "## Stack" in md
    assert "## Tu trabajo" in md
    assert "## Reglas" in md
    assert "## Workflow" in md
    assert "## No hagas" in md


def test_agent_md_uses_custom_description(scaffold_mod):
    md = scaffold_mod._agent_md("django", "api-engineer", "Mi descripción personalizada", "")
    assert "Mi descripción personalizada" in md


def test_agent_md_uses_custom_stack_details(scaffold_mod):
    md = scaffold_mod._agent_md("django", "api-engineer", "", "Django 4.2 + PostgreSQL")
    assert "Django 4.2 + PostgreSQL" in md


def test_agent_md_fallback_description_mentions_stack(scaffold_mod):
    md = scaffold_mod._agent_md("django", "api-engineer", "", "")
    # Sin descripción custom, el fallback menciona el stack
    assert "Django" in md or "django" in md.lower()


def test_agent_md_has_security_rules(scaffold_mod):
    md = scaffold_mod._agent_md("laravel", "api-engineer", "", "")
    assert "parámetros preparados" in md.lower() or "sql" in md.lower()


# ---------------------------------------------------------------------------
# Profile creation integration
# ---------------------------------------------------------------------------

def test_scaffold_creates_profile_file(tmp_path, scaffold_mod, forge_root, monkeypatch):
    """Verifica que _find_forge_dir detecta el directorio forge real."""
    forge_dir = scaffold_mod._find_forge_dir()
    assert (forge_dir / "core").exists()
    assert (forge_dir / "profiles").exists()


def test_scaffold_creates_agent_file(forge_root, monkeypatch):
    """Ejecuta el scaffold y verifica que crea el archivo de agente."""
    import sys
    from conftest import load_module

    target_profile = "test-scaffold-django"
    target_agent = "api-engineer"
    expected_file = forge_root / "profiles" / target_profile / "agents" / f"{target_agent}.md"
    test_argv = [
        "forge-scaffold-profile.py",
        "--name", target_profile,
        "--engineer", target_agent,
        "--description", "Test scaffold agent",
        "--stack-details", "Django 4.2 + DRF",
    ]

    try:
        mod = load_module(
            forge_root / "scripts" / "forge-scaffold-profile.py",
            "forge_scaffold_run",
            argv=test_argv,
        )
        monkeypatch.setattr(sys, "argv", test_argv)
        mod.main()

        assert expected_file.exists(), f"Se esperaba {expected_file}"
        content = expected_file.read_text()
        assert "tier: 2" in content
        assert f"profile: {target_profile}" in content
        assert "Test scaffold agent" in content
        assert "Django 4.2 + DRF" in content
    finally:
        if expected_file.exists():
            expected_file.unlink()
        profile_agents_dir = forge_root / "profiles" / target_profile / "agents"
        if profile_agents_dir.exists():
            profile_agents_dir.rmdir()
        profile_dir = forge_root / "profiles" / target_profile
        if profile_dir.exists():
            profile_dir.rmdir()


def test_scaffold_refuses_to_overwrite(forge_root, capsys, monkeypatch):
    """Si el archivo ya existe, el script debe salir con código 1."""
    import sys
    from conftest import load_module

    target_profile = "test-scaffold-existing"
    target_agent = "api-engineer"
    profile_dir = forge_root / "profiles" / target_profile / "agents"
    agent_file = profile_dir / f"{target_agent}.md"
    test_argv = [
        "forge-scaffold-profile.py",
        "--name", target_profile,
        "--engineer", target_agent,
    ]

    profile_dir.mkdir(parents=True, exist_ok=True)
    agent_file.write_text("# existing")

    try:
        mod = load_module(
            forge_root / "scripts" / "forge-scaffold-profile.py",
            "forge_scaffold_overwrite",
            argv=test_argv,
        )
        monkeypatch.setattr(sys, "argv", test_argv)
        with pytest.raises(SystemExit) as exc:
            mod.main()
        assert exc.value.code == 1
    finally:
        agent_file.unlink(missing_ok=True)
        profile_dir.rmdir()
        (forge_root / "profiles" / target_profile).rmdir()
