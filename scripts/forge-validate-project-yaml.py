#!/usr/bin/env python3
"""
forge-validate-project-yaml.py — Valida un project.yaml contra el schema v2 de Forge.

Usage:
    python3 .agentic/scripts/forge-validate-project-yaml.py
    python3 .agentic/scripts/forge-validate-project-yaml.py --json

Busca project.yaml desde el directorio actual hacia arriba.
Valida contra core/schemas/project.schema.json del directorio de Forge.

Exit codes:
    0 — válido (puede haber warnings)
    1 — inválido (hay errores)
"""

import sys
import os
import json
import argparse
import re
from pathlib import Path
from typing import Optional, Tuple, List


# ---------------------------------------------------------------------------
# Utilidades de búsqueda de archivos
# ---------------------------------------------------------------------------

def find_project_yaml(start: Path) -> Optional[Path]:
    """Busca project.yaml desde start hacia la raíz del sistema de archivos."""
    current = start.resolve()
    while True:
        candidate = current / "project.yaml"
        if candidate.exists():
            return candidate
        parent = current.parent
        if parent == current:
            return None
        current = parent


def find_forge_root() -> Optional[Path]:
    """
    Determina el directorio raíz de Forge buscando core/schemas/project.schema.json.
    Primero busca relativo al script; luego relativo al CWD.
    """
    script_dir = Path(__file__).resolve().parent
    # Estructura esperada: forge/scripts/forge-validate-project-yaml.py
    #                      forge/core/schemas/project.schema.json
    candidate = script_dir.parent / "core" / "schemas" / "project.schema.json"
    if candidate.exists():
        return candidate.parent.parent.parent

    # Fallback: busca desde CWD hacia arriba
    current = Path.cwd().resolve()
    while True:
        candidate = current / "core" / "schemas" / "project.schema.json"
        if candidate.exists():
            return current
        parent = current.parent
        if parent == current:
            return None
        current = parent


# ---------------------------------------------------------------------------
# Carga YAML con fallback a stdlib si PyYAML no está disponible
# ---------------------------------------------------------------------------

def load_yaml(path: Path) -> dict:
    try:
        import yaml
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return data if data is not None else {}
    except ImportError:
        # Fallback mínimo: no podemos parsear YAML complejo sin pyyaml
        raise RuntimeError(
            "pyyaml no está instalado. Instalarlo con: pip install pyyaml"
        )


# ---------------------------------------------------------------------------
# Validación manual (sin jsonschema)
# ---------------------------------------------------------------------------

VALID_MODES = {"startup", "standard", "enterprise"}
VALID_STATUSES = {"active", "paused", "maintenance", "archived"}
VALID_LANGUAGES = {"typescript", "python", "ruby", "go", "php", "mixed"}
VALID_PROVIDERS = {"vercel", "railway", "fly", "aws", "github-actions", "custom"}
VALID_BACKENDS = {"hono", "fastapi", "rails", "express", "laravel", "nestjs", "django", "go-gin"}
VALID_FRONTENDS = {"nextjs", "nuxt", "remix", "rails-views", "astro", "sveltekit"}
VALID_DATABASES = {"postgresql", "mysql", "sqlite"}
VALID_ORMS = {"drizzle", "prisma", "sequelize", "typeorm", "sqlalchemy", "active-record"}
VALID_PKG_MANAGERS = {"npm", "pnpm", "yarn", "bun", "pip", "poetry", "bundler"}
VALID_MONOREPOS = {"turborepo", "nx", "lerna"}
VALID_TESTING = {"vitest", "jest", "pytest", "rspec", "phpunit", "playwright", "cypress"}
VALID_COMPLIANCE = {"gdpr", "lgpd", "ley-21719", "ccpa"}
VALID_PROFILES = {
    "hono-drizzle", "nextjs-admin", "astro", "expo", "playwright-crawler",
    "fastapi", "express", "rails", "nestjs", "django", "vuenuxt", "go-gin", "sveltekit"
}
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
URL_RE = re.compile(r"^https?://")


def _check_enum(value, valid_set, field_path: str, errors: List[str], nullable: bool = True) -> None:
    if value is None:
        return
    if value not in valid_set:
        errors.append(f"{field_path}: valor '{value}' no válido. Opciones: {sorted(valid_set)}")


