#!/usr/bin/env python3
"""
forge-migrate-project-yaml.py — Migra un project.yaml de v1 a v2 de Forge.

Usage:
    python3 .agentic/scripts/forge-migrate-project-yaml.py
    python3 .agentic/scripts/forge-migrate-project-yaml.py --dry-run
    python3 .agentic/scripts/forge-migrate-project-yaml.py --backup

Detecta si el project.yaml es v1 (sin secciones 'deploy' estructurado, 'rules', 'mcp', 'github')
y agrega las secciones nuevas preservando todos los valores existentes.

Exit codes:
    0 — migración exitosa (o ya era v2)
    1 — error
"""

import sys
import os
import re
import shutil
import argparse
from pathlib import Path
from typing import Any, Optional, Tuple


# ---------------------------------------------------------------------------
# Búsqueda de project.yaml
# ---------------------------------------------------------------------------

def find_project_yaml(start: Path) -> Optional[Path]:
    current = start.resolve()
    while True:
        candidate = current / "project.yaml"
        if candidate.exists():
            return candidate
        parent = current.parent
        if parent == current:
            return None
        current = parent


# ---------------------------------------------------------------------------
# Carga YAML
# ---------------------------------------------------------------------------

def load_yaml_raw(path: Path) -> Tuple[dict, str]:
    """
    Carga el YAML y retorna (data, raw_text).
    Requiere pyyaml.
    """
    try:
        import yaml
    except ImportError:
        print("ERROR: pyyaml no está instalado. Instalarlo con: pip install pyyaml")
        sys.exit(1)

    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()

    data = yaml.safe_load(raw)
    return (data if data is not None else {}), raw


# ---------------------------------------------------------------------------
# Detección de versión
# ---------------------------------------------------------------------------

def detect_version(data: dict) -> str:
    """
    Detecta si el project.yaml es v1 o v2.
    Criterio: si tiene 'rules' O 'mcp' O 'github' O 'project.mode' → es v2.
    """
    if "rules" in data or "mcp" in data or "github" in data:
        return "2"
    project = data.get("project", {}) or {}
    if "mode" in project:
        return "2"
    return "1"


# ---------------------------------------------------------------------------
# Generador del bloque v2 en YAML comentado
# ---------------------------------------------------------------------------

V2_ADDITIONS = """\
# ---------------------------------------------------------------------------
# schema_version: "2"
# Las siguientes secciones fueron agregadas por forge-migrate-project-yaml.py
# ---------------------------------------------------------------------------

# nuevo en v2: modo operativo del proyecto
# Si ya existe project.mode, puedes ignorar este comentario.

agents:
  # nuevo en v2: mapeo rol → modelo específico de Claude
  by_role:
    orchestrator: null          # ej: claude-opus-4-7
    senior-backend: null        # ej: claude-sonnet-4-6

deploy:
  # nuevo en v2
  provider: null                # vercel | railway | fly | aws | github-actions | custom | null
  project_id: null              # ID del proyecto en la plataforma (ej: prj_xxx en Vercel)
  production_url: null          # https://mi-proyecto.vercel.app
  smoke_tests: []               # Tests de humo post-deploy
  # Ejemplo:
  # smoke_tests:
  #   - url: /api/health
  #     expect_status: 200
  #     expect_json:
  #       status: ok
  #   - url: https://mi-proyecto.vercel.app
  #     expect_status: 200

mcp:
  # nuevo en v2: servidores MCP del proyecto
  servers: []
  # Ejemplo:
  # servers:
  #   - name: supabase
  #     auto_approve:
  #       - list_tables
  #       - execute_sql

github:
  # nuevo en v2: integración con GitHub Projects
  project:
    number: null                # Número del GitHub Project
    owner: null                 # usuario u organización
    repo: null                  # nombre del repositorio
    status_field_id: null       # ID del campo Status
    status_in_progress: null    # ej: "In Progress"
    status_done: null           # ej: "Done"

rules:
  # nuevo en v2: guardrails del proyecto
  forbidden_in_production:
    - "console.log"             # eliminar logs de debug en producción
    - "TODO:"                   # no dejar TODOs sin resolver
    - "FIXME:"
  required_review_before_ship: false
  require_spec_before_implementation: false
  conventional_commits: true
  forbidden_patterns: []        # regex evaluadas por el hook pre-edit-check
  # Ejemplo:
  # forbidden_patterns:
  #   - "process\\.env\\.[A-Z_]+\\s*=\\s*['\\\"][^'\\\"]+['\\\"]"  # hardcoded env values

scripts:
  # nuevo en v2: comando ejecutado por post-turn-check.sh
  check: null                   # ej: "pnpm typecheck && pnpm lint"
"""


