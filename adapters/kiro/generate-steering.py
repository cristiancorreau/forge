#!/usr/bin/env python3
# Copyright 2026 Cristian Correa — Apache License 2.0
# https://github.com/cristiancorreau/forge
"""
generate-steering.py — Genera archivos .kiro/steering/ para Kiro IDE.

Usage:
  python3 .agentic/adapters/kiro/generate-steering.py

Lee project.yaml en la raíz y genera los steering files de Kiro:
  .kiro/steering/product.md    ← descripción del producto y stack
  .kiro/steering/structure.md  ← estructura del proyecto, workflow SDD y flujo de sesión Forge v2
  .kiro/steering/agents.md     ← roster de agentes y sus responsabilidades
  .kiro/steering/commands.md   ← 6 comandos Forge para contexto del agente Kiro
  .kiro/steering/compliance.md ← reglas de compliance (si hay frameworks activos)
  .kiro/hooks/pre-edit-branch-guard.json ← hook que bloquea ediciones directas en main/master

Kiro usa estos archivos como contexto persistente en todas las conversaciones.

Requiere: pyyaml
"""
from __future__ import annotations

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


def find_forge_dir() -> Path:
    root = find_project_root()
    for candidate in [root / ".agentic", root / "forge", Path(__file__).parent.parent.parent]:
        if (candidate / "core").exists():
            return candidate
    raise FileNotFoundError("No se encontró el directorio forge con core/")


def write_file(path: Path, content: str, force: bool = False) -> str:
    if path.exists() and not force:
        return "KEEP"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return "OK"


def generate_product_md(config: dict) -> str:
    proj = config.get("project", {})
    stack = config.get("stack", {})
    team = config.get("team", {})

    return f"""# {proj.get('name', 'Mi Proyecto')}

{proj.get('description', '')}

## Stack

- **Lenguaje:** {proj.get('language', 'typescript')}
- **Backend:** {stack.get('backend') or 'N/A'}
- **Frontend:** {stack.get('frontend') or 'N/A'}
- **Base de datos:** {stack.get('database') or 'N/A'}
- **Cache:** {stack.get('cache') or 'N/A'}
- **Testing:** {', '.join(stack.get('testing', []))}

## Estado del proyecto

- **Status:** {proj.get('status', 'active')}
- **Equipo:** {team.get('name', 'Equipo Principal')}
"""


def generate_structure_md(config: dict) -> str:
    proj = config.get("project", {})
    paths = config.get("paths", {})
    specs_path = paths.get("specs", "docs/specs")
    language = proj.get("language", "typescript")

    cmd_map = {
        "typescript": ("pnpm dev", "pnpm test", "pnpm lint"),
        "python":     ("uvicorn main:app --reload  # o python manage.py runserver", "pytest", "ruff check ."),
        "ruby":       ("rails server", "bundle exec rspec", "rubocop"),
        "go":         ("go run ./cmd/...", "go test ./...", "golangci-lint run"),
        "php":        ("php artisan serve", "vendor/bin/phpunit", "vendor/bin/phpstan analyse"),
    }
    dev_cmd, test_cmd, lint_cmd = cmd_map.get(language, ("# ver docs del proyecto",) * 3)

    return f"""# Estructura del proyecto

## Workflow: Spec-Driven Development (SDD)

Antes de implementar cualquier feature:

1. Verificar que existe una spec en `{specs_path}/`.
2. Si no existe, crear la spec y obtener aprobación antes de codificar.
3. Implementar con tests junto al código, no al final.
4. Actualizar la spec con decisiones tomadas durante la implementación.

## Flujo de sesión — Forge v2

Cada sesión de trabajo sigue este orden:

```
session-start  → Leer AGENTS.md + specs relevantes. Confirmar rama activa.
plan           → Descomponer la tarea. Identificar spec. Presentar opciones si hay decisiones abiertas.
work           → Implementar con tests. Un agente por scope. Actualizar spec si hay desvíos.
review         → Lint + tests verdes. Compliance review si toca PII o auth.
ship           → PR abierto, CI verde. No mergear sin revisión si >5 archivos del mismo módulo.
session-close  → Reportar cambios, decisiones tomadas y próximos pasos.
```

## Comandos frecuentes

```bash
{dev_cmd}     # Desarrollo
{test_cmd}    # Tests
{lint_cmd}    # Lint
```

## Reglas no-negociables

- Sin hardcodear tokens, passwords ni secrets.
- Parámetros preparados en todas las queries SQL — nunca concatenar input del usuario.
- PII nunca en logs de stdout.
- Auth + authz verificados en cada endpoint.
- Sin force push a main/master.
"""


