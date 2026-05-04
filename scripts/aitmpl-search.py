#!/usr/bin/env python3
"""
aitmpl-search.py — Busca templates de agentes IA en GitHub.

Busca repositorios etiquetados con topics relevantes (claude-code, ai-agent,
llm-agent, etc.) y filtra por el query del usuario.

Usage:
  python3 .agentic/scripts/aitmpl-search.py "fastapi backend"
  python3 .agentic/scripts/aitmpl-search.py "nextjs" --limit 5
  python3 .agentic/scripts/aitmpl-search.py "rails" --json
  python3 .agentic/scripts/aitmpl-search.py --curated
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

CACHE_FILE = Path.home() / ".forge" / "template-search-cache.json"
CACHE_TTL  = 1800   # 30 minutos
TIMEOUT    = 10

# Topics que identifican repos de templates de agentes IA
SEARCH_TOPICS = [
    "claude-code",
    "ai-agent",
    "llm-agent",
    "claude-agent",
    "mcp",
]

# Lista curada de templates/profiles conocidos — siempre disponible offline
CURATED: list[dict] = [
    {
        "name":        "anthropics/anthropic-quickstarts",
        "description": "Quickstarts oficiales de Anthropic para Claude — incluye agents, computer use y más",
        "topics":      ["claude", "anthropic", "ai-agent"],
        "stars":       0,
        "url":         "https://github.com/anthropics/anthropic-quickstarts",
        "source":      "curated",
    },
    {
        "name":        "anthropics/claude-code-action",
        "description": "GitHub Action oficial para usar Claude Code en CI/CD",
        "topics":      ["claude-code", "github-actions"],
        "stars":       0,
        "url":         "https://github.com/anthropics/claude-code-action",
        "source":      "curated",
    },
    {
        "name":        "modelcontextprotocol/servers",
        "description": "Servidores MCP oficiales — filesystem, git, postgres, fetch, github y más",
        "topics":      ["mcp", "claude", "llm"],
        "stars":       0,
        "url":         "https://github.com/modelcontextprotocol/servers",
        "source":      "curated",
    },
    {
        "name":        "socialwebcl/forge",
        "description": "forge — Framework de desarrollo con agentes IA. Profiles para Next.js, Astro, FastAPI, Rails y más",
        "topics":      ["claude-code", "ai-agent", "llm-agent"],
        "stars":       0,
        "url":         "https://github.com/socialwebcl/forge",
        "source":      "curated",
    },
    {
        "name":        "BuilderIO/micro-agent",
        "description": "Agente IA para generar código que pase tests — TDD automático",
        "topics":      ["ai-agent", "llm"],
        "stars":       0,
        "url":         "https://github.com/BuilderIO/micro-agent",
        "source":      "curated",
    },
    {
        "name":        "paul-gauthier/aider",
        "description": "Pair programming con LLMs en la terminal — soporta Claude, GPT-4 y más",
        "topics":      ["ai-agent", "llm", "claude"],
        "stars":       0,
        "url":         "https://github.com/paul-gauthier/aider",
        "source":      "curated",
    },
    {
        "name":        "assislucas/awesome-claude-code",
        "description": "Lista curada de recursos, templates y herramientas para Claude Code",
        "topics":      ["claude-code", "awesome"],
        "stars":       0,
        "url":         "https://github.com/heshengtao/comfyui_LLM_party",
        "source":      "curated",
    },
]


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def _cache_load() -> dict:
    if not CACHE_FILE.exists():
        return {}
    try:
        with open(CACHE_FILE) as f:
            data = json.load(f)
        if time.time() - data.get("_ts", 0) > CACHE_TTL:
            return {}
        return data
    except (json.JSONDecodeError, OSError):
        return {}


def _cache_save(data: dict) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    data["_ts"] = time.time()
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(data, f)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# GitHub API
# ---------------------------------------------------------------------------

GITHUB_API = "https://api.github.com"

def _github_request(url: str) -> Optional[dict]:
    headers = {
        "Accept":     "application/vnd.github+json",
        "User-Agent": "forge-template-search/2.0",
    }
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            print(
                "  Límite de rate de GitHub alcanzado. "
                "Exporta GITHUB_TOKEN para aumentar el límite (5000 req/h).",
                file=sys.stderr,
            )
        return None
    except (urllib.error.URLError, json.JSONDecodeError):
        return None


def _fetch_github(query: str, limit: int) -> list[dict]:
    """Busca repos en GitHub que contengan el query y topics de AI agents."""
    cache = _cache_load()
    cache_key = f"gh_{query}_{limit}"
    if cache_key in cache:
        return cache[cache_key]

    # Construir query con topics relevantes
    topic_filter = " OR ".join(f"topic:{t}" for t in SEARCH_TOPICS)
    full_query = f"{query} ({topic_filter})"
    params = urllib.parse.urlencode({
        "q":        full_query,
        "sort":     "stars",
        "order":    "desc",
        "per_page": min(limit * 2, 30),
    })
    url  = f"{GITHUB_API}/search/repositories?{params}"
    data = _github_request(url)

    if not data or "items" not in data:
        return []

    results = [_normalize_github(item) for item in data["items"]]
    cache[cache_key] = results
    _cache_save(cache)
    return results


def _normalize_github(item: dict) -> dict:
    return {
        "name":        item.get("full_name", ""),
        "description": item.get("description") or "",
        "topics":      item.get("topics", []),
        "stars":       item.get("stargazers_count", 0),
        "url":         item.get("html_url", ""),
        "language":    item.get("language") or "",
        "source":      "github",
    }


# ---------------------------------------------------------------------------
# Búsqueda local sobre la lista curada
# ---------------------------------------------------------------------------

def _search_curated(query: str) -> list[dict]:
    terms = query.lower().split()
    scored = []
    for item in CURATED:
        haystack = f"{item['name']} {item['description']} {' '.join(item['topics'])}".lower()
        score = sum(1 for t in terms if t in haystack)
        if score > 0:
            scored.append((score, item))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [x[1] for x in scored]


# ---------------------------------------------------------------------------
# Combinación y deduplicación
# ---------------------------------------------------------------------------

def _search(query: str, limit: int) -> list[dict]:
    curated  = _search_curated(query)
    github   = _fetch_github(query, limit)

    seen: set[str] = set()
    combined: list[dict] = []
    for item in curated + github:
        key = item["url"]
        if key not in seen:
            seen.add(key)
            combined.append(item)
        if len(combined) >= limit:
            break
    return combined


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

STARS_BAR = "★"

def _print_results(results: list[dict], as_json: bool) -> None:
    if as_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return

    if not results:
        print("Sin resultados.")
        return

    for i, t in enumerate(results, 1):
        name   = t.get("name", "")
        desc   = t.get("description", "") or ""
        topics = t.get("topics", [])
        stars  = t.get("stars", 0)
        url    = t.get("url", "")
        lang   = t.get("language", "")
        source = t.get("source", "github")

        star_str  = f"{STARS_BAR} {stars:,}" if stars else ""
        lang_str  = f"  {lang}" if lang else ""
        badge     = "[curado]" if source == "curated" else ""
        meta      = "  ".join(filter(None, [star_str, lang_str, badge]))

        print(f"{i:>2}. {name}")
        if desc:
            print(f"     {desc}")
        if topics:
            print(f"     Topics : {', '.join(topics[:6])}")
        if meta:
            print(f"     {meta}")
        print(f"     {url}")
        print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Busca templates de agentes IA en GitHub.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Ejemplos:
              %(prog)s "fastapi backend"
              %(prog)s "nextjs" --limit 5
              %(prog)s "rails" --json
              %(prog)s --curated

            Para aumentar el límite de la API de GitHub:
              export GITHUB_TOKEN=ghp_...
        """),
    )
    parser.add_argument("query", nargs="?", default="",
                        help="Término de búsqueda")
    parser.add_argument("--limit",   type=int, default=10, metavar="N",
                        help="Máximo de resultados (default: 10)")
    parser.add_argument("--json",    dest="as_json", action="store_true",
                        help="Salida en JSON")
    parser.add_argument("--curated", action="store_true",
                        help="Mostrar solo la lista curada (sin llamadas a GitHub)")

    args = parser.parse_args()

    if args.curated:
        print(f"Templates curados ({len(CURATED)}):\n", file=sys.stderr)
        _print_results(CURATED, args.as_json)
        return

    if not args.query:
        parser.print_help()
        sys.exit(1)

    print(f"Buscando '{args.query}' en GitHub...", file=sys.stderr)

    results = _search(args.query, args.limit)

    if not args.as_json:
        print(f"Resultados: {len(results)}\n", file=sys.stderr)

    _print_results(results, args.as_json)


import textwrap  # noqa: E402 — necesario para el epilog del argparser

if __name__ == "__main__":
    main()
