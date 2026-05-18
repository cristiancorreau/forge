# Team Install — Join a Project Using Forge

Get up and running in under 5 minutes.

---

## Prerequisites

- **Python 3.9+** — `python3 --version`
- **git** — `git --version`

---

## Steps

### 1. Clone the repository

If you haven't cloned yet, use `--recurse-submodules` to initialize forge at the same time:

```bash
git clone --recurse-submodules <url-del-repositorio>
cd <repositorio>
```

If you already cloned without that flag, initialize the submodule manually:

```bash
cd <repositorio>
git submodule update --init --recursive
```

After this step, `.agentic/` should contain forge files (not be empty).

### 2. Install Python dependencies

```bash
pip3 install -r .agentic/requirements.txt
```

This installs `pyyaml`, the only external dependency forge requires.

### 3. Run forge init

```bash
python3 .agentic/forge.py
```

Select **Inicializar agentes** from the menu. Forge will read `project.yaml` and populate `.claude/` with:

- `.claude/agents/` — all agents configured for this project (Tier 1 + Tier 2 profiles)
- `.claude/commands/` — slash commands (`/new-feature`, `/review`, `/wiki-query`, etc.)
- `.claude/settings.json` — Claude Code settings with hooks and permissions
- `AGENTS.md` — agent roster at the repo root

Non-interactive alternative (CI or scripted setup):

```bash
python3 .agentic/scripts/forge-init.py --tool claude-code
```

### 4. Verify the installation

```bash
ls .claude/agents/
ls .claude/commands/
```

You should see the agents and commands listed in `project.yaml`. If the project uses profiles (e.g., `hono-drizzle`, `nextjs-admin`), their specialized agents appear alongside the universal ones.

### 5. Start your first session

Open Claude Code and run:

```
/session-start
```

The orchestrator will greet you, summarize the active sprint, and assign initial tasks based on your role.

---

## Troubleshooting

### Python not found

```
command not found: python3
```

Install Python 3.9+ from <https://www.python.org/downloads/> or via your package manager:

```bash
# macOS (Homebrew)
brew install python

# Ubuntu / Debian
sudo apt install python3
```

Verify: `python3 --version`

---

### Submodule not initialized — `.agentic/` is empty

```
No such file or directory: '.agentic/forge.py'
```

The submodule was not initialized during clone. Run:

```bash
git submodule update --init --recursive
```

Then retry from step 2.

---

### forge.py not found at `.agentic/`

If the team uses a different submodule path, check `project.yaml` or ask a team lead. Common alternatives:

| Path | Command |
|------|---------|
| `.agentic/` | `python3 .agentic/forge.py` |
| `forge/` | `python3 forge/forge.py` |
| `.forge/` | `python3 .forge/forge.py` |

You can also run the init script directly:

```bash
python3 .agentic/scripts/forge-init.py --tool claude-code
```

---

### pyyaml missing

```
ModuleNotFoundError: No module named 'yaml'
```

```bash
pip3 install pyyaml
# or
pip3 install -r .agentic/requirements.txt
```

---

### Windows not supported

The forge CLI uses `termios` and `tty`, which are Unix-only. Use **WSL (Windows Subsystem for Linux)** or run inside a Linux/macOS environment. The non-interactive init script (`forge-init.py`) works on WSL.