def generate_agents_md(config: dict) -> str:
    agents_cfg = config.get("agents", {})
    compliance_cfg = config.get("compliance", {})

    active = agents_cfg.get("active", [])
    compliance = agents_cfg.get("compliance", [])
    specialized = agents_cfg.get("specialized", [])
    frameworks = compliance_cfg.get("frameworks", [])

    if frameworks and "compliance-reviewer" not in active + compliance:
        compliance = list(set(compliance + ["compliance-reviewer"]))

    role_descriptions = {
        "orchestrator":        "Coordina al team. Descompone tareas, delega y sintetiza. No implementa código directamente.",
        "backend-engineer":    "Backend — API, base de datos, lógica de negocio.",
        "frontend-engineer":   "Frontend — UI, componentes, integración con API.",
        "api-engineer":        "API — framework HTTP + ORM + lógica de negocio.",
        "admin-engineer":      "Admin dashboard — UI de gestión interna.",
        "mobile-engineer":     "Apps móviles.",
        "fullstack-engineer":  "Features full-stack (backend + frontend).",
        "test-engineer":       "Testing — unitario, integración, E2E.",
        "docs-writer":         "Documentación — specs, ADRs, READMEs.",
        "compliance-reviewer": "Revisa cambios contra marcos regulatorios activos. Tiene poder de veto.",
        "security-auditor":    "Auditoría de seguridad — auth, authz, OWASP Top 10.",
        "scanner-engineer":    "Scanner de cookies y trackers.",
    }

    lines = [
        "# Roster de agentes",
        "",
        "## Reglas operativas",
        "",
        "- El orchestrator coordina; los demás agentes no se comunican directamente entre sí.",
        "- Cada agente respeta su scope — no sale del directorio que le corresponde.",
        "- Specs en `docs/specs/` antes de implementar. Sin spec, sin código.",
        "",
    ]

    if active:
        lines += ["## Agentes activos", ""]
        for name in active:
            desc = role_descriptions.get(name, "Agente de implementación")
            lines.append(f"- **`{name}`** — {desc}")
        lines.append("")

    if compliance:
        lines += ["## Agentes de revisión", ""]
        for name in compliance:
            desc = role_descriptions.get(name, "Agente revisor")
            lines.append(f"- **`{name}`** — {desc}")
        lines.append("")

    if specialized:
        lines += ["## Agentes especializados del proyecto", ""]
        for name in specialized:
            desc = role_descriptions.get(name, "Agente especializado del proyecto")
            lines.append(f"- **`{name}`** — {desc}")
        lines.append("")

    return "\n".join(lines)


def generate_commands_md(config: dict) -> str:
    paths = config.get("paths", {})
    specs_path = paths.get("specs", "docs/specs")

    return f"""# Forge commands — referencia para el agente

Este proyecto usa Forge (framework de agentic development). Los siguientes comandos
son los flujos de trabajo centrales que el agente debe seguir cuando el usuario los invoca.

## new-feature

Inicia la implementación de una nueva feature siguiendo SDD.

1. Si no existe spec para la feature en `{specs_path}/`, crearla primero.
2. Leer la spec antes de proponer cualquier implementación.
3. Proponer el plan y esperar aprobación explícita.
4. Implementar con tests junto a la implementación, no al final.
5. Al terminar, actualizar la spec con las decisiones tomadas.

## review

Revisa el estado actual de la rama activa.

1. Listar archivos modificados (`git diff --name-only main`).
2. Ejecutar tests y lint. Reportar resultados.
3. Verificar que los cambios corresponden a una spec aprobada.
4. Identificar items pendientes antes de poder hacer merge.

## deploy-check

Verifica que el deploy de producción está sano después de un merge.

1. Confirmar que el build de CI pasó.
2. Revisar runtime logs (errores 5xx, excepciones no manejadas).
3. Smoke test de los endpoints principales.
4. Reportar estado: OK | DEGRADED | DOWN.

## wiki-ingest

Indexa documentación externa para que el agente pueda consultarla.

1. Recibir URL o path a la documentación.
2. Parsear y fragmentar el contenido.
3. Almacenar en el directorio de wiki del proyecto.
4. Confirmar qué secciones quedaron disponibles.

## wiki-query

Consulta la wiki indexada para responder preguntas técnicas.

1. Buscar en los fragmentos indexados con la consulta del usuario.
2. Sintetizar la respuesta citando las fuentes.
3. Si no hay resultado en la wiki, indicarlo explícitamente — no inventar.

## wiki-lint

Verifica la calidad y consistencia de la wiki indexada.

1. Detectar fragmentos desactualizados (referencias a versiones antiguas).
2. Identificar contradicciones entre documentos.
3. Reportar items que requieren revisión manual.
"""


