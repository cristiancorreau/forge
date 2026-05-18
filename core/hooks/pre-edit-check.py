#!/usr/bin/env python3
"""
Forge v2 — PreToolUse hook: pre-edit-check.py
Enforces branch guard, debug detection, and secret detection before file edits.
"""

import json
import os
import re
import subprocess
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
# File classification helpers
# ---------------------------------------------------------------------------

CODE_EXTENSIONS = {
    ".py", ".ts", ".js", ".tsx", ".jsx",
    ".php", ".rb", ".go", ".rs", ".java",
    ".cs", ".cpp", ".c", ".sh",
}

NON_CODE_EXTENSIONS = {
    ".md", ".yaml", ".yml", ".json", ".toml", ".txt", ".lock",
}

ROOT_PROTECTED_NAMES = {"README.md", "CLAUDE.md", "CHANGELOG.md"}

PROTECTED_DIRS = ("docs/", ".claude/")


def is_code_file(file_path):
    """Return True if the file path is considered a code file."""
    _, ext = os.path.splitext(file_path)
    if ext.lower() in CODE_EXTENSIONS:
        return True
    if ext.lower() in NON_CODE_EXTENSIONS:
        return False
    # Default: treat unknown extensions as non-code (safe)
    return False


def is_exempt_from_branch_guard(file_path):
    """Return True if the file should be exempt from branch-guard blocking."""
    norm = file_path.replace("\\", "/")
    # Exempt protected dirs
    for d in PROTECTED_DIRS:
        if norm.startswith(d) or f"/{d.rstrip('/')}" in norm:
            return True
    # Exempt root-level protected names
    basename = os.path.basename(norm)
    if basename in ROOT_PROTECTED_NAMES:
        return True
    # Exempt root-level *.md files
    if basename.endswith(".md") and "/" not in norm.lstrip("./"):
        return True
    # Exempt root-level *.yaml / *.json config files
    if "/" not in norm.lstrip("./"):
        _, ext = os.path.splitext(basename)
        if ext.lower() in (".yaml", ".yml", ".json"):
            return True
    return False


# ---------------------------------------------------------------------------
# Check 1 — Branch guard
# ---------------------------------------------------------------------------

PROTECTED_BRANCHES = {"main", "master", "develop"}


