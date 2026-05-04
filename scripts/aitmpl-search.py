#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Optional

BASE_URL = "https://www.aitmpl.com"
CACHE_FILE = Path.home() / ".forge" / "aitmpl-cache.json"
CACHE_TTL = 3600
TIMEOUT = 10


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
    with open(CACHE_FILE, "w") as f:
        json.dump(data, f)


def _fetch(url: str, referer: Optional[str] = None) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "forge-aitmpl-search/1.0 (github.com/forge-framework)",
            "Accept": "text/html,application/json",
            **({"Referer": referer} if referer else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            charset = "utf-8"
            ct = resp.headers.get_content_charset()
            if ct:
                charset = ct
            return resp.read().decode(charset, errors="replace")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {url}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Error de red: {e.reason}") from e


class _CardParser(HTMLParser):
    """Extrae template cards del HTML de aitmpl.com."""

    def __init__(self) -> None:
        super().__init__()
        self.templates: list[dict] = []
        self._current: Optional[dict] = None
        self._in_title = False
        self._in_desc = False
        self._in_cat = False
        self._stack: list[tuple[str, dict]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        amap = dict(attrs)
        cls = amap.get("class", "") or ""
        href = amap.get("href", "") or ""

        if tag == "a" and href and ("/template/" in href or "/templates/" in href):
            url = href if href.startswith("http") else BASE_URL + href
            self._current = {"name": "", "description": "", "category": "", "url": url}
            self._stack.append((tag, amap))
            return

        if self._current is not None:
            if tag in ("h2", "h3") or any(k in cls for k in ("title", "name", "heading")):
                self._in_title = True
            elif any(k in cls for k in ("desc", "description", "summary", "excerpt")):
                self._in_desc = True
            elif any(k in cls for k in ("category", "tag", "badge", "label")):
                self._in_cat = True
            self._stack.append((tag, amap))

    def handle_endtag(self, tag: str) -> None:
        self._in_title = False
        self._in_desc = False
        self._in_cat = False
        if self._stack:
            self._stack.pop()
        if not self._stack and self._current:
            if self._current.get("name"):
                self.templates.append(self._current)
            self._current = None

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if not text or self._current is None:
            return
        if self._in_title and not self._current["name"]:
            self._current["name"] = text
        elif self._in_desc and not self._current["description"]:
            self._current["description"] = text
        elif self._in_cat and not self._current["category"]:
            self._current["category"] = text


def _extract_templates(html: str) -> list[dict]:
    parser = _CardParser()
    parser.feed(html)
    results = parser.templates

    if not results:
        results = _fallback_extract(html)

    seen: set[str] = set()
    unique = []
    for t in results:
        if t["url"] not in seen:
            seen.add(t["url"])
            unique.append(t)
    return unique


def _fallback_extract(html: str) -> list[dict]:
    """Extracción básica por href cuando el parser de cards no encuentra nada."""
    results = []
    lower = html.lower()
    idx = 0
    while True:
        pos = lower.find('href="', idx)
        if pos == -1:
            break
        end = html.find('"', pos + 6)
        href = html[pos + 6:end]
        if "/template" in href and href not in [r["url"] for r in results]:
            url = href if href.startswith("http") else BASE_URL + href
            slug = href.rstrip("/").split("/")[-1].replace("-", " ").title()
            results.append({"name": slug, "description": "", "category": "", "url": url})
        idx = end + 1
    return results


def _fetch_templates(category: Optional[str] = None) -> list[dict]:
    cache = _cache_load()
    cache_key = f"templates_{category or 'all'}"
    if cache_key in cache:
        return cache[cache_key]

    urls_to_try = [BASE_URL]
    if category:
        urls_to_try = [
            f"{BASE_URL}/category/{urllib.parse.quote(category)}",
            f"{BASE_URL}/templates?category={urllib.parse.quote(category)}",
            BASE_URL,
        ]

    templates: list[dict] = []
    for url in urls_to_try:
        try:
            html = _fetch(url)
            templates = _extract_templates(html)
            if templates:
                break
        except RuntimeError:
            continue

    if not templates:
        print("Advertencia: no se pudieron obtener templates del sitio.", file=sys.stderr)

    cache[cache_key] = templates
    _cache_save(cache)
    return templates


def _search(query: str, templates: list[dict]) -> list[dict]:
    terms = query.lower().split()
    scored = []
    for t in templates:
        haystack = f"{t['name']} {t['description']} {t['category']}".lower()
        score = sum(1 for term in terms if term in haystack)
        if score > 0:
            scored.append((score, t))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [t for _, t in scored]


def _print_results(results: list[dict], as_json: bool) -> None:
    if as_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return

    if not results:
        print("Sin resultados.")
        return

    for i, t in enumerate(results, 1):
        name = t.get("name") or "(sin nombre)"
        desc = t.get("description") or ""
        cat = t.get("category") or ""
        url = t.get("url") or ""
        print(f"{i:>2}. {name}")
        if cat:
            print(f"    Categoría : {cat}")
        if desc:
            print(f"    Descripción: {desc}")
        print(f"    URL       : {url}")
        print()


def _install(identifier: str) -> None:
    url = identifier if identifier.startswith("http") else None

    if url is None:
        cache = _cache_load()
        for key, val in cache.items():
            if key.startswith("templates_") and isinstance(val, list):
                for t in val:
                    if identifier.lower() in t.get("name", "").lower():
                        url = t["url"]
                        print(f"Template encontrado: {t['name']}")
                        break
            if url:
                break

    if url is None:
        print(f"No se encontró el template '{identifier}'. Buscar primero con el query.", file=sys.stderr)
        sys.exit(1)

    print(f"Descargando desde: {url}")
    try:
        content = _fetch(url)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    slug = url.rstrip("/").split("/")[-1]
    out_dir = Path.cwd() / ".forge" / "templates" / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    raw_file = out_dir / "template.html"
    with open(raw_file, "w") as f:
        f.write(content)

    print(f"Guardado en: {raw_file}")
    print()
    print("Para integrar con forge:")
    print(f"  1. Revisar el contenido en {raw_file}")
    print(f"  2. Extraer el template relevante a forge/templates/<nombre>.yaml.tpl")
    print(f"  3. Ejecutar: python3 .agentic/scripts/forge-init.py --tool claude-code")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Busca templates en aitmpl.com para integrar con forge."
    )
    parser.add_argument("query", nargs="?", default="", help="Término de búsqueda")
    parser.add_argument("--limit", type=int, default=10, metavar="N", help="Máximo de resultados (default: 10)")
    parser.add_argument("--json", dest="as_json", action="store_true", help="Salida en JSON")
    parser.add_argument("--category", metavar="CAT", help="Filtrar por categoría")
    parser.add_argument("--install", metavar="URL_O_NOMBRE", help="Descargar e instalar un template")

    args = parser.parse_args()

    if args.install:
        _install(args.install)
        return

    if not args.query:
        parser.print_help()
        sys.exit(1)

    print(f"Buscando '{args.query}' en aitmpl.com...", file=sys.stderr)

    try:
        templates = _fetch_templates(category=args.category)
    except Exception as e:
        print(f"Error al obtener templates: {e}", file=sys.stderr)
        sys.exit(1)

    results = _search(args.query, templates)
    results = results[: args.limit]

    if not args.as_json:
        print(f"Resultados: {len(results)} de {len(templates)} templates\n", file=sys.stderr)

    _print_results(results, args.as_json)


if __name__ == "__main__":
    main()
