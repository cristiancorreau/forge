from __future__ import annotations

import json
import time
from pathlib import Path

import pytest


@pytest.fixture(scope="module")
def aitmpl_mod(forge_root):
    from conftest import load_module
    return load_module(
        forge_root / "scripts" / "aitmpl-search.py",
        "aitmpl_search",
        argv=["aitmpl-search.py"],
    )


# ---------------------------------------------------------------------------
# _search_curated
# ---------------------------------------------------------------------------

def test_curated_finds_forge(aitmpl_mod):
    results = aitmpl_mod._search_curated("forge")
    assert any("forge" in r["name"].lower() for r in results)


def test_curated_finds_by_description(aitmpl_mod):
    results = aitmpl_mod._search_curated("fastapi")
    assert len(results) >= 1


def test_curated_finds_mcp(aitmpl_mod):
    results = aitmpl_mod._search_curated("mcp")
    assert any("mcp" in " ".join(r["topics"]).lower() or "mcp" in r["name"].lower()
               for r in results)


def test_curated_returns_empty_for_no_match(aitmpl_mod):
    results = aitmpl_mod._search_curated("xxxxxx-nonexistent-yyyyyyy")
    assert results == []


def test_curated_case_insensitive(aitmpl_mod):
    lower = aitmpl_mod._search_curated("claude")
    upper = aitmpl_mod._search_curated("CLAUDE")
    assert len(lower) == len(upper)


def test_curated_multi_term_scores(aitmpl_mod):
    results = aitmpl_mod._search_curated("claude code template")
    assert len(results) >= 2


# ---------------------------------------------------------------------------
# _normalize_github
# ---------------------------------------------------------------------------

def test_normalize_github_fields(aitmpl_mod):
    raw = {
        "full_name":         "org/repo",
        "description":       "A test repo",
        "topics":            ["claude-code"],
        "stargazers_count":  42,
        "html_url":          "https://github.com/org/repo",
        "language":          "Python",
    }
    result = aitmpl_mod._normalize_github(raw)
    assert result["name"]        == "org/repo"
    assert result["description"] == "A test repo"
    assert result["stars"]       == 42
    assert result["url"]         == "https://github.com/org/repo"
    assert result["language"]    == "Python"
    assert result["source"]      == "github"


def test_normalize_github_handles_none_description(aitmpl_mod):
    raw = {"full_name": "org/repo", "description": None,
           "topics": [], "stargazers_count": 0,
           "html_url": "https://github.com/org/repo", "language": None}
    result = aitmpl_mod._normalize_github(raw)
    assert result["description"] == ""
    assert result["language"]    == ""


# ---------------------------------------------------------------------------
# _cache_load / _cache_save
# ---------------------------------------------------------------------------

def test_cache_save_and_load(tmp_path, aitmpl_mod, monkeypatch):
    cache_file = tmp_path / "test-cache.json"
    monkeypatch.setattr(aitmpl_mod, "CACHE_FILE", cache_file)
    data = {"gh_test_10": [{"name": "test/repo", "url": "https://github.com/test/repo"}]}
    aitmpl_mod._cache_save(data)
    loaded = aitmpl_mod._cache_load()
    assert "gh_test_10" in loaded


def test_cache_expires_after_ttl(tmp_path, aitmpl_mod, monkeypatch):
    cache_file = tmp_path / "expired.json"
    monkeypatch.setattr(aitmpl_mod, "CACHE_FILE", cache_file)
    monkeypatch.setattr(aitmpl_mod, "CACHE_TTL", 0)
    aitmpl_mod._cache_save({"key": "value"})
    assert aitmpl_mod._cache_load() == {}


def test_cache_empty_when_missing(tmp_path, aitmpl_mod, monkeypatch):
    monkeypatch.setattr(aitmpl_mod, "CACHE_FILE", tmp_path / "nope.json")
    assert aitmpl_mod._cache_load() == {}


def test_cache_empty_on_corrupt_json(tmp_path, aitmpl_mod, monkeypatch):
    f = tmp_path / "corrupt.json"
    f.write_text("{bad json")
    monkeypatch.setattr(aitmpl_mod, "CACHE_FILE", f)
    assert aitmpl_mod._cache_load() == {}


# ---------------------------------------------------------------------------
# _print_results
# ---------------------------------------------------------------------------

SAMPLE = [
    {"name": "org/repo", "description": "A repo", "topics": ["claude-code"],
     "stars": 100, "url": "https://github.com/org/repo", "language": "Python", "source": "github"},
]


def test_print_results_json(aitmpl_mod, capsys):
    aitmpl_mod._print_results(SAMPLE, as_json=True)
    parsed = json.loads(capsys.readouterr().out)
    assert parsed[0]["name"] == "org/repo"


def test_print_results_human_readable(aitmpl_mod, capsys):
    aitmpl_mod._print_results(SAMPLE, as_json=False)
    out = capsys.readouterr().out
    assert "org/repo" in out
    assert "github.com" in out


def test_print_results_empty(aitmpl_mod, capsys):
    aitmpl_mod._print_results([], as_json=False)
    assert "Sin resultados" in capsys.readouterr().out


def test_print_results_shows_stars(aitmpl_mod, capsys):
    aitmpl_mod._print_results(SAMPLE, as_json=False)
    assert "100" in capsys.readouterr().out


def test_print_results_curated_badge(aitmpl_mod, capsys):
    curated = [{**SAMPLE[0], "source": "curated", "stars": 0}]
    aitmpl_mod._print_results(curated, as_json=False)
    assert "[curado]" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# CURATED list sanity checks
# ---------------------------------------------------------------------------

def test_curated_list_has_entries(aitmpl_mod):
    assert len(aitmpl_mod.CURATED) >= 4


def test_curated_entries_have_required_fields(aitmpl_mod):
    for entry in aitmpl_mod.CURATED:
        assert "name"        in entry
        assert "description" in entry
        assert "url"         in entry
        assert "topics"      in entry