def check_branch_guard(file_path):
    """Block code edits on protected branches."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        branch = result.stdout.strip()
        dbg(f"current branch: {branch!r}")
    except Exception as e:
        dbg(f"git branch error: {e}")
        return None

    if branch not in PROTECTED_BRANCHES:
        return None

    if not is_code_file(file_path):
        return None

    if is_exempt_from_branch_guard(file_path):
        return None

    return (
        f"forge: edición bloqueada en {branch}. Crea una feature branch:\n"
        f"  git checkout -b feature/<tema>-$(date +%Y-%m-%d)"
    )


# ---------------------------------------------------------------------------
# Check 2 — Debug statements
# ---------------------------------------------------------------------------

def check_debug_statements(file_path, content):
    """Warn (not block) if debug statements are found in new content."""
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    if ext not in CODE_EXTENSIONS:
        return None

    found = False
    basename = os.path.basename(file_path)
    norm = file_path.replace("\\", "/")

    if ext in (".ts", ".js", ".tsx", ".jsx"):
        if "console.log(" in content or "debugger;" in content:
            found = True

    elif ext == ".php":
        if "var_dump(" in content or "dd(" in content or "print_r(" in content:
            found = True

    elif ext == ".py":
        # Skip forge scripts and .agentic/ files
        is_forge_script = basename.startswith("forge") and basename.endswith(".py")
        in_agentic = ".agentic/" in norm
        if not is_forge_script and not in_agentic:
            if "print(" in content:
                found = True

    elif ext == ".rb":
        if re.search(r"^\s*(puts |pp |p )", content, re.MULTILINE):
            found = True

    if found:
        return (
            f"forge: debug statement detectado en {file_path}"
            " — recuerda quitarlo antes del commit"
        )
    return None


# ---------------------------------------------------------------------------
# Check 3 — Secret detection
# ---------------------------------------------------------------------------

SECRET_PATTERN = re.compile(
    r'(password|passwd|secret|api_key|apikey|token|private_key)\s*[=:]\s*["\'][^"\']{8,}["\']',
    re.IGNORECASE,
)

LONG_SECRET_PATTERN = re.compile(
    r'\b(key|secret|token|password|auth|api_key|apikey)\b\s*[=:]\s*["\'][A-Za-z0-9+/=_\-]{20,}["\']',
    re.IGNORECASE,
)

EXEMPT_EXTENSIONS = {".md"}
EXEMPT_SUFFIXES = (".env.example", ".env.sample")
TEST_PATTERNS = re.compile(r'\.(test|spec)\.')


def is_exempt_from_secret_check(file_path):
    norm = file_path.replace("\\", "/")
    basename = os.path.basename(norm)
    _, ext = os.path.splitext(basename)

    if ext.lower() in EXEMPT_EXTENSIONS:
        return True
    for suffix in EXEMPT_SUFFIXES:
        if norm.endswith(suffix):
            return True
    if TEST_PATTERNS.search(basename):
        return True
    return False


def check_secret_detection(file_path, content):
    """Block if hardcoded credentials are detected."""
    if is_exempt_from_secret_check(file_path):
        return None

    if SECRET_PATTERN.search(content) or LONG_SECRET_PATTERN.search(content):
        return (
            f"forge: posible credencial hardcodeada detectada en {file_path}."
            " Usa variables de entorno."
        )
    return None


# ---------------------------------------------------------------------------
# project.yaml — custom forbidden patterns + enterprise mode
# ---------------------------------------------------------------------------

def check_project_yaml_patterns(file_path, content, project):
    """Check project.yaml forbidden_patterns if present."""
    try:
        rules = project.get("rules", {})
        forbidden = rules.get("forbidden_patterns", [])
        if not isinstance(forbidden, list):
            return None
        for pattern in forbidden:
            if re.search(pattern, content):
                return (
                    f"forge: patrón prohibido detectado en {file_path} "
                    f"(regla: {pattern!r})"
                )
    except Exception as e:
        dbg(f"project.yaml patterns error: {e}")
    return None


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
        tool_input = data.get("tool_input", {})

        file_path = tool_input.get("file_path", "")
        if not file_path:
            sys.exit(0)

        # Determine new content being written
        if tool_name == "Write":
            new_content = tool_input.get("content", "")
        elif tool_name == "Edit":
            new_content = tool_input.get("new_string", "")
        else:
            sys.exit(0)

        dbg(f"tool={tool_name} file={file_path} content_len={len(new_content)}")

        project = load_project_yaml()
        enterprise_mode = project.get("mode", "") == "enterprise"

        # Check 1 — Branch guard
        block_msg = check_branch_guard(file_path)
        if block_msg:
            print(block_msg, flush=True)
            sys.exit(2)

        # Check 2 — Debug statements
        warn_msg = check_debug_statements(file_path, new_content)
        if warn_msg:
            if enterprise_mode:
                print(warn_msg, flush=True)
                sys.exit(2)
            else:
                print(warn_msg, flush=True)
                # fall through — warning only

        # Check 3 — Secret detection
        block_msg = check_secret_detection(file_path, new_content)
        if block_msg:
            print(block_msg, flush=True)
            sys.exit(2)

        # project.yaml forbidden patterns
        block_msg = check_project_yaml_patterns(file_path, new_content, project)
        if block_msg:
            print(block_msg, flush=True)
            sys.exit(2)

    except Exception as e:
        dbg(f"unexpected error: {e}")
        sys.exit(0)

    sys.exit(0)


if __name__ == "__main__":
    main()
