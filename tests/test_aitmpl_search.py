from __future__ import annotations

import json
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

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
# _search
# ---------------------------------------------------------------------------

SAMPLE_TEMPLATES = [
    {"name": "FastAPI Backend", "description": "REST API with FastAPI", "category": "backend", "url": "https://aitmpl.com/template/fastapi-backend"},
    {"name": "Next.js App", "description": "Full-stack React app", "category": "frontend", "url": "https://aitmpl.com/template/nextjs-app"},
    {"name": "Django REST", "description": "Backend with Django and DRF", "category": "backend", "url": "https://aitmpl.com/template/django-rest"},
]


def test_search_finds_exact_match(aitmpl_mod):
    results = aitmpl_mod._search("fastapi", SAMPLE_TEMPLATES)
    assert any("FastAPI" in r["name"] for r in results)


def test_search_returns_empty_for_no_match(aitmpl_mod):
    results = aitmpl_mod._search("laravel-totally-unique-xyz", SAMPLE_TEMPLATES)
    assert results == []


def test_search_case_insensitive(aitmpl_mod):
    results = aitmpl_mod._search("FASTAPI", SAMPLE_TEMPLATES)
    assert any("FastAPI" in r["name"] for r in results)


def test_search_matches_description(aitmpl_mod):
    results = aitmpl_mod._search("REST API", SAMPLE_TEMPLATES)
    assert len(results) >= 1


def test_search_multi_term_scores_higher(aitmpl_mod):
    results = aitmpl_mod._search("fastapi backend", SAMPLE_TEMPLATES)
    assert results[0]["name"] == "FastAPI Backend"


def test_search_matches_category(aitmpl_mod):
    results = aitmpl_mod._search("backend", SAMPLE_TEMPLATES)
    assert len(results) >= 2


# ---------------------------------------------------------------------------
# _cache_load / _cache_save
# ---------------------------------------------------------------------------

def test_cache_save_and_load(tmp_path, aitmpl_mod, monkeypatch):
    cache_file = tmp_path / "aitmpl-cache.json"
    monkeypatch.setattr(aitmpl_mod, "CACHE_FILE", cache_file)

    data = {"templates_all": SAMPLE_TEMPLATES}
    aitmpl_mod._cache_save(data)

    loaded = aitmpl_mod._cache_load()
    assert "templates_all" in loaded
    assert loaded["templates_all"] == SAMPLE_TEMPLATES


def test_cache_expires_after_ttl(tmp_path, aitmpl_mod, monkeypatch):
    cache_file = tmp_path / "aitmpl-cache-expired.json"
    monkeypatch.setattr(aitmpl_mod, "CACHE_FILE", cache_file)
    monkeypatch.setattr(aitmpl_mod, "CACHE_TTL", 0)

    data = {"templates_all": SAMPLE_TEMPLATES}
    aitmpl_mod._cache_save(data)

    loaded = aitmpl_mod._cache_load()
    assert loaded == {}


def test_cache_returns_empty_when_file_missing(tmp_path, aitmpl_mod, monkeypatch):
    monkeypatch.setattr(aitmpl_mod, "CACHE_FILE", tmp_path / "nonexistent.json")
    assert aitmpl_mod._cache_load() == {}


def test_cache_returns_empty_on_corrupt_json(tmp_path, aitmpl_mod, monkeypatch):
    cache_file = tmp_path / "corrupt.json"
    cache_file.write_text("{not valid json")
    monkeypatch.setattr(aitmpl_mod, "CACHE_FILE", cache_file)
    assert aitmpl_mod._cache_load() == {}


# ---------------------------------------------------------------------------
# _fallback_extract
# ---------------------------------------------------------------------------

def test_fallback_extract_finds_template_links(aitmpl_mod):
    html = '<a href="/template/my-template">My Template</a>'
    results = aitmpl_mod._fallback_extract(html)
    assert any("my-template" in r["url"] for r in results)


def test_extract_templates_deduplicates_fallback(aitmpl_mod):
    """_extract_templates usa _fallback_extract pero deduplica el resultado final."""
    html = '<a href="/template/foo">Foo</a><a href="/template/foo">Foo again</a>'
    results = aitmpl_mod._extract_templates(html)
    urls = [r["url"] for r in results]
    assert len(urls) == len(set(urls))


def test_fallback_extract_ignores_non_template_links(aitmpl_mod):
    html = '<a href="/about">About</a><a href="/contact">Contact</a>'
    results = aitmpl_mod._fallback_extract(html)
    assert results == []


# ---------------------------------------------------------------------------
# _extract_templates deduplication
# ---------------------------------------------------------------------------

def test_extract_templates_deduplicates(aitmpl_mod):
    html = (
        '<a href="/template/foo">Foo</a>'
        '<a href="/template/foo">Foo duplicate</a>'
        '<a href="/template/bar">Bar</a>'
    )
    results = aitmpl_mod._extract_templates(html)
    urls = [r["url"] for r in results]
    assert len(urls) == len(set(urls))


# ---------------------------------------------------------------------------
# _print_results
# ---------------------------------------------------------------------------

def test_print_results_json(aitmpl_mod, capsys):
    aitmpl_mod._print_results(SAMPLE_TEMPLATES[:1], as_json=True)
    out = capsys.readouterr().out
    parsed = json.loads(out)
    assert parsed[0]["name"] == "FastAPI Backend"


def test_print_results_human_readable(aitmpl_mod, capsys):
    aitmpl_mod._print_results(SAMPLE_TEMPLATES[:1], as_json=False)
    out = capsys.readouterr().out
    assert "FastAPI Backend" in out
    assert "aitmpl.com" in out


def test_print_results_empty(aitmpl_mod, capsys):
    aitmpl_mod._print_results([], as_json=False)
    out = capsys.readouterr().out
    assert "Sin resultados" in out
