#!/usr/bin/env python3
"""
Genera CLAUDE.md para un proyecto usando forge.

Usage:
  python3 .agentic/adapters/claude-code/generate-claude-md.py

Lee project.yaml en la raíz y genera CLAUDE.md adaptado al stack del proyecto.
Si ya existe un CLAUDE.md, muestra el diff antes de sobreescribir.

Requiere: pyyaml
"""
import os
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml requerido. pip install pyyaml", file=sys.stderr)
    sys.exit(1)


def find_project_root() -> Path:
    here = Path.cwd()
    for p in [here] + list(here.parents):
        if (p / "project.yaml").exists():
            return p
    raise FileNotFoundError("No se encontró project.yaml")


def generate_claude_md(config: dict) -> str:
    proj = config.get("project", {})
    stack = config.get("stack", {})
    team = config.get("team", {})
    compliance_cfg = config.get("compliance", {})
    agents_cfg = config.get("agents", {})
    paths = config.get("paths", {})

    name = proj.get("name", "Mi Proyecto")
    description = proj.get("description", "")
    language = proj.get("language", "typescript")
    backend = stack.get("backend") or "N/A"
    frontend = stack.get("frontend") or "N/A"
    database = stack.get("database") or "N/A"
    frameworks = compliance_cfg.get("frameworks", [])
    specs_path = paths.get("specs", "docs/specs")
    progress_path = paths.get("progress", "docs/progress.html")

    # Agentes activos
    active = agents_cfg.get("active", [])

    # Comandos según lenguaje
    if language == "typescript":
        dev_cmd = "pnpm dev"
        test_cmd = "pnpm test"
        lint_cmd = "pnpm lint"
        build_cmd = "pnpm build"
    elif language == "python":
        dev_cmd = "python manage.py runserver  # o uvicorn main:app"
        test_cmd = "pytest"
        lint_cmd = "ruff check ."
        build_cmd = "# no aplica"
    elif language == "ruby":
        dev_cmd = "rails server"
        test_cmd = "bundle exec rspec"
        lint_cmd = "rubocop"
        build_cmd = "# no aplica"
    elif language == "go":
        dev_cmd = "go run ./cmd/..."
        test_cmd = "go test ./..."
        lint_cmd = "golangci-lint run"
        build_cmd = "go build ./..."
    else:
        dev_cmd = "# ver documentación del proyecto"
        test_cmd = "# ver documentación del proyecto"
        lint_cmd = "# ver documentación del proyecto"
        build_cmd = "# ver documentación del proyecto"

    compliance_section = ""
    if frameworks:
        compliance_section = f"""
## Compliance activo

Este proyecto opera bajo los siguientes marcos regulatorios:
{chr(10).join(f'- **{f.upper()}**' for f in frameworks)}

Reglas no-negociables:
- Sin datos personales en logs de stdout
- Consentimiento explícito antes de cualquier tracker no esencial
- Logs de auditoría append-only (sin UPDATE/DELETE)
- Derechos del titular implementados (acceso, rectificación, supresión, oposición, portabilidad)
"""

    return f"""# CLAUDE.md — {name}

> Generado por forge. Actualizar project.yaml para cambiar la configuración.
> Si actualizás el código de manera que invalide algo aquí, actualizá este archivo en el mismo PR.

## Misión del proyecto

{description}

## Stack

- **Lenguaje**: {language}
- **Backend**: {backend}
- **Frontend**: {frontend}
- **Base de datos**: {database}
- **Testing**: {", ".join(stack.get("testing", []))}

## Estructura

```
{proj.get("slug", "proyecto")}/
├── CLAUDE.md                    ← Estás acá
├── AGENTS.md                    ← Convenciones del agent team
├── project.yaml                 ← Config de forge (fuente de verdad)
├── {specs_path}/                ← Specs de features (requeridas antes de implementar)
└── {progress_path}              ← Dashboard de progreso del proyecto
```

## Cómo trabajar (SDD)

Cuando recibás una tarea:

1. **Identificá la spec.** Si no está en `{specs_path}/`, pará y pedí que se cree.
2. **Leé la spec correspondiente.**
3. **Leé el `CLAUDE.md` del módulo** que vas a modificar (si existe).
4. **Proponé opciones** para decisiones arquitectónicas no cubiertas por la spec.
5. **Esperá aprobación** antes de generar código.
6. **Tests** junto con la implementación, no al final.
7. **Al terminar**, actualizá la spec con decisiones tomadas durante la implementación.
8. **Antes de cerrar**: `{test_cmd}`, `{lint_cmd}`.
{compliance_section}
## Phases activas y estado

- **Sprint actual:** Sprint 1
- **Completadas:** —
- **En curso:** —
- **Pendientes:** —

> Actualizar esta sección al inicio y final de cada sprint.

## Comandos frecuentes

```bash
{dev_cmd}     # Desarrollo
{test_cmd}    # Tests
{lint_cmd}    # Lint
{build_cmd}   # Build
```

## Qué NO hacer

- No implementar sin spec en `{specs_path}/`
- No hardcodear tokens, passwords o secrets
- No usar `any` en TypeScript sin comentario que explique por qué
- No commits con `console.log` o `print` de depuración
- No hacer force push a main/master
"""


def main():
    try:
        root = find_project_root()
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    with open(root / "project.yaml") as f:
        config = yaml.safe_load(f)

    content = generate_claude_md(config)
    output_path = root / "CLAUDE.md"

    if output_path.exists():
        print(f"CLAUDE.md ya existe en {root}. Sobreescribir? [s/N] ", end="")
        resp = input().strip().lower()
        if resp not in ("s", "si", "sí", "y", "yes"):
            print("Cancelado.")
            sys.exit(0)

    with open(output_path, "w") as f:
        f.write(content)

    print(f"CLAUDE.md generado en {output_path}")


if __name__ == "__main__":
    main()
