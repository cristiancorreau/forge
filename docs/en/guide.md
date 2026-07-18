**English** · [Español](../guide.md)

# forge — Usage Guide

> Last updated: 2026-06-03

---

## What forge is

A reusable framework of agents, skills, and workflows for software projects.
Technology-agnostic (TypeScript, Python, Ruby, Go). It installs into each project with
`npx @cristiancorreau/forge` and is configured through a single `project.yaml` file.

```
proyecto/
├── project.yaml       ← fuente de verdad del proyecto
├── CLAUDE.md          ← generado por forge
├── .forge/            ← manifest de la instalación
└── .claude/
    ├── agents/        ← agentes instalados por forge
    └── commands/      ← slash commands instalados por forge
```

Since **v2.8.0** the CLI is 100% TypeScript (no Python) and runs with
`npx @cristiancorreau/forge <comando>`.

---

## Commands

The CLI exposes the following commands. They all run on Node/Bun (Node.js 20+).

| Command | What it does | Main flags |
|---------|----------|-------------------|
| `forge init` | Interactive wizard that generates `project.yaml` and installs agents, commands, and skills. When it finishes, it opens an interactive **post-install dashboard**. | — |
| `forge generate` | Regenerates the native configuration of each active runtime from `project.yaml`. | `--runtime <id>`, `--dry-run`, `--force` |
| `forge audit` | Audits the project's agents against forge (frontmatter, sections, similarity, opportunities). | `--json`, `--only <agente>` |
| `forge export` | Emits the project's **resolved model** (agents + tools + skills + commands + MCP servers per runtime). With `--json` it validates against `export.schema.json` from `@cristiancorreau/forge-schemas`. | `--json` |
| `forge validate` | Validates the structure and schema of `project.yaml`. | `--json` |
| `forge doctor` | Detects installed runtimes (binary + version) and validates `project.yaml` v2. | `--json` |
| `forge migrate` | Migrates `project.yaml` from v1 to v2. | `--dry-run`, `--backup` |
| `forge wiki` | Manages the project wiki. | `status`, `ingest <file>`, `query <q>`, `lint` |
| `forge skills` | Lists the 14 available skills grouped by category. | `--json`, `--active` |
| `forge aitmpl-search <query>` | Searches the curated catalog of frameworks, MCP servers, and profiles. | `<query>` |
| `forge scaffold` | Creates a new agent: a Tier 2 profile or a Tier 3 domain agent. | `--tier <2\|3>`, `--name <slug>`, `--engineer <agente>`, `--scope-dir <dir>` |
| `forge teardown` | Cleanly uninstalls forge from the project. | `--dry-run` |
| `forge session-start` | Opens the session: detects the repo state and routes accordingly. | — |
| `forge session-close` | Closes the session: commit → daily note → sync → PR. | — |

### Post-install dashboard

When `forge init` finishes, forge opens an interactive panel (OpenTUI on Bun) that you can
navigate by section: Overview, installed agents, SDD workflow, skills, runtimes, and icons/tech. On
runtimes without Bun, a static summary is shown instead. Exit with `q` or `Esc`.

---

## Creating a Tier 3 agent

**Tier 3** agents know the project's business domain (`dsar-specialist`, `gcm-engineer`,
`policy-engineer`, `banner-engineer`). They live in `.claude/agents/`, they don't come from forge, and they're
registered under `agents.specialized` in `project.yaml`.

### Step 1 — Generate the agent file

```bash
forge scaffold --tier 3 --name dsar-specialist \
  --description "Maneja DSAR bajo Ley 21.719. Scope: src/dsar." \
  --scope-dir src/dsar
```

This creates `.claude/agents/dsar-specialist.md` with the complete frontmatter
(`name`, `description`, `model`, `tools`, `tier: 3`) and the required sections
(`## Tu trabajo`, `## Reglas`, `## No hagas`, `## Workflow`) following `docs/en/agent-standard.md`,
with guide comments to fill in.

### Step 2 — Edit the generated file