def build_v2_yaml(data: dict, raw: str) -> str:
    """
    Construye el YAML v2 completo.
    Estrategia: agrega un encabezado de schema_version y las secciones nuevas al final,
    preservando el contenido original.

    Para las secciones que ya existen en el original (como 'deploy' con solo 'provider' y 'branch'),
    se hace un merge inteligente para no duplicar.
    """
    try:
        import yaml
    except ImportError:
        print("ERROR: pyyaml no está instalado.")
        sys.exit(1)

    # Secciones que ya existen en el YAML original
    existing_sections = set(data.keys())

    lines_to_add = []

    # Encabezado
    lines_to_add.append("# ---------------------------------------------------------------------------")
    lines_to_add.append('# schema_version: "2"')
    lines_to_add.append("# Las siguientes secciones fueron agregadas por forge-migrate-project-yaml.py")
    lines_to_add.append("# ---------------------------------------------------------------------------")
    lines_to_add.append("")

    # project.mode — agregar si no existe
    project = data.get("project", {}) or {}
    needs_project_mode = "mode" not in project

    # agents.by_role — agregar si agents existe pero no tiene by_role
    agents = data.get("agents", {}) or {}
    needs_agents_by_role = "agents" in existing_sections and "by_role" not in agents

    # Secciones completamente nuevas
    needs_deploy_new_fields = True  # siempre agregar campos nuevos de deploy
    needs_mcp = "mcp" not in existing_sections
    needs_github = "github" not in existing_sections
    needs_rules = "rules" not in existing_sections
    needs_scripts = "scripts" not in existing_sections

    # --- project.mode patch ---
    if needs_project_mode:
        lines_to_add.append("# ACCIÓN REQUERIDA: Agrega 'mode' a la sección project arriba.")
        lines_to_add.append("# Valores: startup | standard | enterprise")
        lines_to_add.append("# Ejemplo:")
        lines_to_add.append("#   project:")
        lines_to_add.append('#     mode: "standard"')
        lines_to_add.append("")

    # --- agents.by_role ---
    if needs_agents_by_role:
        lines_to_add.append("# nuevo en v2 — agregar bajo la sección agents existente:")
        lines_to_add.append("# agents:")
        lines_to_add.append("#   by_role:")
        lines_to_add.append("#     orchestrator: claude-opus-4-7")
        lines_to_add.append("#     senior-backend: claude-sonnet-4-6")
        lines_to_add.append("")

    # --- deploy (campos nuevos de v2) ---
    deploy = data.get("deploy", {}) or {}
    existing_deploy_keys = set(deploy.keys()) if isinstance(deploy, dict) else set()
    deploy_new_fields = []

    if "project_id" not in existing_deploy_keys:
        deploy_new_fields.append("  project_id: null              # ID del proyecto en la plataforma (ej: prj_xxx en Vercel)")
    if "production_url" not in existing_deploy_keys:
        deploy_new_fields.append("  production_url: null          # https://mi-proyecto.vercel.app")
    if "smoke_tests" not in existing_deploy_keys:
        deploy_new_fields.append("  smoke_tests: []               # Tests de humo post-deploy")
        deploy_new_fields.append("  # Ejemplo de smoke test:")
        deploy_new_fields.append("  # smoke_tests:")
        deploy_new_fields.append("  #   - url: /api/health")
        deploy_new_fields.append("  #     expect_status: 200")
        deploy_new_fields.append("  #     expect_json:")
        deploy_new_fields.append("  #       status: ok")

    if deploy_new_fields:
        if "deploy" in existing_sections:
            lines_to_add.append("# nuevo en v2 — campos adicionales para la sección deploy existente:")
            lines_to_add.append("# (agregar manualmente bajo la sección deploy arriba)")
            for line in deploy_new_fields:
                lines_to_add.append("# " + line.lstrip())
        else:
            lines_to_add.append("")
            lines_to_add.append("deploy:  # nuevo en v2")
            if "provider" not in existing_deploy_keys:
                lines_to_add.append("  provider: null              # vercel | railway | fly | aws | github-actions | custom | null")
            lines_to_add.extend(deploy_new_fields)
        lines_to_add.append("")

    # --- mcp ---
    if needs_mcp:
        lines_to_add.append("mcp:  # nuevo en v2")
        lines_to_add.append("  servers: []")
        lines_to_add.append("  # Ejemplo:")
        lines_to_add.append("  # servers:")
        lines_to_add.append("  #   - name: supabase")
        lines_to_add.append("  #     auto_approve:")
        lines_to_add.append("  #       - list_tables")
        lines_to_add.append("  #       - execute_sql")
        lines_to_add.append("")

    # --- github ---
    if needs_github:
        lines_to_add.append("github:  # nuevo en v2")
        lines_to_add.append("  project:")
        lines_to_add.append("    number: null                # Número del GitHub Project")
        lines_to_add.append("    owner: null                 # usuario u organización")
        lines_to_add.append("    repo: null                  # nombre del repositorio")
        lines_to_add.append("    status_field_id: null       # ID del campo Status")
        lines_to_add.append('    status_in_progress: null    # ej: "In Progress"')
        lines_to_add.append('    status_done: null           # ej: "Done"')
        lines_to_add.append("")

    # --- rules ---
    if needs_rules:
        lines_to_add.append("rules:  # nuevo en v2")
        lines_to_add.append("  forbidden_in_production:")
        lines_to_add.append('    - "console.log"')
        lines_to_add.append('    - "TODO:"')
        lines_to_add.append('    - "FIXME:"')
        lines_to_add.append("  required_review_before_ship: false")
        lines_to_add.append("  require_spec_before_implementation: false")
        lines_to_add.append("  conventional_commits: true")
        lines_to_add.append("  forbidden_patterns: []")
        lines_to_add.append("")

    # --- scripts ---
    if needs_scripts:
        lines_to_add.append("scripts:  # nuevo en v2")
        lines_to_add.append('  check: null                   # ej: "pnpm typecheck && pnpm lint"')
        lines_to_add.append("")

    if not lines_to_add or all(l == "" for l in lines_to_add):
        return raw  # nada que agregar

    # Construir resultado final
    additions = "\n".join(lines_to_add)
    result = raw.rstrip("\n") + "\n\n" + additions
    return result


