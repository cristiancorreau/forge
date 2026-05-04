"""
Tests estructurales para todos los profiles de forge.
Verifica que cada agente de profile cumpla el estándar (frontmatter, secciones, tier).
"""
import pytest
import yaml
from pathlib import Path

FORGE_ROOT = Path(__file__).parent.parent
PROFILES_DIR = FORGE_ROOT / "profiles"

REQUIRED_FRONTMATTER = {"name", "description", "model", "tools", "tier", "profile"}
VALID_MODELS = {"opus", "sonnet", "haiku"}
REQUIRED_SECTIONS = ["## Reglas", "## No hagas"]


def all_profile_agents():
    """Retorna lista de (profile_name, agent_path) para parametrizar tests."""
    agents = []
    if not PROFILES_DIR.exists():
        return agents
    for profile_dir in sorted(PROFILES_DIR.iterdir()):
        if not profile_dir.is_dir():
            continue
        agents_dir = profile_dir / "agents"
        if not agents_dir.exists():
            continue
        for agent_file in sorted(agents_dir.glob("*.md")):
            agents.append((profile_dir.name, agent_file))
    return agents


def parse_frontmatter(content: str) -> dict:
    import re
    m = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not m:
        return {}
    try:
        return yaml.safe_load(m.group(1)) or {}
    except Exception:
        return {}


# ── Profiles existentes ───────────────────────────────────────────────────────

def test_profiles_directorio_existe():
    assert PROFILES_DIR.exists(), "El directorio profiles/ debe existir"


@pytest.mark.parametrize("profile_name", [
    "expo", "hono-drizzle", "nextjs-admin", "playwright-crawler",
    "fastapi", "express", "rails", "nestjs", "django", "vuenuxt", "go-gin", "sveltekit",
])
def test_profile_existe(profile_name):
    profile_dir = PROFILES_DIR / profile_name
    assert profile_dir.exists(), f"Profile '{profile_name}' debe existir en profiles/"


@pytest.mark.parametrize("profile_name", [
    "expo", "hono-drizzle", "nextjs-admin", "playwright-crawler",
    "fastapi", "express", "rails", "nestjs", "django", "vuenuxt", "go-gin", "sveltekit",
])
def test_profile_tiene_al_menos_un_agente(profile_name):
    agents_dir = PROFILES_DIR / profile_name / "agents"
    assert agents_dir.exists(), f"profiles/{profile_name}/agents/ debe existir"
    agents = list(agents_dir.glob("*.md"))
    assert agents, f"profiles/{profile_name}/agents/ debe tener al menos un agente"


# ── Frontmatter de cada agente ────────────────────────────────────────────────

@pytest.mark.parametrize("profile_name,agent_path", all_profile_agents())
def test_agente_tiene_frontmatter(profile_name, agent_path):
    content = agent_path.read_text()
    fm = parse_frontmatter(content)
    assert fm, f"{profile_name}/{agent_path.name}: debe tener bloque frontmatter --- ... ---"


@pytest.mark.parametrize("profile_name,agent_path", all_profile_agents())
def test_frontmatter_campos_requeridos(profile_name, agent_path):
    content = agent_path.read_text()
    fm = parse_frontmatter(content)
    for field in REQUIRED_FRONTMATTER:
        assert field in fm, (
            f"{profile_name}/{agent_path.name}: falta campo '{field}' en frontmatter"
        )


@pytest.mark.parametrize("profile_name,agent_path", all_profile_agents())
def test_agente_es_tier_2(profile_name, agent_path):
    content = agent_path.read_text()
    fm = parse_frontmatter(content)
    assert fm.get("tier") == 2, (
        f"{profile_name}/{agent_path.name}: agentes de profile deben ser tier: 2"
    )


@pytest.mark.parametrize("profile_name,agent_path", all_profile_agents())
def test_modelo_valido(profile_name, agent_path):
    content = agent_path.read_text()
    fm = parse_frontmatter(content)
    model = str(fm.get("model", ""))
    assert model in VALID_MODELS, (
        f"{profile_name}/{agent_path.name}: model '{model}' no es válido. Usar: {VALID_MODELS}"
    )


@pytest.mark.parametrize("profile_name,agent_path", all_profile_agents())
def test_campo_profile_coincide_con_directorio(profile_name, agent_path):
    content = agent_path.read_text()
    fm = parse_frontmatter(content)
    assert fm.get("profile") == profile_name, (
        f"{profile_name}/{agent_path.name}: campo 'profile' debe ser '{profile_name}', "
        f"es '{fm.get('profile')}'"
    )


@pytest.mark.parametrize("profile_name,agent_path", all_profile_agents())
def test_implementador_no_usa_opus(profile_name, agent_path):
    """Agentes de implementación (Tier 2) deben usar sonnet, no opus."""
    content = agent_path.read_text()
    fm = parse_frontmatter(content)
    if fm.get("name") not in ("orchestrator", "compliance-reviewer", "security-auditor"):
        assert fm.get("model") != "opus", (
            f"{profile_name}/{agent_path.name}: agente implementador no debe usar opus"
        )


# ── Secciones requeridas ──────────────────────────────────────────────────────

@pytest.mark.parametrize("profile_name,agent_path", all_profile_agents())
def test_tiene_seccion_reglas(profile_name, agent_path):
    content = agent_path.read_text()
    assert "## Reglas" in content, (
        f"{profile_name}/{agent_path.name}: falta sección '## Reglas'"
    )


@pytest.mark.parametrize("profile_name,agent_path", all_profile_agents())
def test_tiene_seccion_no_hagas(profile_name, agent_path):
    content = agent_path.read_text()
    has_no_hagas = "## No hagas" in content or "## Anti-patterns" in content
    assert has_no_hagas, (
        f"{profile_name}/{agent_path.name}: falta sección '## No hagas' o '## Anti-patterns'"
    )


@pytest.mark.parametrize("profile_name,agent_path", all_profile_agents())
def test_longitud_minima(profile_name, agent_path):
    content = agent_path.read_text()
    lines = len(content.splitlines())
    assert lines >= 15, (
        f"{profile_name}/{agent_path.name}: agente muy corto ({lines} líneas), probablemente incompleto"
    )


# ── Core agents también cumplen el estándar ───────────────────────────────────

CORE_AGENTS_DIR = FORGE_ROOT / "core" / "agents"
CORE_REQUIRED_FM = {"name", "description", "model", "tools", "tier"}


def all_core_agents():
    if not CORE_AGENTS_DIR.exists():
        return []
    return [(f.stem, f) for f in sorted(CORE_AGENTS_DIR.glob("*.md"))]


@pytest.mark.parametrize("agent_name,agent_path", all_core_agents())
def test_core_agent_frontmatter(agent_name, agent_path):
    content = agent_path.read_text()
    fm = parse_frontmatter(content)
    for field in CORE_REQUIRED_FM:
        assert field in fm, f"core/{agent_path.name}: falta '{field}' en frontmatter"


@pytest.mark.parametrize("agent_name,agent_path", all_core_agents())
def test_core_agent_modelo_valido(agent_name, agent_path):
    content = agent_path.read_text()
    fm = parse_frontmatter(content)
    assert str(fm.get("model", "")) in VALID_MODELS


@pytest.mark.parametrize("agent_name,agent_path", all_core_agents())
def test_core_agent_es_tier_1(agent_name, agent_path):
    content = agent_path.read_text()
    fm = parse_frontmatter(content)
    assert fm.get("tier") == 1, f"core/{agent_path.name}: debe ser tier: 1"
