#!/usr/bin/env python3
"""
forge-add-opportunities.py — Agrega profiles y skills seleccionados a project.yaml.

Usage:
  python3 .agentic/scripts/forge-add-opportunities.py --profiles laravel wordpress
  python3 .agentic/scripts/forge-add-opportunities.py --skills git-ops security-auditor
  python3 .agentic/scripts/forge-add-opportunities.py --profiles nextjs-admin --skills git-ops
"""
import argparse
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pip3 install -r .agentic/requirements.txt", file=sys.stderr)
    sys.exit(1)


def find_project_root() -> Path:
    here = Path.cwd()
    for p in [here] + list(here.parents):
        if (p / "project.yaml").exists():
            return p
    raise FileNotFoundError("No se encontró project.yaml")


def apply_to_project_yaml(root: Path, profiles: list[str], skills: list[str]) -> None:
    yaml_path = root / "project.yaml"

    with open(yaml_path) as f:
        content = yaml.safe_load(f) or {}

    changed = False

    if profiles:
        agents = content.setdefault("agents", {})
        current = agents.get("profiles", []) or []
        added = [p for p in profiles if p not in current]
        if added:
            agents["profiles"] = current + added
            print(f"Profiles agregados: {', '.join(added)}")
            changed = True
        else:
            print("Profiles ya presentes — sin cambios.")

    if skills:
        skills_section = content.setdefault("skills", {})
        current = skills_section.get("active", []) or []
        added = [s for s in skills if s not in current]
        if added:
            skills_section["active"] = current + added
            print(f"Skills agregados: {', '.join(added)}")
            changed = True
        else:
            print("Skills ya presentes — sin cambios.")

    if changed:
        with open(yaml_path, "w") as f:
            yaml.dump(content, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
        print(f"project.yaml actualizado: {yaml_path}")
    else:
        print("Sin cambios en project.yaml.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Agrega profiles/skills a project.yaml")
    parser.add_argument("--profiles", nargs="*", default=[], metavar="PROFILE",
                        help="Profiles a agregar a agents.profiles")
    parser.add_argument("--skills", nargs="*", default=[], metavar="SKILL",
                        help="Skills a agregar a skills.active")
    args = parser.parse_args()

    if not args.profiles and not args.skills:
        parser.error("Especificá al menos --profiles o --skills")

    try:
        root = find_project_root()
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        apply_to_project_yaml(root, args.profiles, args.skills)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
