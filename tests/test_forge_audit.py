"""
Tests para forge-audit.py.
Verifica parsing de frontmatter, checks de secciones, similitud y detección de problemas.
"""
import pytest
from pathlib import Path
from conftest import load_module

FORGE_ROOT = Path(__file__).parent.parent
SCRIPT = FORGE_ROOT / "scripts" / "forge-audit.py"


@pytest.fixture(scope="module")
def mod():
    return load_module(SCRIPT, "forge_audit", argv=["forge-audit.py"])


VALID_FRONTMATTER = """\
---
name: test-agent
description: Agente de test. NO trabaja fuera de su directorio. Scope claro.
model: sonnet
tools: Read, Grep
tier: 1
---

## Reglas

- Regla 1

## No hagas

- No hagas esto
"""

MINIMAL_AGENT = VALID_FRONTMATTER + "\n" * 10  # asegurar >15 líneas


# ── parse_frontmatter ─────────────────────────────────────────────────────────

def test_parse_frontmatter_valido(mod):
    fm = mod.parse_frontmatter(VALID_FRONTMATTER)
    assert fm["name"] == "test-agent"
    assert fm["model"] == "sonnet"
    assert fm["tier"] == 1


def test_parse_frontmatter_ausente(mod):
    fm = mod.parse_frontmatter("# Solo markdown, sin frontmatter")
    assert fm == {}


def test_parse_frontmatter_yaml_invalido(mod):
    content = "---\nname: [sin cerrar\n---\n# body"
    fm = mod.parse_frontmatter(content)
    assert fm == {}


def test_parse_frontmatter_vacio(mod):
    content = "---\n---\n# body"
    fm = mod.parse_frontmatter(content)
    assert fm == {} or fm is None or fm == {}


# ── check_frontmatter ─────────────────────────────────────────────────────────

def _make_agent(content: str, name: str = "test-agent") -> dict:
    return {
        "name": name,
        "content": content,
        "frontmatter": {},
        "lines": len(content.splitlines()),
        "path": Path("/fake/path.md"),
    }


def test_check_frontmatter_sin_bloque(mod):
    agent = _make_agent("# Sin frontmatter")
    issues = mod.check_frontmatter(agent)
    levels = [i["level"] for i in issues]
    assert "error" in levels


def test_check_frontmatter_falta_nombre(mod):
    content = "---\ndescription: d\nmodel: sonnet\ntools: Read\ntier: 1\n---\n"
    agent = _make_agent(content)
    agent["frontmatter"] = mod.parse_frontmatter(content)
    issues = mod.check_frontmatter(agent)
    msgs = [i["msg"] for i in issues]
    assert any("name" in m for m in msgs)


def test_check_frontmatter_modelo_invalido(mod):
    content = "---\nname: x\ndescription: d. NO scope\nmodel: gpt4\ntools: Read\ntier: 1\n---\n"
    agent = _make_agent(content)
    agent["frontmatter"] = mod.parse_frontmatter(content)
    issues = mod.check_frontmatter(agent)
    errors = [i for i in issues if i["level"] == "error"]
    assert any("model" in i["msg"] for i in errors)


def test_check_frontmatter_modelos_validos(mod):
    for model in ("opus", "sonnet", "haiku"):
        content = (
            f"---\nname: x\ndescription: Descripcion corta. NO scope.\n"
            f"model: {model}\ntools: Read\ntier: 2\n---\n"
        )
        agent = _make_agent(content)
        agent["frontmatter"] = mod.parse_frontmatter(content)
        issues = mod.check_frontmatter(agent)
        model_errors = [i for i in issues if i["level"] == "error" and "model" in i["msg"]]
        assert not model_errors, f"modelo válido '{model}' no debe producir error"


def test_check_frontmatter_orchestrator_sin_opus(mod):
    content = "---\nname: orchestrator\ndescription: d. NO scope.\nmodel: sonnet\ntools: Read\ntier: 1\n---\n"
    agent = _make_agent(content, name="orchestrator")
    agent["frontmatter"] = mod.parse_frontmatter(content)
    issues = mod.check_frontmatter(agent)
    warns = [i for i in issues if i["level"] == "warn"]
    assert any("opus" in i["msg"] for i in warns)