def generate_branch_guard_hook() -> str:
    """Genera el hook JSON de Kiro que advierte al editar en main/master."""
    import json
    hook = {
        "name": "branch-guard",
        "description": "Warns when editing files directly on main or master branch.",
        "event": "onBeforeEdit",
        "condition": {
            "type": "gitBranch",
            "branches": ["main", "master"]
        },
        "action": {
            "type": "agentPrompt",
            "prompt": (
                "STOP: You are about to edit files on the '{{branch}}' branch. "
                "Direct commits to main/master are not allowed in this project. "
                "Create a feature branch first: `git checkout -b feat/<name>`. "
                "Do not proceed with the edit until the user confirms or switches branch."
            )
        }
    }
    return json.dumps(hook, indent=2, ensure_ascii=False)


def generate_compliance_md(config: dict) -> str | None:
    compliance_cfg = config.get("compliance", {})
    frameworks = compliance_cfg.get("frameworks", [])
    if not frameworks:
        return None

    return f"""# Compliance activo

Este proyecto opera bajo los siguientes marcos regulatorios:
{chr(10).join(f'- **{f.upper()}**' for f in frameworks)}

## Reglas no-negociables

- Sin datos personales en logs de stdout.
- Consentimiento explícito antes de cualquier tracker no esencial.
- Logs de auditoría append-only (sin UPDATE/DELETE sobre tablas de eventos).
- Derechos del titular implementados: acceso, rectificación, supresión, oposición, portabilidad.
- TLS 1.2+ para toda comunicación externa.

## Cuándo involucrar al compliance-reviewer

- Cualquier cambio que toque datos de usuarios o consentimientos.
- Nuevos endpoints que reciban PII.
- Cambios en la lógica de logs de auditoría.
- Implementación de derechos del titular (DSAR).

> Nota: el agente compliance-reviewer opera como primer filtro técnico.
> No sustituye revisión legal profesional para proyectos con obligaciones regulatorias reales.
"""


def main():
    force = "--force" in sys.argv

    try:
        root = find_project_root()
        forge = find_forge_dir()
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    with open(root / "project.yaml") as f:
        config = yaml.safe_load(f)

    steering_dir = root / ".kiro" / "steering"
    steering_dir.mkdir(parents=True, exist_ok=True)

    files = {
        "product.md":    generate_product_md(config),
        "structure.md":  generate_structure_md(config),
        "agents.md":     generate_agents_md(config),
        "commands.md":   generate_commands_md(config),
    }

    compliance_content = generate_compliance_md(config)
    if compliance_content:
        files["compliance.md"] = compliance_content

    for filename, content in files.items():
        path = steering_dir / filename
        status = write_file(path, content, force=force)
        icon = "[OK]  " if status == "OK" else "[KEEP]"
        print(f"  {icon} .kiro/steering/{filename}" + (" — ya existe (--force para sobreescribir)" if status == "KEEP" else ""))

    # Hooks
    hooks_dir = root / ".kiro" / "hooks"
    hook_path = hooks_dir / "pre-edit-branch-guard.json"
    hook_status = write_file(hook_path, generate_branch_guard_hook(), force=force)
    hook_icon = "[OK]  " if hook_status == "OK" else "[KEEP]"
    print(f"  {hook_icon} .kiro/hooks/pre-edit-branch-guard.json" + (" — ya existe (--force para sobreescribir)" if hook_status == "KEEP" else ""))

    print(f"\nKiro steering files en {steering_dir.relative_to(root)}/")
    if not force:
        print("  Usar --force para sobreescribir archivos existentes.")


if __name__ == "__main__":
    main()