# ---------------------------------------------------------------------------
# Diff simple
# ---------------------------------------------------------------------------

def show_diff(original: str, new: str):
    """Muestra un diff básico entre el contenido original y el nuevo."""
    orig_lines = original.splitlines(keepends=True)
    new_lines = new.splitlines(keepends=True)

    import difflib
    diff = difflib.unified_diff(
        orig_lines, new_lines,
        fromfile="project.yaml (v1)",
        tofile="project.yaml (v2)",
        lineterm=""
    )
    diff_text = "".join(diff)
    if diff_text:
        print(diff_text)
    else:
        print("(sin cambios)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Migra project.yaml de v1 a v2 de Forge"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra el diff sin escribir cambios"
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Crea project.yaml.bak antes de modificar"
    )
    args = parser.parse_args()

    # Buscar project.yaml
    project_yaml_path = find_project_yaml(Path.cwd())
    if project_yaml_path is None:
        print("ERROR: No se encontró project.yaml en el directorio actual ni superiores")
        sys.exit(1)

    print(f"Leyendo: {project_yaml_path}")

    # Cargar
    data, raw = load_yaml_raw(project_yaml_path)

    # Detectar versión
    version = detect_version(data)
    if version == "2":
        print("El project.yaml ya está en v2 (contiene secciones 'rules', 'mcp', 'github' o 'project.mode').")
        print("No se requiere migración.")
        sys.exit(0)

    print(f"Versión detectada: v{version} → migrando a v2...")
    print()

    # Construir nuevo contenido
    new_content = build_v2_yaml(data, raw)

    if args.dry_run:
        print("--- DRY RUN: mostrando diff (no se escribirán cambios) ---")
        print()
        show_diff(raw, new_content)
        sys.exit(0)

    # Backup
    if args.backup:
        backup_path = project_yaml_path.with_suffix(".yaml.bak")
        shutil.copy2(project_yaml_path, backup_path)
        print(f"Backup creado: {backup_path}")

    # Escribir
    with open(project_yaml_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"Migración completada: {project_yaml_path}")
    print()
    print("Próximos pasos:")
    print("  1. Revisa el archivo y completa los campos null con valores reales")
    print("  2. Agrega project.mode (startup | standard | enterprise) si no está")
    print("  3. Valida con: python3 .agentic/scripts/forge-validate-project-yaml.py")
    print()

    # Mostrar diff informativo
    print("--- Cambios aplicados ---")
    show_diff(raw, new_content)


if __name__ == "__main__":
    main()
