**English** · [Español](../../runtimes/kiro.md)

# Kiro Runtime — Forge Support

> **Status:** Monitoring  
> **Last reviewed:** 2026-05  
> **Generator:** `npx @cristiancorreau/forge generate --runtime kiro`

## Evaluation summary

Kiro is an AI IDE by Amazon (announced June 2025, preview through late 2025). It introduced a novel "steering documents" system, a specs workflow, and a hooks system — all genuinely aligned with Forge's design philosophy.

As of mid-2026, however, Kiro remains in limited preview. Adoption metrics are low compared to Claude Code (the primary Forge target), VS Code + Copilot, or Cursor. Its hooks API was documented but changed between preview builds; agent-teams support was announced but not shipped publicly by August 2025. The ecosystem (third-party plugins, community steering-doc libraries) is sparse.

**Decision: monitoring status.** The current adapter is maintained. Full Forge v2 support will be activated when Kiro reaches GA and demonstrates stable adoption.

---

## Current Forge support

### What works today

| Feature | Forge mechanism | Status |
|---------|----------------|--------|
| Project context | Steering docs (`product.md`, `structure.md`, `agents.md`, `compliance.md`) | Working |
| SDD workflow description | `structure.md` includes spec-before-code rules and v2 session flow | Working |
| Agent roster | `agents.md` lists active/compliance/specialized agents | Working |
| Compliance rules | `compliance.md` generated when frameworks are active | Working |
| Core commands | `commands.md` describes 6 Forge commands for Kiro's agent context | Working |
| Branch guard hook | `.kiro/hooks/pre-edit-branch-guard.json` | Working |
| Pre-bash-check hook | `.kiro/hooks/pre-bash-check.json` blocks destructive commands | Working |
| Post-turn debug detection hook | `.kiro/hooks/post-turn-check.json` warns about debug statements | Working |

### What does not work

| Feature | Reason |
|---------|--------|
| Forge slash commands | Kiro uses `.kiro/steering/` for context, not `.claude/commands/`. No command-invocation mechanism equivalent to Claude Code's `/command`. |
| Agent spawning via Forge orchestrator | Kiro's agent-teams feature was not GA as of Aug 2025. The Forge orchestrator pattern (spawn + SendMessage + worktrees) is Claude Code-specific. |
| Hooks parity | Kiro hooks fire on file-edit events; Forge hooks (Claude Code) fire on pre/post tool calls and session lifecycle. The semantics differ. |
| Profile injection | `forge init` installs `.claude/agents/` files — Kiro has no equivalent per-project agent-definition directory. |
| Memory / AGENTS.md | Kiro does not have a direct equivalent to `AGENTS.md` + project memory. Steering docs are a partial substitute. |

---

## Concept mapping: Kiro vs Forge

### Steering docs vs CLAUDE.md

| Dimension | Kiro steering docs | Forge CLAUDE.md |
|-----------|-------------------|-----------------|
| Location | `.kiro/steering/*.md` | `CLAUDE.md` (root) |
| Scope | Multiple focused files, one topic each | Single file, all project context |
| Persistence | Loaded on every interaction automatically | Loaded on every Claude Code session |
| Customization | Per-file inclusion mode (`mode: auto` / `mode: agent`) | Sections within one file |
| Generation | `forge generate --runtime kiro` reads `project.yaml` | `forge generate --runtime claude-code` reads `project.yaml` |

**Summary:** steering docs are functionally equivalent to CLAUDE.md but split across files. The Forge adapter maps each logical section to one steering file.

### Kiro specs vs Forge specs

| Dimension | Kiro specs | Forge specs |
|-----------|-----------|-------------|
| Location | `.kiro/specs/<feature>/` | `docs/specs/` |
| Structure | `requirements.md`, `design.md`, `tasks.md` (three fixed files) | Single `[ID]-[name].md` with frontmatter |
| Workflow | Kiro's agent generates spec files step by step | Human + docs-writer agent create the spec; must be APPROVED before coding |
| Gating | Kiro generates tasks after spec approval | Forge orchestrator refuses to spawn agents without an APPROVED spec |
| Task tracking | `tasks.md` with checkboxes, Kiro marks them done | Spec stays as living doc; git history tracks progress |

**Summary:** Kiro's three-file spec model is more structured. Forge's single-file model is simpler and runtime-agnostic. A future bridge could translate Kiro specs to Forge spec format.

### Kiro hooks vs Forge hooks

| Dimension | Kiro hooks | Forge hooks (Claude Code) |
|-----------|-----------|--------------------------|
| Format | JSON files in `.kiro/hooks/` | Shell scripts + `settings.json` hooks config |
| Trigger events | `onFileChange`, `onFileCreate`, `onBeforeEdit` | `PreToolUse`, `PostToolUse`, `Stop`, `Notification` |
| Execution | Kiro agent runs a prompt when event fires | Shell command executed by Claude Code runtime |
| Agent context | Hook can instruct Kiro's agent | Hook can call external scripts, not Claude itself |

**Summary:** Kiro hooks are AI-prompt-based (instruct the agent what to do). Forge hooks are shell-command-based (run scripts). The semantics differ enough that 1:1 parity is not feasible. The adapter generates a Kiro-native JSON hook for the branch guard rule.

---

## How to use the Kiro adapter today

### Prerequisites

None beyond Node.js 20+. The CLI is 100% TypeScript since v2.8.0 (no Python).

### Usage

```bash
# From any directory inside the project (walks up to find project.yaml)
npx @cristiancorreau/forge generate --runtime kiro

# Force overwrite existing steering files
npx @cristiancorreau/forge generate --runtime kiro --force
```

### Output

```
.kiro/
  steering/
    product.md      ← project name, description, stack, team
    structure.md    ← SDD workflow, session flow, dev commands, hard rules
    agents.md       ← agent roster with responsibilities
    compliance.md   ← compliance rules (only if frameworks are configured)
    commands.md     ← 6 core Forge commands for Kiro's agent context
  hooks/
    pre-edit-branch-guard.json  ← warns when editing on main/master
    pre-bash-check.json         ← blocks destructive commands (DROP TABLE, --force-reset, git push --force, rm -rf /)
    post-turn-check.json        ← warns about debug statements (console.log, debugger, binding.pry, var_dump, dd)
```

### project.yaml fields used

```yaml
project:
  name: My Project
  description: What the project does
  language: typescript   # typescript | python | ruby | go | php
  status: active

stack:
  backend: hono
  frontend: next.js
  database: postgres
  cache: redis
  testing: [vitest, playwright]

team:
  name: Core Team

paths:
  specs: docs/specs

agents:
  active: [orchestrator, backend-engineer, frontend-engineer]
  compliance: []
  specialized: []

compliance:
  frameworks: []   # gdpr, lgpd, hipaa, pci-dss, etc.
```

---

## Roadmap for full Forge v2 support

The following changes would be required to promote Kiro from "monitoring" to "full support":

1. **Kiro GA release** — stable hooks API, no breaking changes between builds.
2. **Agent-teams parity** — Kiro must support multi-agent invocation so the Forge orchestrator pattern can run natively.
3. **Command equivalent** — a `.kiro/commands/` directory or similar mechanism to register Forge slash commands.
4. **forge Kiro install mode** — extend `forge init` so the `--runtime kiro` flag installs steering docs instead of (or alongside) CLAUDE.md + `.claude/agents/`.
5. **Spec bridge** — a script that converts Forge specs (`docs/specs/`) to Kiro's three-file spec format and vice versa.
6. **Session hook parity** — map Forge's `PreToolUse`/`PostToolUse` hooks to Kiro's `onBeforeEdit` where semantics overlap.