Replace the placeholders: refine the `description` into a single line (what it does + exact scope),
fill in `## Tu trabajo`, `## Reglas`, and `## No hagas`. Don't default to `opus`: `sonnet`
covers 90% of cases.

### Step 3 — Register it in project.yaml

```yaml
agents:
  specialized:
    - dsar-specialist
```

### Step 4 — Validate consistency

```bash
forge validate
```

`forge validate` fails (exit 1, CI-safe) if an agent listed under `agents.specialized` doesn't have
its file at `.claude/agents/<agente>.md`. `forge audit` also reports the consistency between
the installed files and the declared list (and it never compares Tier 3 agents against forge, because
they belong to the project).

> If you already had Tier 3 agents in `.claude/agents/`, `forge init` auto-detects them (by their
> `tier: 3` frontmatter) and pre-fills `agents.specialized` when generating `project.yaml`.

---

## VS Code extension

forge has an official VS Code extension that replaces the interactive CLI when you work from the editor.

### Installation

```bash
# Desde la raíz del repo forge
cd vscode-extension
npx vsce package --no-dependencies
code --install-extension forge-agent-framework-0.1.2.vsix
```

Once installed, the **forge** icon (a robot) appears in the left activity bar.

### Side panel

The extension adds three views under the forge icon:

**Actions** — quick-access buttons for all operations:
- Setup Wizard
- Initialize Agents
- Run Audit
- Search Catalog (MCP / Profiles)
- Show Project Status

**Project** — information about the active `project.yaml`: project name, stack, enabled profiles.

**Agents** — the list of agents installed in `.claude/agents/` with an inline audit button per agent.

### Commands (Cmd+Shift+P)

| Command | CLI equivalent |
|---------|-----------------|
| `forge: Setup Wizard` | `npx @cristiancorreau/forge init` |
| `forge: Initialize Agents` | `npx @cristiancorreau/forge init` |
| `forge: Run Audit` | `npx @cristiancorreau/forge audit` |
| `forge: Audit Specific Agent` | `npx @cristiancorreau/forge audit --only <agent>` |
| `forge: Search Catalog` | `npx @cristiancorreau/forge aitmpl-search <query>` |
| `forge: Install` | `npx @cristiancorreau/forge init` |

### Audit flow with the opportunity selector

When the audit detects available profiles or skills that the project isn't using, the extension shows a **multi-select QuickPick** with a description of each item. On confirming the selection it:

1. Updates `project.yaml` with the chosen profiles/skills
2. Offers "Initialize Agents" to install the new agents immediately

### Configuration

Under `Settings > forge`:

| Setting | Default | Description |
|---------|-------------|-------------|
| `forge.tool` | `claude-code` | Target runtime (`claude-code`, `opencode`, `kiro`, `codex`, `all`) |
| `forge.autoAuditOnSave` | `false` | Automatically audit when saving an agent file |

### Extension states

| Condition | Behavior |
|-----------|----------------|
| forge not installed (`!forge.installed`) | Shows an "Install forge" button in the panel |
| forge installed but no `project.yaml` | Shows a "Setup Wizard" button |
| Active project but no agents | Shows an "Initialize Agents" button |
| Complete project | Shows the agent list + audit button |

---

## Part 1 — New project (from scratch)

### Step 1 — Create the repository

```bash
git init mi-proyecto && cd mi-proyecto
```

### Step 2 — Run the wizard

```bash
npx @cristiancorreau/forge init
```

The wizard detects the stack, asks you about agents, profiles, and skills, and generates
`project.yaml` + the runtime configuration. If you'd rather configure
`project.yaml` by hand before initializing, these are the key sections:

```yaml
project:
  name: "Mi Proyecto"
  slug: "mi-proyecto"
  language: "typescript"

stack:
  backend: "hono"       # hono | fastapi | rails | express | null
  frontend: "nextjs"    # nextjs | nuxt | remix | null
  database: "postgresql"

agents:
  active:
    - orchestrator
    - test-engineer
    - docs-writer
  compliance:
    - compliance-reviewer   # si hay datos de usuarios
  profiles:
    - hono-drizzle          # instala api-engineer
    - nextjs-admin          # instala admin-engineer
  specialized: []           # agentes Tier 3 propios del proyecto

skills:
  active:
    - security-audit
    - db-migrate
    - browser-test          # si tienes agent-browser instalado
    - wiki-ingest           # LLM wiki
    - wiki-query
    - wiki-lint
    - new-feature

compliance:
  frameworks: [ley-21719, gdpr]   # vacío si no aplica
  pii_handling: false
  audit_logs: false
```

### Step 3 — Regenerate the configuration (if you edited project.yaml by hand)

```bash
npx @cristiancorreau/forge generate
```

This:
- Installs Tier 2 agents (profiles) → Tier 1 (core) into `.claude/agents/`
- Generates `AGENTS.md` with the full roster
- Installs active slash commands into `.claude/commands/`
- Creates `wiki/` if the wiki skills are active

### Step 4 — Initial commit

```bash
git add .
git commit -m "chore: init project with forge framework"
```

### Step 5 — Verify with forge audit

```bash
npx @cristiancorreau/forge audit
```

A freshly initialized new project should show **0 gaps**.

---

## Part 2 — Existing project (already has structure)

### Step 1 — Adopt forge (brownfield)

```bash
# En la raíz del proyecto existente
npx @cristiancorreau/forge adopt
```

`forge adopt` analyzes the codebase, generates `project.yaml` from what it detects
(stack, ORM, testing, monorepo, docker), and installs the forge config without overwriting
existing files (unless `--force`).

### Step 2 — Adjust project.yaml

`forge adopt` already generated `project.yaml`; edit it with the project's real data.
Critical points when configuring an existing project:

- `agents.active` → list the agents you already have in `.claude/agents/`
- `agents.profiles` → if you already have api-engineer, admin-engineer, etc., declare the corresponding profiles
- `agents.specialized` → list the project's own Tier 3 agents
- `skills.active` → only the skills you want to use actively

### Step 3 — Audit the current state

```bash
npx @cristiancorreau/forge audit
```

The audit shows:
- **Frontmatter gaps**: agents missing the `tier:` or `model:` field
- **Missing sections**: `## Tu trabajo`, `## Reglas`, `## No hagas`
- **Similarity with forge**: how close your agents are to the forge version
- **Opportunities**: forge skills or profiles you aren't using

### Step 4 — Regenerate (without --force to preserve what exists)

```bash
npx @cristiancorreau/forge generate
```

With the default behavior (**without** `--force`):
- Agents that ALREADY EXIST in `.claude/agents/` → are preserved (`[KEEP]`)
- Agents that are MISSING and that forge provides → are installed (`[OK]`)
- `AGENTS.md` is always regenerated

### Step 5 — Resolve audit gaps manually

For each reported gap:

| Gap type | Action |
|-------------|--------|
| Missing `tier:` in frontmatter | Add `tier: 1`, `tier: 2`, or `tier: 3` as appropriate |
| Missing `## Reglas` section | Add the section to the agent file |
| Agent very different from forge (error) | Check whether it's intentional or outdated |
| Extended agent (info) | Document in a comment why it has more content |

### Step 6 — Verify the final result

```bash
npx @cristiancorreau/forge audit
# Objetivo: 0 errores (✗). Las advertencias (⚠) son opcionales.
```

---

## Part 3 — When forge has updates

### When to update forge in a project

- When a new skill is added to forge and you want to use it
- When a bug is fixed in a core agent
- Periodically (per sprint) so you don't fall too far behind

### Update process (without breaking anything)

#### Step 1 — Use the latest version of forge

`npx @cristiancorreau/forge@latest <cmd>` always resolves to the latest version
published on npm. If you installed the global binary, update it:

```bash
npm install -g @cristiancorreau/forge@latest
```

#### Step 2 — Audit before applying changes

```bash
npx @cristiancorreau/forge audit
```