def test_check_frontmatter_implementador_con_opus(mod):
    content = "---\nname: backend-engineer\ndescription: d. NO scope.\nmodel: opus\ntools: Read\ntier: 1\n---\n"
    agent = _make_agent(content, name="backend-engineer")
    agent["frontmatter"] = mod.parse_frontmatter(content)
    issues = mod.check_frontmatter(agent)
    warns = [i for i in issues if i["level"] == "warn"]
    assert any("sonnet" in i["msg"] or "opus" in i["msg"] for i in warns)


# ── check_sections ────────────────────────────────────────────────────────────

def test_check_sections_completo(mod):
    content = MINIMAL_AGENT
    agent = _make_agent(content)
    agent["frontmatter"] = mod.parse_frontmatter(content)
    issues = mod.check_sections(agent)
    errors = [i for i in issues if i["level"] == "error"]
    assert not errors


def test_check_sections_falta_reglas(mod):
    content = "---\nname: x\n---\n\n## No hagas\n\n- Nada\n\n" + "x\n" * 15
    agent = _make_agent(content)
    issues = mod.check_sections(agent)
    errors = [i for i in issues if i["level"] == "error"]
    assert any("Reglas" in i["msg"] for i in errors)


def test_check_sections_falta_no_hagas(mod):
    content = "---\nname: x\n---\n\n## Reglas\n\n- Algo\n\n" + "x\n" * 15
    agent = _make_agent(content)
    issues = mod.check_sections(agent)
    errors = [i for i in issues if i["level"] == "error"]
    assert any("No hagas" in i["msg"] or "hagas" in i["msg"].lower() for i in errors)


def test_check_sections_agente_muy_corto(mod):
    content = "---\nname: x\n---\n## Reglas\n- r\n## No hagas\n- n\n"
    agent = _make_agent(content)
    agent["lines"] = 5  # forzar líneas bajas
    issues = mod.check_sections(agent)
    warns = [i for i in issues if i["level"] == "warn"]
    assert any("corto" in i["msg"] for i in warns)


# ── similarity ────────────────────────────────────────────────────────────────

def test_similarity_textos_identicos(mod):
    assert mod.similarity("hola mundo", "hola mundo") == pytest.approx(1.0)


def test_similarity_textos_completamente_diferentes(mod):
    ratio = mod.similarity("aaa", "zzz")
    assert ratio < 0.5


def test_similarity_texto_similar(mod):
    a = "Este es un agente de backend que implementa APIs REST con autenticación."
    b = "Este es un agente de backend que implementa APIs REST con autorización."
    ratio = mod.similarity(a, b)
    assert 0.8 < ratio < 1.0


# ── check_vs_forge — Tier 3 no se compara ─────────────────────────────────────

def test_tier3_no_se_compara_con_forge(mod):
    content = "---\nname: mi-agente\ndescription: d\nmodel: sonnet\ntools: Read\ntier: 3\n---\n## Reglas\n- r\n## No hagas\n- n\n"
    agent = _make_agent(content)
    agent["frontmatter"] = {"tier": 3}
    forge = FORGE_ROOT
    profiles = []
    issues = mod.check_vs_forge(agent, forge, profiles)
    assert any(i["level"] == "ok" and "Tier 3" in i["msg"] for i in issues)


# ── find_opportunities ────────────────────────────────────────────────────────

def test_find_opportunities_sin_profiles(mod):
    config = {
        "agents": {"active": [], "profiles": []},
        "skills": {"active": [], "integrations": []},
        "deploy": {"provider": None},
        "_root": str(FORGE_ROOT),
    }
    opps = mod.find_opportunities(FORGE_ROOT, config, set())
    opp_types = [o["type"] for o in opps]
    assert "profile" in opp_types  # hay profiles en forge que no usa


def test_find_opportunities_sin_deploy_provider(mod):
    config = {
        "agents": {"active": [], "profiles": []},
        "skills": {"active": [], "integrations": []},
        "deploy": {"provider": None},
        "_root": str(FORGE_ROOT),
    }
    opps = mod.find_opportunities(FORGE_ROOT, config, set())
    assert any(o["type"] == "config" and "deploy" in o["msg"] for o in opps)


def test_find_opportunities_no_reporta_profiles_activos(mod):
    config = {
        "agents": {"active": [], "profiles": ["hono-drizzle"]},
        "skills": {"active": [], "integrations": []},
        "deploy": {"provider": "vercel"},
        "_root": str(FORGE_ROOT),
    }
    opps = mod.find_opportunities(FORGE_ROOT, config, set())
    profile_opps = [o for o in opps if o["type"] == "profile" and "hono-drizzle" in o["msg"]]
    assert not profile_opps


