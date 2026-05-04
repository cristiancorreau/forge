#!/usr/bin/env python3
"""
Token usage stats per agent/team — forge framework.

Usage:
  python3 scripts/token-stats.py                      # tabla en terminal
  python3 scripts/token-stats.py --json               # JSON para embeber en progress.html
  python3 scripts/token-stats.py --patch-html PATH    # actualiza el HTML directamente
  python3 scripts/token-stats.py --project-dir PATH   # usar directorio de sesiones específico

PROJECT_DIR se detecta automáticamente desde el directorio de trabajo actual,
o se puede pasar explícitamente con --project-dir.

Identifica agentes lanzados con el protocolo teammate-message.
Las sesiones sin ese marcador se agrupan como "orquestador".
"""
import json, glob, os, re, sys
from collections import defaultdict
from datetime import datetime, timezone


def detect_project_dir() -> str:
    """Detecta el directorio de sesiones Claude Code para el proyecto actual.

    Claude Code usa el path completo con cada '/' reemplazado por '-',
    manteniendo el '-' inicial (e.g. /Users/foo/proj → -Users-foo-proj).
    """
    cwd = os.getcwd()
    project_slug = cwd.replace("/", "-")   # /Users/foo → -Users-foo (mantiene el '-' inicial)
    return os.path.expanduser(f"~/.claude/projects/{project_slug}")


# Respetar --project-dir si se pasa, sino detectar automáticamente
if "--project-dir" in sys.argv:
    idx = sys.argv.index("--project-dir")
    PROJECT_DIR = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else detect_project_dir()
else:
    PROJECT_DIR = detect_project_dir()

# NOTA: precios actualizados a 2026-05. Verificar en https://www.anthropic.com/pricing
# si los precios cambiaron antes de confiar en estos reportes.
_PRICING_DATE = "2026-05"

# Precios por millón de tokens (USD) — actualizar si cambian
PRICING = {
    "claude-sonnet-4-6": {"input": 3.00,  "output": 15.00, "cache_write": 3.75,  "cache_read": 0.30},
    "claude-opus-4-7":   {"input": 15.00, "output": 75.00, "cache_write": 18.75, "cache_read": 1.50},
    "claude-haiku-4-5":  {"input": 0.80,  "output": 4.00,  "cache_write": 1.00,  "cache_read": 0.08},
}
DEFAULT_PRICE = PRICING["claude-sonnet-4-6"]


def parse_sessions():
    files = sorted(glob.glob(f"{PROJECT_DIR}/*.jsonl"))
    results = []

    for f in files:
        session_id = os.path.basename(f).replace(".jsonl", "")[:8]
        agent_name = None
        team_name = None
        per_model = defaultdict(lambda: {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "msgs": 0})
        first_msgs = 0

        with open(f) as fh:
            for line in fh:
                try:
                    obj = json.loads(line)
                except Exception:
                    continue

                # Detect agent identity from first teammate-messages
                if first_msgs < 15 and obj.get("type") == "user":
                    content = obj.get("message", {}).get("content", "")
                    if isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                content = block.get("text", "")
                                break
                    if isinstance(content, str):
                        m = re.search(r'Eres el teammate "([^"]+)" en el equipo "([^"]+)"', content)
                        if m and agent_name is None:
                            agent_name = m.group(1)
                            team_name = m.group(2)
                    first_msgs += 1

                if obj.get("type") == "assistant":
                    msg = obj.get("message", {})
                    usage = msg.get("usage")
                    model = msg.get("model", "claude-sonnet-4-6")
                    if usage:
                        pm = per_model[model]
                        pm["input"]       += usage.get("input_tokens", 0)
                        pm["output"]      += usage.get("output_tokens", 0)
                        pm["cache_read"]  += usage.get("cache_read_input_tokens", 0)
                        pm["cache_write"] += usage.get("cache_creation_input_tokens", 0)
                        pm["msgs"]        += 1

        total_cost = 0.0
        totals = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "msgs": 0}
        models_used = sorted(per_model.keys())

        for model, v in per_model.items():
            p = PRICING.get(model, DEFAULT_PRICE)
            cost = (
                v["input"]       * p["input"]       +
                v["output"]      * p["output"]       +
                v["cache_write"] * p["cache_write"]  +
                v["cache_read"]  * p["cache_read"]
            ) / 1_000_000
            total_cost += cost
            for k in totals:
                totals[k] += v[k]

        label = f"{agent_name} [{team_name}]" if agent_name else f"orquestador/{session_id}"
        results.append({
            "label":      label,
            "session_id": session_id,
            "agent":      agent_name,
            "team":       team_name,
            "models":     models_used,
            "msgs":       totals["msgs"],
            "input":      totals["input"],
            "output":     totals["output"],
            "cache_read": totals["cache_read"],
            "cache_write":totals["cache_write"],
            "cost_usd":   round(total_cost, 2),
        })

    results.sort(key=lambda x: x["cost_usd"], reverse=True)
    return results


def fmt(n):
    return f"{n:,}"


def main():
    rows = parse_sessions()

    grand = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "msgs": 0, "cost_usd": 0.0}
    for r in rows:
        for k in grand:
            grand[k] += r[k]
    grand["cost_usd"] = round(grand["cost_usd"], 2)

    output = {
        "rows": rows,
        "totals": grand,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pricing_note": "USD estimates: Sonnet $3/$15 · Opus $15/$75 per M input/output tokens",
    }

    if "--json" in sys.argv:
        print(json.dumps(output, indent=2))
        return

    if "--patch-html" in sys.argv:
        idx = sys.argv.index("--patch-html")
        html_path = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else "docs/progress.html"
        patch_html(html_path, output)
        return

    # Terminal table
    print(f"\n{'Agente':<32} {'Modelo(s)':<22} {'Output':>9} {'CacheR':>12} {'CacheW':>10} {'Msgs':>5} {'USD est.':>9}")
    print("─" * 105)
    for r in rows:
        m = ", ".join(r["models"])
        print(f"{r['label']:<32} {m:<22} {fmt(r['output']):>9} {fmt(r['cache_read']):>12} {fmt(r['cache_write']):>10} {r['msgs']:>5,} ${r['cost_usd']:>8.2f}")

    print("─" * 105)
    print(f"{'TOTAL':<56} {fmt(grand['output']):>9} {fmt(grand['cache_read']):>12} {fmt(grand['cache_write']):>10} {grand['msgs']:>5,} ${grand['cost_usd']:>8.2f}")
    print(f"\nGenerado: {output['generated_at']}")
    print(f"Nota: {output['pricing_note']}")
    print(f"Nota: precios al {_PRICING_DATE} — verificar anthropic.com/pricing si el reporte parece incorrecto.")


def patch_html(html_path: str, data: dict) -> None:
    """Inject fresh JSON data into the <script id="token-data"> block in the HTML file."""
    import re as _re
    try:
        with open(html_path, "r") as f:
            html = f.read()
    except FileNotFoundError:
        print(f"[token-stats] HTML not found: {html_path}", file=sys.stderr)
        return

    new_json = json.dumps(data, separators=(",", ":"))
    pattern = r'(<script id="token-data" type="application/json">\n)([^\n]+)(\n</script>)'
    new_html, n = _re.subn(pattern, lambda m: m.group(1) + new_json + m.group(3), html)

    if n == 0:
        print("[token-stats] token-data script block not found in HTML", file=sys.stderr)
        return

    with open(html_path, "w") as f:
        f.write(new_html)
    print(f"[token-stats] Patched {html_path} ({data['generated_at']})")


if __name__ == "__main__":
    main()