Read the output carefully:
- **info → (extended)**: your agent has more content than forge → don't update, it's an intentional fork
- **warn ⚠ (different content)**: there are possibly improvements in forge → review manually
- **error ✗ (outdated)**: your agent is shorter and very different → a candidate for updating

#### Step 3 — Update agents selectively

**NEVER** run `forge generate --force` without reviewing first. Only update what the audit flags as outdated:

```bash
# Regenerar con --force (revisar el diff antes de commitear)
npx @cristiancorreau/forge generate --force

# Ver qué cambió antes de aceptar
git diff .claude/agents/docs-writer.md
```

If the diff is positive (forge adds useful content), accept it. If it deletes project customizations, revert and merge manually.

#### Step 4 — Install new slash commands or skills

If forge added new commands or skills you want to use:

```bash
# 1. Activar en project.yaml
#    skills.active: - nuevo-skill

# 2. Regenerar la configuración
npx @cristiancorreau/forge generate

# 3. Si hay estructura nueva (ej. wiki)
#    forge la crea automáticamente si no existe
```

#### Step 5 — Commit the update

```bash
# Agrupar en el mismo commit: agentes y comandos actualizados
git add .claude/agents/ .claude/commands/ project.yaml
git commit -m "chore(forge): update agents to forge <version>"
```

---

## Part 4 — Anti-conflict rules

### The golden rule: tiers determine who can update

| Tier | Owner | Can forge overwrite? |
|------|-------|----------------------------|
| **Tier 1** (orchestrator, test-engineer…) | forge | Only with `--force` + manual review |
| **Tier 2** (api-engineer, admin-engineer…) | forge (profile) | Only with `--force` + manual review |
| **Tier 3** (your domain) | project | NEVER — forge doesn't touch them |

### Specific rules

1. **`--force` requires a prior audit.** Run `forge audit` before any `--force`.

2. **Update forge and agents in separate commits** if there are many changes. One commit for the forge bump, another for the updated agents. This makes reverting easier if something fails.

3. **"Extended" agents are intentional forks.** If your version has more lines than forge, it's because you customized it. `forge audit` shows it as `→ info` (not an error). There's nothing to "fix".

4. **Never edit Tier 1/2 agents directly** without first considering whether the change should go into forge. If the change is universal → bring it into forge. If it's project-specific → document it as an intentional fork with a comment in the agent.

5. **Keep `project.yaml` up to date.** Every time you add a Tier 3 agent, declare it under `agents.specialized`. Every time you activate a skill, declare it under `skills.active`. This lets `forge audit` have an accurate picture.

6. **The wiki (`docs/wiki/raw/`) is immutable.** Never edit files in `raw/`. Only add new ones.

---

## Command quick reference

```bash
# Inicializar el proyecto (wizard + dashboard post-install)
npx @cristiancorreau/forge init

# Auditar estado del proyecto vs forge
npx @cristiancorreau/forge audit

# Regenerar configs nativas tras cambiar project.yaml
npx @cristiancorreau/forge generate

# Validar project.yaml
npx @cristiancorreau/forge validate

# Detectar runtimes instalados y validar project.yaml v2
npx @cristiancorreau/forge doctor

# Migrar project.yaml v1 → v2
npx @cristiancorreau/forge migrate --backup

# Buscar en el catálogo curado
npx @cristiancorreau/forge aitmpl-search <query>

# Wiki
/wiki-ingest <url|archivo|texto>
/wiki-query <pregunta>
/wiki-lint

# Browser automation
agent-browser open <url>
agent-browser snapshot -i
agent-browser screenshot
```

---

## forge-audit classifications

| Icon | Level | Meaning |
|-------|-------|-------------|
| ✓ | ok | Up to date with forge (similarity ≥80%) |
| → | info | Intentionally extended (project has >20% more lines) |
| ⚠ | warn | Different but comparable — check whether improvements are available |
| ✗ | error | Outdated or critical gap — needs attention |

---

## Use in CI/CD (no interactive terminal)

The post-install dashboard requires an interactive terminal. For CI pipelines, use the
non-interactive subcommands directly:

| Action | Command |
|--------|---------|
| Regenerate configs (all active runtimes) | `npx @cristiancorreau/forge generate` |
| Regenerate a specific runtime | `npx @cristiancorreau/forge generate --runtime claude-code` |
| Regenerate (preview, no writes) | `npx @cristiancorreau/forge generate --dry-run` |
| Validate project.yaml | `npx @cristiancorreau/forge validate --json` |
| Audit (human-readable) | `npx @cristiancorreau/forge audit` |
| Audit (JSON for CI) | `npx @cristiancorreau/forge audit --json` |
| Fail if there are critical errors | `npx @cristiancorreau/forge audit --json \| jq -e '.summary.errors == 0'` |
| Teardown (preview) | `npx @cristiancorreau/forge teardown --dry-run` |

### GitHub Actions example

```yaml
- name: Audit forge agents
  run: npx @cristiancorreau/forge audit --json | jq -e '.summary.errors == 0'
```

### JSON contract and exit codes (SPEC-083)

The inspection commands accept `--json` with **versioned, stable** output: every
payload includes `schemaVersion: "1"`. An external orchestrator (e.g. mingako)
can consume them without parsing human-oriented text.

| Command | Stable `--json` keys | Exit codes |
|---------|----------------------|------------|
| `forge export --json` | Full resolved model — validates against `export.schema.json` (`forge://schemas/v4/export` in `@cristiancorreau/forge-schemas`): `project`, `agents[]`, `commands[]`, `skills[]`, `mcpServers[]`, `perRuntime` | `0` export emitted · `1` execution error (missing/invalid `project.yaml`) |
| `forge audit --json` | `summary {errors, warnings, ok, info}`, `issues[] {level, check, message}` | `0` no audit errors · `1` at least one error |
| `forge doctor --json` | `ok`, `nodeVersion`, `forgeRootOk`, `assetsOk`, `projectYaml`, `configMode`, `runtimes[] {id, installed, version, active}` | `0` healthy (`ok: true`) · `1` some check failed |
| `forge recommend --json` | `stack {language, backend, frontend, …}`, `recommendations[] {type, id, label, installable, why, signal}` | `0` recommendations emitted · `1` execution error or failed install |
| `forge port <runtime> --json` | Portability matrix: `target`, `targetLabel`, `surfaces[]`, `dimensions[] {id, portability}`, `summary {portable, adapted, vendor, total}` | `0` matrix emitted · `1` execution error (unknown runtime, missing `project.yaml`) |
| `forge validate --json` | `valid`, `errors[]`, `warnings[]` | `0` valid · `1` invalid |

> General convention: `0` = ok, `1` = execution error or failing findings.
> `audit` and `doctor` already used `1` for "findings/failed checks"; that
> convention is kept for compatibility (no `2` is used).

**Stable round-trip**: the `forge export --json` manifest depends only on
`project.yaml` and the installed files, not on when they were generated. The
sequence `project.yaml → export → forge generate --force → export` yields the
same JSON byte for byte; an orchestrator can cache the manifest and regenerate
surfaces without invalidating it. The contract is pinned by the round-trip test
in `packages/cli/test/spec-083-json-contract.test.mjs`.

Examples:

```bash
# Resolved project manifest (agents, skills, MCP per runtime)
npx @cristiancorreau/forge export --json > forge-export.json

# Is the project healthy before launching an agent team?
npx @cristiancorreau/forge doctor --json | jq -e '.ok'
npx @cristiancorreau/forge audit --json | jq -e '.summary.errors == 0'

# How much config survives a runtime switch?
npx @cristiancorreau/forge port codex --json | jq '.summary'
```

### forge MCP server (SPEC-083 P4)

`forge mcp serve` runs a full MCP server over stdio for the project in the
current directory (or `--dir <path>`). Any MCP-aware orchestrator (mingako,
Claude Code, LangGraph, ...) can consume the catalog, the SDD methodology and
the audit at runtime without coupling to the CLI:

```bash
claude mcp add forge -- forge mcp serve
```

It exposes:

- **Resources**: each spec in `docs/specs/` (`forge://specs/SPEC-083`), the
  resolved project model (`forge://project/export`, same JSON as
  `forge export --json`) and the audit result (`forge://project/audit`, same
  JSON as `forge audit --json`).
- **Prompts**: the project's agents and commands (`.claude/agents/`,
  `.claude/commands/`) plus the forge catalog agents, as prompt templates
  (markdown content as the message; an `arguments` argument when the template
  uses `$ARGUMENTS`).
- **Tools**: `forge_audit`, `forge_recommend` and `forge_generate` — each
  returns the SPEC-083 JSON contract (`schemaVersion: "1"`, identical to the
  CLI `--json` output). `forge_generate` honors the existing guards: without
  `force` it never overwrites, and hand-written files are never overwritten.

> `forge mcp` (no subcommand) keeps its minimal server with the two read-only
> tools `guardrail_status` and `wiki_search`.

### Scannable MCP policy (SPEC-083 P5)

`forge generate` emits `.forge/mcp-policy.json`: the project's **effective**
MCP policy, derived from `mcp.servers` in `project.yaml`. It is
**default-deny** — any tool not listed in `autoApprove` requires approval —
and deterministic (no timestamps: two runs produce identical bytes). An
orchestrator (mingako) consumes it for sandboxing and approval gates without
re-deriving it.

```json
{
  "schemaVersion": "1",
  "generatedBy": "forge@3.11.0",
  "project": "demo",
  "defaultPolicy": "deny",
  "servers": [
    { "name": "postgres", "autoApprove": ["query", "list_tables"] }
  ]
}
```

The file validates against `mcp-policy.schema.json`
(`forge://schemas/v4/mcp-policy` in `@cristiancorreau/forge-schemas`). It is
emitted even without declared `mcp.servers` (empty policy, `defaultPolicy`
deny regardless).

`forge audit --mcp` scans that policy:

- **Schema**: the file validates against `mcp-policy.schema.json`.
- **Drift**: the policy matches the one derived from the current
  `project.yaml` — detects hand edits and stale policies after changing
  `project.yaml` (error; regenerate with `forge generate --force`).
- **Scope**: `autoApprove` with `"*"`/`"all"` approves everything and
  contradicts default-deny (warn; list explicit tools).
- **Presence**: error when `mcp.servers` are declared but the file is missing.

Same `--json` contract as `forge audit` (`schemaVersion: "1"`, `summary`,
`issues[]`) and same exit codes (`0` no errors, `1` at least one error):

```bash
npx @cristiancorreau/forge audit --mcp --json | jq -e '.summary.errors == 0'
```

### Approvals installer (SPEC-083 P6)

Out-of-terminal approvals, split between two projects (SPEC-081): **forge owns
the installer and the contract schema; mingako (the external orchestrator)
owns the runtime approval circuit** (daemon, UI, human resolution). Forge
never runs a daemon.

Enabled via a `project.yaml` key:

```yaml
approvals:
  enabled: true         # default: false
  timeout_seconds: 300  # human-resolution wait (default 300, max 3600)
```

With `approvals.enabled: true`, `forge generate` (claude-code runtime):

- installs the `.claude/hooks/pre-approval-gate.js` hook (pure JS, zero
  dependencies);
- registers it in `.claude/settings.json` as a `PreToolUse` entry with matcher
  `Bash|Edit|Write|ExitPlanMode|AskUserQuestion` (idempotent registration: no
  duplicates, the rest of the file is preserved).

With `false` or absent, nothing is installed and, if the registration existed,
it is removed from `settings.json`; an already-copied `.js` file is left as a
harmless orphan (unregistered hooks never run), consistent with the other
hooks forge never prunes. `forge init` and `forge adopt` apply the same rule:
when the effective `project.yaml` declares `approvals.enabled: true`, both
copy the hook **and** register it (never registration without installation).