# ── ISS-010: mensajes de similitud ────────────────────────────────────────────

def _make_forge_tmp(tmp_path, forge_content: str, project_content: str, name: str = "test-agent"):
    """Crea una estructura mínima de forge + proyecto para check_vs_forge."""
    forge = tmp_path / "forge"
    (forge / "core" / "agents").mkdir(parents=True)
    (forge / "core" / "agents" / f"{name}.md").write_text(forge_content)

    agent_path = tmp_path / f"{name}.md"
    agent_path.write_text(project_content)
    fm = mod  # se pisa en cada test — se pasa explícitamente
    return forge, agent_path


def test_similitud_entre_50_y_80_incluye_nota_reescritura(mod):
    """Rango 0.50-0.80 (warn, no comparable): mensaje debe incluir nota de reescritura intencional."""
    import tempfile, pathlib

    # forge tiene muchas líneas; proyecto tiene pocas → no comparable, no extended.
    # Comparten el mismo encabezado para que la similitud quede en rango medio.
    shared_header = "---\nname: test-agent\ndescription: d\nmodel: sonnet\ntools: Read\ntier: 1\n---\n## Reglas\n"
    unique_lines = "".join(f"- Regla core {i}\n" for i in range(80))
    forge_content = shared_header + unique_lines           # ~90 líneas
    project_content = shared_header + "- Regla custom.\n"  # ~10 líneas — no comparable

    forge_lines = len(forge_content.splitlines())
    project_lines = len(project_content.splitlines())
    comparable = forge_lines * 0.7 <= project_lines <= forge_lines * 1.2

    # Monkeypatch similarity para forzar el rango 0.50-0.80
    original_similarity = mod.similarity
    mod.similarity = lambda a, b: 0.65  # forzar ratio en rango medio

    try:
        with tempfile.TemporaryDirectory() as td:
            tdp = pathlib.Path(td)
            forge = tdp / "forge"
            (forge / "core" / "agents").mkdir(parents=True)
            (forge / "core" / "agents" / "test-agent.md").write_text(forge_content)

            agent = {
                "name": "test-agent",
                "content": project_content,
                "frontmatter": {"tier": 1},
                "lines": project_lines,
                "path": tdp / "test-agent.md",
            }
            issues = mod.check_vs_forge(agent, forge, [])
    finally:
        mod.similarity = original_similarity

    warn_issues = [i for i in issues if i["level"] == "warn"]
    assert warn_issues, "Esperaba al menos un warn con ratio 0.65 y proyecto no comparable"
    assert any("reescritura intencional" in i["msg"] for i in warn_issues), \
        f"Esperaba 'reescritura intencional' en: {[i['msg'] for i in warn_issues]}"
    assert any(i.get("may_be_intentional") is True for i in warn_issues)


def test_similitud_menor_50_incluye_nota_version(mod):
    """Similitud < 0.50 debe indicar diferencia mayor al 50% y sugerir verificar versión."""
    # Contenidos completamente distintos
    forge_content = "## Reglas\n" + ("- Texto completamente diferente A.\n" * 40)
    project_content = "## Reglas\n" + ("- Contenido radicalmente distinto B.\n" * 5)  # mucho más corto → error path
    ratio = mod.similarity(forge_content, project_content)
    assert ratio < mod.SIMILARITY_OUTDATED, f"ratio={ratio:.2f} debería ser < {mod.SIMILARITY_OUTDATED}"

    import tempfile, pathlib
    with tempfile.TemporaryDirectory() as td:
        tdp = pathlib.Path(td)
        forge = tdp / "forge"
        (forge / "core" / "agents").mkdir(parents=True)
        (forge / "core" / "agents" / "test-agent.md").write_text(forge_content)

        agent = {
            "name": "test-agent",
            "content": project_content,
            "frontmatter": {"tier": 1},
            "lines": len(project_content.splitlines()),
            "path": tdp / "test-agent.md",
        }
        issues = mod.check_vs_forge(agent, forge, [])

    # Algún issue con nivel error o warn debe mencionar la nota de versión
    relevant = [i for i in issues if i["level"] in ("error", "warn", "info")]
    assert relevant, "Esperaba al menos un issue para similitud baja"
    msgs = " ".join(i["msg"] for i in relevant)
    assert "50%" in msgs or "versión de forge" in msgs, \
        f"Esperaba nota sobre versión en: {msgs}"
