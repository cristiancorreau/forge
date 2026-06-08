**English** · [Español](../../runtimes/README.md)

# Runtimes supported by forge

forge generates native configuration for 19 AI runtimes (4 native + 15 rules-based).
Each runtime has its own adapter in `adapters/<runtime>/` that reads `project.yaml` and
produces the files that tool expects.

## Support table

### Native runtimes (4)

| Runtime | Type | Generated files | Support level |
|---------|------|-----------------|---------------|
| [Claude Code](#claude-code) | native | `CLAUDE.md`, `.claude/agents/`, `.claude/commands/`, `.claude/settings.json` | Full |
| [OpenCode](#opencode) | native | `AGENTS.md` | Supported |
| [Codex CLI](#codex-cli) | native | `AGENTS.md` | Supported |
| [Kiro](#kiro) | native | `.kiro/steering/*.md` | Monitoring |

### Rules-based runtimes (15)

| Runtime | ID | Generated file | Type |
|---------|----|----------------|------|
| Cursor | `cursor` | `.cursor/rules/forge.md` | rules-based |
| Windsurf | `windsurf` | `.windsurf/rules/forge.md` | rules-based |
| GitHub Copilot | `copilot` | `.github/copilot-instructions.md` | rules-based |
| Gemini CLI | `gemini` | `GEMINI.md` | rules-based |
| Zed | `zed` | `.zed/rules.md` | rules-based |
| Cline | `cline` | `.clinerules` | rules-based |
| Aider | `aider` | `CONVENTIONS.md` | rules-based |
| Continue | `continue` | `.continue/rules/forge.md` | rules-based |
| Roo Code | `roo` | `.roo/rules/forge.md` | rules-based |
| Amp | `amp` | `AGENTS.md` | rules-based |
| Augment Code | `augment` | `.augment/rules/forge.md` | rules-based |
| Google Antigravity | `antigravity` | `.antigravity/rules/forge.md` | rules-based |
| OpenClaw | `openclaw` | `.openclaw/rules/forge.md` | rules-based |
| Pi | `pi` | `.pi/rules/forge.md` | rules-based |
| Hermes | `hermes` | `.hermes/rules/forge.md` | rules-based |

## Runtime detection (`forge doctor`)

`forge doctor` detects which runtimes you have installed locally by looking for their binary on the
`PATH` and reading its version. This tells you which runtimes you can enable in `project.yaml` before
generating configuration.

| Runtime | Detected binary | Check manually |
|---------|-------------------|-----------------------|
| Claude Code | `claude` | `claude --version` |
| OpenCode | `opencode` | `opencode --version` |
| Codex CLI | `codex` | `codex --version` |
| Kiro | IDE (no CLI exposed) | open the Kiro app |

```bash
# Reports installed runtimes (binary + version) and validates project.yaml v2
npx @cristiancorreau/forge doctor
```

> For forge to **generate** configuration for a runtime, that runtime does not need to be installed:
> `forge doctor` only reports the state of the environment. Generation is controlled by
> `runtimes.active` in `project.yaml` and `forge generate`.

---

## Claude Code

**Support: full — all forge features**

**Installation:** `npm i -g @anthropic-ai/claude-code` (verify with `claude --version`)

forge's primary runtime. Generates:

- `CLAUDE.md` — project context (stack, agents, SDD workflow, phases)
- `.claude/agents/*.md` — agents with injected frontmatter and scope
- `.claude/commands/*.md` — slash commands for active skills
- `.claude/settings.json` — permissions pre-configured according to the stack

Supports all forge agents (Tier 1 core, Tier 2 profiles, Tier 3 specialized),
slash commands, parallel teams, and all integrations.

Generator: `packages/cli/src/lib/generators/claude-code.ts`

---

## OpenCode

**Support: serial commands, no parallel teams**

**Installation:** `npm i -g opencode-ai` (verify with `opencode --version`)

OpenCode reads `AGENTS.md` from the repository root. The adapter generates this file with:

- Project stack
- Global rules for all agents
- Full roster with descriptions read from forge's `.md` files
- Compliance section if there are active frameworks

Limitations compared to Claude Code:
- Does not support parallel agent teams
- No forge-specific slash commands (OpenCode has its own command system)
- Instructions go in a single `AGENTS.md`, without separate files per agent

Generator: `packages/cli/src/lib/generators/opencode.ts`

---

## Codex CLI

**Support: prompt templates, inline SDD workflow, autonomy rules**

**Installation:** `npm i -g @openai/codex` (verify with `codex --version`)

Codex CLI (OpenAI) reads `AGENTS.md` from the root. The adapter generates a file enriched
relative to OpenCode's because Codex operates autonomously in the terminal:

- Includes an "SDD Workflow" section with explicit steps
- Includes "Security rules" and "Autonomy limits" inline
- The header explicitly identifies the file as generated for Codex CLI

Limitations:
- Does not support forge slash commands
- No per-agent scope (everything goes in a single AGENTS.md)

Generator: `packages/cli/src/lib/generators/codex.ts`

Reference: https://github.com/openai/codex

---

## Kiro

**Support: monitoring — steering docs + hooks, no slash commands**

**Installation:** download the IDE from [kiro.dev](https://kiro.dev) (does not expose its own CLI)

Kiro IDE reads files from `.kiro/steering/` as persistent context across all
conversations. The adapter generates:

- `.kiro/steering/product.md` — product description and stack
- `.kiro/steering/structure.md` — project structure and SDD workflow
- `.kiro/steering/agents.md` — agent roster and responsibilities
- `.kiro/steering/compliance.md` — compliance rules (only if there are active frameworks)

Limitations:
- No slash commands (Kiro has no such concept)
- No per-agent scope in separate files
- Existing files are not overwritten by default (use `--force`)

Generator: `packages/cli/src/lib/generators/kiro.ts`

---

## forge generate — Unified entry point

After modifying `project.yaml` (mode change, new agent, new profile), regenerate
the configuration for all active runtimes with a single command:

```bash
# Regenerate all automatically detected runtimes
npx @cristiancorreau/forge generate

# Regenerate only a specific runtime
npx @cristiancorreau/forge generate --runtime claude-code
npx @cristiancorreau/forge generate --runtime kiro

# See what would be generated without writing files
npx @cristiancorreau/forge generate --dry-run

# Overwrite existing files
npx @cristiancorreau/forge generate --force
```

### Automatic runtime detection

The CLI detects which runtimes are installed from the files present in the project:

| Directory / file | Detected runtime |
|---------------------|------------------|
| `.claude/` | claude-code |
| `.opencode/` | opencode |
| `.kiro/` | kiro |
| `AGENTS.md` (without `.claude/` or `.opencode/`) | codex |

To declare runtimes explicitly (they take precedence over auto-detection),
add to `project.yaml`:

```yaml
runtimes:
  active:
    - claude-code
    - kiro
```

### Typical flow

```
project.yaml changes
       ↓
npx @cristiancorreau/forge generate
       ↓
  [claude-code] → CLAUDE.md
  [opencode]    → AGENTS.md (OpenCode format)
  [kiro]        → .kiro/steering/*.md
       ↓
git add -p && git commit
```

### Relationship to forge init

`forge init` is for the initial setup of a project (runs the wizard, installs
agents, generates settings.json, copies commands). `forge generate` is for regenerating the
translation layer `project.yaml → native configs` after changes, without redoing the full init.