**What the hook does**: it discovers the local daemon by reading
`~/.forge/daemon.json` (or `$FORGE_HOME/daemon.json`) — a
`{pid, port, token, startedAt}` file written by mingako with mode 0600, whose
shape validates against `daemon-discovery.schema.json`
(`forge://schemas/v4/daemon-discovery` in `@cristiancorreau/forge-schemas`).
With a daemon up, it follows the SPEC-081 protocol:
`POST http://127.0.0.1:<port>/api/v1/approvals` (bearer token, body
`ApprovalRequest` — `approval-request.schema.json`) → `201 {id}`, then
long-polls `GET /api/v1/approvals/:id/wait` for the `ApprovalResolution`
(`approval-resolution.schema.json`). `kind` maps the tool: `ExitPlanMode` →
`plan`, `AskUserQuestion` → `question`, everything else → `tool_use`;
`timeoutMs` comes from `approvals.timeout_seconds`. The decision reaches the
runtime as structured PreToolUse JSON
(`hookSpecificOutput.permissionDecision: "allow" | "deny"`, exit 0): `deny`
blocks, a circuit `timeout` **denies** (a human who does not answer is not an
allow), and `answer` denies with the human answer in
`permissionDecisionReason` so the agent incorporates it.

**Fail-open ALWAYS** (infrastructure, not decisions): without `daemon.json`,
with a corrupt file, or a daemon that is dead or hung before acknowledging the
request, the hook allows (exit 0) in under ~2s and silently — a project with
`approvals.enabled: true` and no daemon behaves exactly as before. Once the
request is acknowledged (201), it waits for the human resolution up to
`timeoutMs + 5s` and only then falls back to the same fail-open path. Local
guardrails (`pre-bash-check`, `pre-edit-check`) stay active and independent:
the approval gate adds human supervision, it does not replace them. The token
is never written to logs, and the hook only ever connects to loopback: a
`FORGE_DAEMON_URL` pointing at any other host is ignored (anti-exfiltration).

**Survival**: `forge generate --force` and `forge init --force` keep both hook
and registration; a hand-edited `pre-approval-gate.js` (without the forge
marker) is never overwritten, not even with `--force`.

---

## forge repo structure (reference)

```
forge/
├── core/
│   ├── agents/          ← Tier 1: orchestrator, test-engineer, docs-writer,
│   │                       compliance-reviewer, security-auditor,
│   │                       backend-engineer, frontend-engineer
│   └── skills/          ← security-audit, db-migrate, browser-test,
│                           wiki-ingest, wiki-query, wiki-lint,
│                           new-feature, spec, phase-kickoff,
│                           local2prod, obsidian-sync
├── profiles/            ← 15 stacks soportados
│   ├── hono-drizzle/    ← api-engineer (Hono + Drizzle + TypeScript)
│   ├── nextjs-admin/    ← admin-engineer (Next.js + shadcn/ui)
│   ├── expo/            ← mobile-engineer (React Native / Expo)
│   ├── playwright-crawler/ ← scanner-engineer
│   ├── laravel/         ← api-engineer + fullstack-engineer + migration-specialist
│   ├── wordpress/       ← wp-engineer + divi-engineer + elementor-engineer
│   └── ...              ← fastapi, django, rails, express, nestjs,
│                           go-gin, vuenuxt, sveltekit, astro
├── adapters/
│   └── claude-code/
│       └── commands/    ← wiki-ingest.md, wiki-query.md, wiki-lint.md
├── templates/
│   ├── project.yaml.tpl
│   └── wiki/            ← index.md, log.md, _templates por tipo
├── packages/
│   └── cli/             ← CLI TypeScript (publicada como @cristiancorreau/forge)
│       ├── src/         ← commands/ (init, generate, audit, adopt, …), lib/, tui/
│       ├── scripts/     ← build-assets.mjs (empaqueta core/, profiles/, …)
│       └── test/        ← suite node:test (commands, assets, adopt, wizard, …)
├── vscode-extension/    ← extensión oficial para VS Code
│   ├── src/extension.ts
│   └── package.json
└── docs/
    ├── agent-standard.md
    └── guide.md         ← estás aquí
```
