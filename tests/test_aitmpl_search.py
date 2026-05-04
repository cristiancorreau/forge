from __future__ import annotations

import json
import time
from pathlib import Path

import pytest


@pytest.fixture(scope="module")
def mod(forge_root):
    from conftest import load_module
    return load_module(
        forge_root / "scripts" / "aitmpl-search.py",
        "aitmpl_search",
        argv=["aitmpl-search.py"],
    )


# ---------------------------------------------------------------------------
# _search_local
# ---------------------------------------------------------------------------

def test_search_finds_fastapi(mod):
    results = mod._search_local("fastapi")
    assert len(results) >= 1
    assert any("fastapi" in r["name"].lower() or "fastapi" in " ".join(r["tags"]) for r in results)


def test_search_finds_mcp_postgres(mod):
    results = mod._search_local("mcp postgres")
    assert any("postgres" in r["name"].lower() for r in results)


def test_search_case_insensitive(mod):
    lower = mod._search_local("rails")
    upper = mod._search_local("RAILS")
    assert len(lower) == len(upper)


def test_search_returns_empty_for_nonexistent(mod):
    results = mod._search_local("xxxxxx-nonexistent-yyyyyyy")
    assert results == []


def test_search_by_tag(mod):
    results = mod._search_local("playwright")
    assert len(results) >= 1


def test_search_by_language(mod):
    results = mod._search_local("ruby")
    assert any(r.get("language") == "Ruby" or "ruby" in " ".join(r["tags"]) for r in results)


def test_search_multi_term_scores_higher(mod):
    results = mod._search_local("fastapi python")
    assert results[0]["category"] in ("profile", "framework")


# ---------------------------------------------------------------------------
# Filtro por categoría
# ---------------------------------------------------------------------------

def test_filter_by_mcp_server(mod):
    results = mod._search_local("", category="mcp-server")
    assert all(r["category"] == "mcp-server" for r in results)
    assert len(results) >= 10


def test_filter_by_profile(mod):
    results = mod._search_local("", category="profile")
    assert all(r["category"] == "profile" for r in results)
    assert len(results) >= 8


def test_filter_by_framework(mod):
    results = mod._search_local("", category="framework")
    assert len(results) >= 3


def test_filter_combined_query_and_category(mod):
    results = mod._search_local("postgres", category="mcp-server")
    assert all(r["category"] == "mcp-server" for r in results)
    assert len(results) >= 1


# ---------------------------------------------------------------------------
# Catálogo — sanity checks
# ---------------------------------------------------------------------------

def test_catalog_has_minimum_entries(mod):
    assert len(mod.CATALOG) >= 30


def test_catalog_entries_have_required_fields(mod):
    required = {"name", "description", "category", "tags", "url"}
    for entry in mod.CATALOG:
        missing = required - entry.keys()
        assert not missing, f"{entry['name']} le faltan campos: {missing}"


def test_catalog_categories_are_known(mod):
    known = {"framework", "mcp-server", "skill", "tool", "profile", "resource"}
    for entry in mod.CATALOG:
        assert entry["category"] in known, f"Categoría desconocida: {entry['category']}"


def test_catalog_has_mcp_servers(mod):
    mcp = [e for e in mod.CATALOG if e["category"] == "mcp-server"]
    assert len(mcp) >= 10


def test_catalog_has_forge_profiles(mod):
    profiles = [e for e in mod.CATALOG if e["category"] == "profile"]
    assert len(profiles) >= 8


def test_catalog_urls_are_strings(mod):
    for entry in mod.CATALOG:
        assert isinstance(entry["url"], str) and entry["url"].startswith("http")


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def test_cache_save_and_load(tmp_path, mod, monkeypatch):
    cache_file = tmp_path / "test-cache.json"
    monkeypatch.setattr(mod, "CACHE_FILE", cache_file)
    data = {"gh_test_10": [{"name": "test/repo"}]}
    mod._cache_save(data)
    loaded = mod._cache_load()
    assert "gh_test_10" in loaded


def test_cache_expires(tmp_path, mod, monkeypatch):
    cache_file = tmp_path / "expired.json"
    monkeypatch.setattr(mod, "CACHE_FILE", cache_file)
    monkeypatch.setattr(mod, "CACHE_TTL", 0)
    mod._cache_save({"key": "val"})
    assert mod._cache_load() == {}


def test_cache_empty_when_missing(tmp_path, mod, monkeypatch):
    monkeypatch.setattr(mod, "CACHE_FILE", tmp_path / "nope.json")
    assert mod._cache_load() == {}


def test_cache_empty_on_corrupt_json(tmp_path, mod, monkeypatch):
    f = tmp_path / "corrupt.json"
    f.write_text("{bad json")
    monkeypatch.setattr(mod, "CACHE_FILE", f)
    assert mod._cache_load() == {}


# ---------------------------------------------------------------------------
# _print_results
# ---------------------------------------------------------------------------

SAMPLE = [{
    "name": "test/repo", "description": "A test repo",
    "category": "mcp-server", "tags": ["mcp", "test"],
    "url": "https://github.com/test/repo", "language": "Python",
}]


def test_print_results_json(mod, capsys):
    mod._print_results(SAMPLE, as_json=True)
    parsed = json.loads(capsys.readouterr().out)
    assert parsed[0]["name"] == "test/repo"


def test_print_results_human(mod, capsys):
    mod._print_results(SAMPLE, as_json=False)
    out = capsys.readouterr().out
    assert "test/repo" in out
    assert "github.com" in out


def test_print_results_empty(mod, capsys):
    mod._print_results([], as_json=False)
    assert "Sin resultados" in capsys.readouterr().out


def test_print_results_shows_category(mod, capsys):
    mod._print_results(SAMPLE, as_json=False)
    assert "MCP Server" in capsys.readouterr().out