def _check_bool(value, field_path: str, errors: List[str]) -> None:
    if value is not None and not isinstance(value, bool):
        errors.append(f"{field_path}: debe ser boolean (true/false), recibido: {type(value).__name__}")


def _check_list_of_strings(value, field_path: str, errors: List[str]) -> None:
    if value is None:
        return
    if not isinstance(value, list):
        errors.append(f"{field_path}: debe ser una lista")
        return
    for i, item in enumerate(value):
        if not isinstance(item, str):
            errors.append(f"{field_path}[{i}]: debe ser string, recibido: {type(item).__name__}")


def validate_manually(data: dict) -> Tuple[List[str], List[str]]:
    """
    Validación manual básica para cuando jsonschema no está disponible.
    Retorna (errors, warnings).
    """
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(data, dict):
        errors.append("El archivo debe ser un objeto YAML/mapa en el nivel raíz")
        return errors, warnings

    # -----------------------------------------------------------------------
    # project (required)
    # -----------------------------------------------------------------------
    project = data.get("project")
    if project is None:
        errors.append("project: sección requerida no encontrada")
    elif not isinstance(project, dict):
        errors.append("project: debe ser un objeto")
    else:
        if not project.get("name"):
            errors.append("project.name: campo requerido vacío o ausente")
        elif not isinstance(project["name"], str):
            errors.append("project.name: debe ser string")

        mode = project.get("mode")
        if not mode:
            errors.append("project.mode: campo requerido ausente. Valores: startup | standard | enterprise")
        else:
            _check_enum(mode, VALID_MODES, "project.mode", errors)

        if project.get("slug") is not None:
            slug = project["slug"]
            if not isinstance(slug, str):
                errors.append("project.slug: debe ser string")
            elif not SLUG_RE.match(slug):
                errors.append(f"project.slug: '{slug}' debe ser lowercase sin espacios (ej: mi-proyecto)")

        if project.get("language") is not None:
            _check_enum(project["language"], VALID_LANGUAGES, "project.language", errors)

        if project.get("status") is not None:
            _check_enum(project["status"], VALID_STATUSES, "project.status", errors)

    # -----------------------------------------------------------------------
    # stack
    # -----------------------------------------------------------------------
    stack = data.get("stack")
    if stack is not None and isinstance(stack, dict):
        if stack.get("backend") is not None:
            _check_enum(stack["backend"], VALID_BACKENDS, "stack.backend", errors)
        if stack.get("frontend") is not None:
            _check_enum(stack["frontend"], VALID_FRONTENDS, "stack.frontend", errors)
        if stack.get("database") is not None:
            _check_enum(stack["database"], VALID_DATABASES, "stack.database", errors)
        if stack.get("orm") is not None:
            _check_enum(stack["orm"], VALID_ORMS, "stack.orm", errors)
        if stack.get("package_manager") is not None:
            _check_enum(stack["package_manager"], VALID_PKG_MANAGERS, "stack.package_manager", errors)
        if stack.get("monorepo") is not None:
            _check_enum(stack["monorepo"], VALID_MONOREPOS, "stack.monorepo", errors)
        if stack.get("testing") is not None:
            testing = stack["testing"]
            if not isinstance(testing, list):
                errors.append("stack.testing: debe ser una lista")
            else:
                for fw in testing:
                    _check_enum(fw, VALID_TESTING, "stack.testing[]", errors)

    # -----------------------------------------------------------------------
    # agents
    # -----------------------------------------------------------------------
    agents = data.get("agents")
    if agents is not None and isinstance(agents, dict):
        _check_list_of_strings(agents.get("active"), "agents.active", errors)
        _check_list_of_strings(agents.get("compliance"), "agents.compliance", errors)

        by_role = agents.get("by_role")
        if by_role is not None:
            if not isinstance(by_role, dict):
                errors.append("agents.by_role: debe ser un objeto (mapeo rol → modelo)")
            else:
                for role, model in by_role.items():
                    if model is not None and not isinstance(model, str):
                        errors.append(f"agents.by_role.{role}: debe ser string (nombre del modelo) o null")

        profiles = agents.get("profiles")
        if profiles is not None:
            if not isinstance(profiles, list):
                errors.append("agents.profiles: debe ser una lista")
            else:
                for p in profiles:
                    _check_enum(p, VALID_PROFILES, "agents.profiles[]", errors)

    # -----------------------------------------------------------------------
    # deploy (nuevo en v2)
    # -----------------------------------------------------------------------
    deploy = data.get("deploy")
    if deploy is not None and isinstance(deploy, dict):
        if deploy.get("provider") is not None:
            _check_enum(deploy["provider"], VALID_PROVIDERS, "deploy.provider", errors)

        prod_url = deploy.get("production_url")
        if prod_url is not None and not isinstance(prod_url, str):
            errors.append("deploy.production_url: debe ser string (URL)")
        elif isinstance(prod_url, str) and not URL_RE.match(prod_url):
            errors.append(f"deploy.production_url: '{prod_url}' no parece una URL válida (debe empezar con http:// o https://)")

        smoke_tests = deploy.get("smoke_tests")
        if smoke_tests is not None:
            if not isinstance(smoke_tests, list):
                errors.append("deploy.smoke_tests: debe ser una lista")
            else:
                for i, test in enumerate(smoke_tests):
                    if not isinstance(test, dict):
                        errors.append(f"deploy.smoke_tests[{i}]: debe ser un objeto")
                        continue
                    if not test.get("url"):
                        errors.append(f"deploy.smoke_tests[{i}].url: campo requerido")
                    status = test.get("expect_status")
                    if status is not None and (not isinstance(status, int) or status < 100 or status > 599):
                        errors.append(f"deploy.smoke_tests[{i}].expect_status: debe ser integer entre 100 y 599")
                    if "expect_json" in test and test["expect_json"] is not None:
                        if not isinstance(test["expect_json"], dict):
                            errors.append(f"deploy.smoke_tests[{i}].expect_json: debe ser un objeto")

    # -----------------------------------------------------------------------
    # mcp (nuevo en v2)
    # -----------------------------------------------------------------------
    mcp = data.get("mcp")
    if mcp is not None and isinstance(mcp, dict):
        servers = mcp.get("servers")
        if servers is not None:
            if not isinstance(servers, list):
                errors.append("mcp.servers: debe ser una lista")
            else:
                for i, server in enumerate(servers):
                    if not isinstance(server, dict):
                        errors.append(f"mcp.servers[{i}]: debe ser un objeto")
                        continue
                    if not server.get("name"):
                        errors.append(f"mcp.servers[{i}].name: campo requerido")
                    _check_list_of_strings(server.get("auto_approve"), f"mcp.servers[{i}].auto_approve", errors)

    # -----------------------------------------------------------------------
    # github (nuevo en v2)
    # -----------------------------------------------------------------------
    github = data.get("github")
    if github is not None and isinstance(github, dict):
        gh_project = github.get("project")
        if gh_project is not None and isinstance(gh_project, dict):
            number = gh_project.get("number")
            if number is not None and (not isinstance(number, int) or number < 1):
                errors.append("github.project.number: debe ser un integer positivo")

    # -----------------------------------------------------------------------
    # rules (nuevo en v2)
    # -----------------------------------------------------------------------
    rules = data.get("rules")
    if rules is not None and isinstance(rules, dict):
        _check_list_of_strings(rules.get("forbidden_in_production"), "rules.forbidden_in_production", errors)
        _check_list_of_strings(rules.get("forbidden_patterns"), "rules.forbidden_patterns", errors)
        _check_bool(rules.get("required_review_before_ship"), "rules.required_review_before_ship", errors)
        _check_bool(rules.get("require_spec_before_implementation"), "rules.require_spec_before_implementation", errors)
        _check_bool(rules.get("conventional_commits"), "rules.conventional_commits", errors)

        # Validar que los forbidden_patterns son regex válidos
        for i, pattern in enumerate(rules.get("forbidden_patterns") or []):
            try:
                re.compile(pattern)
            except re.error as e:
                errors.append(f"rules.forbidden_patterns[{i}]: regex inválida '{pattern}' — {e}")

    # -----------------------------------------------------------------------
    # compliance
    # -----------------------------------------------------------------------
    compliance = data.get("compliance")
    if compliance is not None and isinstance(compliance, dict):
        frameworks = compliance.get("frameworks")
        if frameworks is not None:
            if not isinstance(frameworks, list):
                errors.append("compliance.frameworks: debe ser una lista")
            else:
                for fw in frameworks:
                    _check_enum(fw, VALID_COMPLIANCE, "compliance.frameworks[]", errors)
        _check_bool(compliance.get("pii_handling"), "compliance.pii_handling", errors)
        _check_bool(compliance.get("audit_logs"), "compliance.audit_logs", errors)

    # -----------------------------------------------------------------------
    # Warnings — campos de v1 que indican que no se migró
    # -----------------------------------------------------------------------
    if project and isinstance(project, dict) and not project.get("mode"):
        warnings.append("project.mode no definido — se recomienda migrar a v2 con forge-migrate-project-yaml.py")

    deploy_section = data.get("deploy")
    if deploy_section is None:
        warnings.append("Sección 'deploy' ausente — considera agregar deploy.provider y deploy.smoke_tests (v2)")

    rules_section = data.get("rules")
    if rules_section is None:
        warnings.append("Sección 'rules' ausente — considera agregar guardrails del proyecto (v2)")

    github_section = data.get("github")
    if github_section is None:
        warnings.append("Sección 'github' ausente — considera integrar con GitHub Projects (v2)")

    return errors, warnings


