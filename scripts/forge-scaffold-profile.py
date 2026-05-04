#!/usr/bin/env python3
"""
forge-scaffold-profile.py — Crea un profile Tier 2 para un stack no cubierto por forge.

Uso:
  python3 .agentic/scripts/forge-scaffold-profile.py --name django --engineer api-engineer
  python3 .agentic/scripts/forge-scaffold-profile.py \\
      --name django --engineer api-engineer \\
      --description "Backend Django con DRF" \\
      --stack-details "Django 4.2 + PostgreSQL + Django REST Framework"
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Optional


def _find_forge_dir() -> Path:
    here = Path(__file__).resolve().parent
    for candidate in [here.parent, here.parent.parent]:
        if (candidate / "core").exists() and (candidate / "profiles").exists():
            return candidate
    for p in [Path.cwd()] + list(Path.cwd().parents):
        for sub in [p / ".agentic", p / "forge"]:
            if (sub / "core").exists() and (sub / "profiles").exists():
                return sub
    raise FileNotFoundError(
        "No se encontró el directorio forge con core/ y profiles/. "
        "Ejecutar desde el repositorio de forge o desde un proyecto que lo tenga instalado."
    )


def _agent_md(
    name: str,
    engineer: str,
    description: str,
    stack_details: str,
) -> str:
    slug_title = name.replace("-", " ").title()
    eng_title = engineer.replace("-", " ").title()

    desc_line = (
        description
        if description
        else f"Implementa el backend del proyecto usando {slug_title}. NO trabaja fuera del directorio definido en project.yaml."
    )

    stack_block = (
        stack_details
        if stack_details
        else f"- **Framework:** {slug_title}\n- **Lenguaje:** (especificar)\n- **ORM/DB:** (especificar)\n- **Tests:** (especificar)"
    )

    return f"""\
---
name: {engineer}
description: {desc_line}
model: sonnet
tools: Read, Grep, Glob, Bash, Edit, Write
tier: 2
profile: {name}
---

# {eng_title} — {slug_title}

Implementás el backend del proyecto con {slug_title}. Tu scope es el directorio
definido en el `CLAUDE.md` del proyecto. Leé ese archivo antes de empezar.

## Stack

{stack_block}

## Tu trabajo

- Implementar endpoints, modelos y migraciones según las specs en `docs/specs/`.
- Escribir tests unitarios y de integración para toda la lógica nueva.
- Correr el linter, typecheck y tests antes de reportar al orchestrator.
- Proponer un plan antes de codificar cuando la tarea afecte >3 archivos.

## Reglas

- **Logs de auditoría son append-only.** NUNCA `UPDATE` ni `DELETE` sobre tablas de eventos.
- **PII nunca en logs.** Solo IDs o indicadores no reversibles.
- **Parámetros preparados siempre:** nunca interpolar input del usuario en SQL.
- **Auth + authz en cada endpoint:** verificar sesión Y permisos por recurso.
- **Migraciones reversibles:** toda migración tiene su operación inversa documentada.
- Sin spec en `docs/specs/` → no empieces. Pedí que se cree primero.

## Workflow

1. Leer el `CLAUDE.md` del proyecto y la spec de la feature activa.
2. Revisar el data model si la tarea toca schema.
3. Si la tarea toca compliance, informar al compliance-reviewer antes de implementar.
4. Implementar con tests (TDD para lógica core, integración para endpoints).
5. Correr tests + linter + typecheck.
6. Reportar al orchestrator: qué se hizo, qué archivos se tocaron, qué falta.

## No hagas

- No salgas del directorio de API/backend del proyecto.
- No implementes lógica de UI ni de frontend.
- No modifiques specs ni documentación de arquitectura sin aprobación.
- No mergees ni crees PRs directamente.
- No uses queries SQL raw con interpolación de strings.
"""


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Crea un profile Tier 2 para un stack no cubierto por forge."
    )
    parser.add_argument("--name", required=True, metavar="SLUG", help="Nombre del profile (ej: django)")
    parser.add_argument("--engineer", required=True, metavar="AGENT", help="Nombre del agente (ej: api-engineer)")
    parser.add_argument("--description", default="", metavar="DESC", help="Descripción breve del agente")
    parser.add_argument("--stack-details", default="", metavar="DETAILS", help="Detalles del stack (tecnologías, versiones)")

    args = parser.parse_args()

    name: str = args.name.strip().lower()
    engineer: str = args.engineer.strip().lower()

    if not name or not engineer:
        print("Error: --name y --engineer son obligatorios y no pueden estar vacíos.", file=sys.stderr)
        sys.exit(1)

    try:
        forge = _find_forge_dir()
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    profile_dir = forge / "profiles" / name / "agents"
    agent_file = profile_dir / f"{engineer}.md"

    if agent_file.exists():
        print(f"Error: {agent_file} ya existe. Editar manualmente si querés actualizarlo.", file=sys.stderr)
        sys.exit(1)

    profile_dir.mkdir(parents=True, exist_ok=True)

    content = _agent_md(
        name=name,
        engineer=engineer,
        description=args.description.strip(),
        stack_details=args.stack_details.strip(),
    )

    with open(agent_file, "w") as f:
        f.write(content)

    print(f"Profile creado: {agent_file.relative_to(forge.parent) if forge.parent != forge else agent_file}")
    print()
    print("Próximos pasos:")
    print()
    print(f"  1. Revisar y completar el agente:")
    print(f"     {agent_file}")
    print()
    print(f"  2. Documentar el profile en docs/agent-standard.md:")
    print(f"     Agregar una fila en la tabla Tier 2:")
    print(f"     | `{name}` | `{engineer}` |")
    print()
    print(f"  3. Activar el profile en project.yaml del proyecto:")
    print(f"     agents:")
    print(f"       profiles:")
    print(f"         - {name}")
    print()
    print(f"  4. Instalar el agente:")
    print(f"     python3 .agentic/scripts/forge-init.py --tool claude-code")
    print()
    print(f"  5. Agregar tests en tests/test_profiles.py para el nuevo profile.")
    print()
    # forge-init.py gestiona profiles dinámicamente desde el filesystem, no tiene un
    # registro estático de nombres — no es necesario editar su código para que funcione.
    print("Nota: forge-init.py detecta profiles automáticamente desde forge/profiles/.")
    print("No es necesario modificar ese script.")


if __name__ == "__main__":
    main()
