#!/usr/bin/env python3
"""
Forge v2 — PreToolUse hook: pre-bash-check.py
Bloquea comandos destructivos en contexto de producción.

Contexto crítico: el 2026-04-28, --force-reset fue ejecutado accidentalmente
contra la base de datos de producción de un proyecto real, borrando 225 usuarios
y 35 formularios (recuperados desde backup de Supabase Pro). Este hook existe
para que eso nunca vuelva a pasar.
"""

import json
import os
import re
import sys


DEBUG = os.environ.get("DEBUG", "") not in ("", "0", "false", "False")


def dbg(msg):
    if DEBUG:
        print(f"[forge-hook-debug] {msg}", flush=True)


def load_project_yaml():
    """Walk up from cwd to find project.yaml. Returns dict or {}."""
    try:
        import yaml
        path = os.getcwd()
        for _ in range(6):
            candidate = os.path.join(path, "project.yaml")
            if os.path.isfile(candidate):
                with open(candidate) as f:
                    data = yaml.safe_load(f)
                    return data if isinstance(data, dict) else {}
            parent = os.path.dirname(path)
            if parent == path:
                break
            path = parent
    except Exception as e:
        dbg(f"project.yaml load error: {e}")
    return {}


# ---------------------------------------------------------------------------
# Patrones peligrosos hardcodeados
# ---------------------------------------------------------------------------

DANGEROUS_PATTERNS = [
    (r"--force-reset",                              "--force-reset"),
    (r"prisma\s+migrate\s+reset",                  "prisma migrate reset"),
    (r"DROP\s+TABLE",                              "DROP TABLE"),
    (r"TRUNCATE\s+",                               "TRUNCATE"),
    (r"DELETE\s+FROM\s+\w+\s*;",                   "DELETE FROM sin WHERE"),
    (r"DROP\s+DATABASE",                           "DROP DATABASE"),
    (r"dropdb\s+",                                  "dropdb"),
    (r"rm\s+-rf\s+/",                               "rm -rf /"),
    (r"git\s+push\s+--force(?!\s+--with-lease)",   "git push --force sin --with-lease"),
]


def _match_dangerous(command: str) -> tuple[bool, str]:
    """Retorna (matched, pattern_label). Verifica patrones hardcodeados."""
    for pattern, label in DANGEROUS_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return True, label
    return False, ""


def _match_project_forbidden(command: str, project: dict) -> tuple[bool, str]:
    """Verifica patrones forbidden_in_production del project.yaml."""
    try:
        rules = project.get("rules", {})
        forbidden = rules.get("forbidden_in_production", [])
        if not isinstance(forbidden, list):
            return False, ""
        for pattern in forbidden:
            if re.search(pattern, command):
                return True, pattern
    except Exception as e:
        dbg(f"project.yaml forbidden_in_production error: {e}")
    return False, ""


def _is_production_context(command: str, project: dict) -> bool:
    """
    Retorna True si el comando se ejecuta en contexto de producción:
    - La URL de producción aparece en el comando, o
    - Variables de entorno PROD_* / PRODUCTION_* están seteadas en el proceso.
    """
    # URL de producción del project.yaml
    deploy = project.get("deploy", {})
    prod_url = deploy.get("production_url", "") or ""
    project_id = deploy.get("project_id", "") or ""

    if prod_url and prod_url in command:
        dbg(f"production context: URL '{prod_url}' encontrada en comando")
        return True
    if project_id and project_id in command:
        dbg(f"production context: project_id '{project_id}' encontrado en comando")
        return True

    # Variables de entorno que sugieren contexto de producción
    prod_env_patterns = re.compile(r"^(PROD_|PRODUCTION_|PROD$|PRODUCTION$)", re.IGNORECASE)
    for key, value in os.environ.items():
        if prod_env_patterns.match(key) and value:
            dbg(f"production context: env var '{key}' activa")
            return True

    return False


def _extract_snippet(command: str, max_len: int = 120) -> str:
    """Retorna un extracto legible del comando."""
    command = command.strip()
    if len(command) <= max_len:
        return command
    return command[:max_len] + "..."


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            dbg("empty stdin, allowing")
            sys.exit(0)
        data = json.loads(raw)
    except Exception as e:
        dbg(f"stdin parse error: {e}")
        sys.exit(0)

    try:
        tool_name = data.get("tool_name", "")
        if tool_name != "Bash":
            sys.exit(0)

        tool_input = data.get("tool_input", {})
        command = tool_input.get("command", "")
        if not command:
            sys.exit(0)

        dbg(f"command: {command[:200]!r}")

        project = load_project_yaml()

        # Verificar patrones peligrosos hardcodeados
        matched, pattern_label = _match_dangerous(command)

        # Verificar patrones custom del project.yaml
        if not matched:
            matched, pattern_label = _match_project_forbidden(command, project)

        if not matched:
            sys.exit(0)

        # Hay un patrón peligroso — ¿es contexto de producción?
        in_production = _is_production_context(command, project)

        snippet = _extract_snippet(command)

        if in_production:
            # BLOQUEAR
            print(
                f"forge: BLOQUEADO — comando destructivo detectado en contexto de producción.\n"
                f"\n"
                f"  Comando: {snippet}\n"
                f"  Patrón: {pattern_label}\n"
                f"\n"
                f"  Si necesitás ejecutar esto, hacelo MANUALMENTE en la terminal\n"
                f"  con plena consciencia de que afecta producción.\n"
                f"\n"
                f"  Lección del 2026-04-28: --force-reset borró 225 usuarios y\n"
                f"  35 formularios en producción. Este hook existe por eso.",
                flush=True,
            )
            sys.exit(2)
        else:
            # ADVERTIR — no bloquear
            print(
                f"forge: ADVERTENCIA — comando potencialmente destructivo detectado.\n"
                f"\n"
                f"  Comando: {snippet}\n"
                f"  Patrón: {pattern_label}\n"
                f"\n"
                f"  Si esto apunta a producción, cancela y ejecuta manualmente.\n"
                f"  Confirmá que el contexto es seguro antes de continuar.",
                flush=True,
            )
            sys.exit(0)

    except Exception as e:
        dbg(f"unexpected error: {e}")
        sys.exit(0)


if __name__ == "__main__":
    main()