# ---------------------------------------------------------------------------
# Validación con jsonschema (cuando está disponible)
# ---------------------------------------------------------------------------

def validate_with_jsonschema(data: dict, schema: dict) -> Tuple[List[str], List[str]]:
    """Valida usando jsonschema si está instalado. Retorna (errors, warnings)."""
    try:
        import jsonschema
        validator = jsonschema.Draft7Validator(schema)
        errors = []
        for error in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
            path = ".".join(str(p) for p in error.path) if error.path else "raíz"
            errors.append(f"{path}: {error.message}")

        # Warnings adicionales (lógica de negocio no expresable en JSON Schema)
        _, warnings = validate_manually(data)
        return errors, warnings
    except ImportError:
        # jsonschema no disponible — usar validación manual
        return validate_manually(data)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Valida project.yaml contra el schema v2 de Forge"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emitir resultado como JSON en lugar de texto"
    )
    args = parser.parse_args()

    # Buscar project.yaml
    project_yaml_path = find_project_yaml(Path.cwd())
    if project_yaml_path is None:
        result = {
            "valid": False,
            "errors": ["No se encontró project.yaml en el directorio actual ni en directorios superiores"],
            "warnings": []
        }
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print("ERROR: No se encontró project.yaml")
        sys.exit(1)

    # Buscar schema
    forge_root = find_forge_root()
    schema = None
    if forge_root:
        schema_path = forge_root / "core" / "schemas" / "project.schema.json"
        if schema_path.exists():
            try:
                with open(schema_path, "r", encoding="utf-8") as f:
                    schema = json.load(f)
            except Exception as e:
                pass  # Fallback a validación manual

    # Cargar project.yaml
    try:
        data = load_yaml(project_yaml_path)
    except RuntimeError as e:
        result = {"valid": False, "errors": [str(e)], "warnings": []}
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(f"ERROR: {e}")
        sys.exit(1)
    except Exception as e:
        result = {
            "valid": False,
            "errors": [f"Error al parsear project.yaml: {e}"],
            "warnings": []
        }
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(f"ERROR: {e}")
        sys.exit(1)

    # Validar
    if schema is not None:
        errors, warnings = validate_with_jsonschema(data, schema)
    else:
        errors, warnings = validate_manually(data)

    valid = len(errors) == 0
    result = {"valid": valid, "errors": errors, "warnings": warnings}

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"Validando: {project_yaml_path}")
        print()
        if valid:
            print("OK — project.yaml es válido")
        else:
            print(f"INVALIDO — {len(errors)} error(s) encontrado(s):")
            for e in errors:
                print(f"  [ERROR] {e}")

        if warnings:
            print()
            print(f"{len(warnings)} advertencia(s):")
            for w in warnings:
                print(f"  [WARN]  {w}")

    sys.exit(0 if valid else 1)


if __name__ == "__main__":
    main()
