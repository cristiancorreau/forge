**English** · [Español](../../runtimes/opencode.md)

# Forge v2 on OpenCode

> **Status:** Supported
> **Last reviewed:** 2026-05
> **Generator:** `npx @cristiancorreau/forge generate --runtime opencode`

---

## What is OpenCode?

OpenCode is an open-source coding agent for the terminal, compatible with Claude, GPT-4, and other models via API. It uses `AGENTS.md` as system context, analogous to how Claude Code uses `CLAUDE.md`.

**Fundamental difference from Claude Code:** OpenCode has no `Agent` tool and no support for parallel subagents. All work happens in a single sequential session. This is the most important runtime difference when using Forge on OpenCode.

---

## Installation

### Prerequisites

```bash
# Install OpenCode
npm install -g opencode-ai   # or follow the official instructions at opencode.ai
```

The forge CLI runs on Node.js 20+ (no additional system dependencies).

### Generate AGENTS.md and the Forge commands

```bash
# From the project root (requires project.yaml)
npx @cristiancorreau/forge generate --runtime opencode
```

This generates `AGENTS.md` in the project root (with the agent roster, project
stack, global security rules, and compliance guardrails) and installs the
OpenCode commands under `.opencode/commands/`.

The 6 available commands are:

| Command | Description |
|---------|-------------|
| `/session-start` | Initializes the session, detects the branch and repo state |
| `/plan` | Creates or reviews specs in `docs/specs/` (SDD flow) |
| `/work` | Implements a spec in serial mode |
| `/review` | Code review with a binding verdict |
| `/ship` | Deploy pipeline with polling and smoke tests |
| `/session-close` | Closes the session with a commit, daily note, and PR |

### Configure automatic context

Create `.opencode/config.json` so OpenCode loads AGENTS.md in every session:

```json
{
  "model": "claude-sonnet-4-5",
  "context": {
    "files": [
      "AGENTS.md",
      "project.yaml"
    ]
  }
}
```

---

## Differences from Claude Code

### Available commands

| Forge command | Claude Code | OpenCode | Differences |
|---------------|-------------|----------|-------------|
| `/session-start` | Not available | Yes | OpenCode-only |
| `/plan` | Not available (inline SDD) | Yes | OpenCode-only |
| `/work` | `/new-feature` | Yes | Different logic (see agent teams section) |
| `/review` | `/review` | Yes | A single step instead of multi-agent |
| `/ship` | `/deploy-check` | Yes | Uses the CLI (`vercel`, `railway`, `fly`) instead of the Vercel MCP |
| `/session-close` | Not available | Yes | OpenCode-only |
| `/wiki-ingest` | Yes | No | Requires Claude Code |
| `/wiki-query` | Yes | No | Requires Claude Code |
| `/wiki-lint` | Yes | No | Requires Claude Code |

### Agent teams — the most important difference

In **Claude Code**, `/work` (or the `new-feature` skill) delegates implementation to a team of subagents that run in parallel:

```
Orchestrator
├── backend-engineer  [worktree A, run_in_background: true]
├── frontend-engineer [worktree B, run_in_background: true]
└── test-engineer     [worktree C, run_in_background: true]
         ↓ (all in parallel, coordinated via SendMessage)
    merge + review
```

In **OpenCode**, the same `/work` command runs everything serially within the current session. There are no subagents and no parallelism:

```
Single session
  → [Backend] implement endpoints
  → [Frontend] build UI components
  → [Tests] write tests
  → verify (lint + tests)
  → update spec
```

**The orchestrator model changes:** in OpenCode there is no separate agent doing the coordination — the model takes on different roles in sequence within the same session. AGENTS.md describes the roster so the model knows each role's domain, but it does not spawn them as independent processes.

**Recommended workaround for large features:** instead of a large spec that Claude Code would parallelize, split it into atomic specs and run them across successive sessions:

```
# Instead of: one large spec implemented by 3 agents in parallel
#             → in OpenCode it takes just as long but with more long-context risk

# Prefer: atomic specs in separate sessions
/plan fase1 "Authentication endpoints"  → /work → /review → /ship
/plan fase2 "Login components"           → /work → /review → /ship
/plan fase3 "E2E flow tests"             → /work → /review → /ship
```

### Hooks

Claude Code has a hook system that intercepts tools in real time:

| Claude Code hook | Effect | OpenCode equivalent |
|-----------------|--------|------------------------|
| `PreToolUse:Edit` — branch guard | Blocks edits on main before the tool runs | Guardrail embedded in AGENTS.md **+ reinforced at commit** by `.githooks/pre-commit` |
| `PreToolUse:Bash` — debug detection | Detects `console.log`/`print` before commit | Guardrail embedded in AGENTS.md **+ reinforced at commit** by `.githooks/pre-commit` |
| `PreToolUse:Bash` — production safety | Blocks destructive commands without confirmation | **Not available.** Guardrail embedded in AGENTS.md |
| `Stop` — session summary | On session end, runs the persistence script | Replaced by the `/session-close` flow |
| `pre-commit` git hook | Injects stats into progress.html | **Supported.** The shared `.githooks/pre-commit` (POSIX, no Python) reinforces branch guard and debug detection on every commit |

**Alternative mechanism:** `npx @cristiancorreau/forge generate --runtime opencode` includes guardrail sections in the generated AGENTS.md and, in addition, writes a shared git hook `.githooks/pre-commit` (POSIX, no Python) that reinforces branch guard and debug detection on every commit. Enable it once with `git config core.hooksPath .githooks`. This turns the hook rules into system instructions the model follows during the session, backed by the git hook. See `adapters/opencode/HOOKS.md` for the exact text of each guardrail and how to include them.

Security in OpenCode depends on AGENTS.md being well written and loaded into context — not on automatic script execution. For projects with strict compliance requirements, this difference matters.

### /review verdicts

The `APPROVED / CHANGES_REQUESTED / BLOCKED` verdict system works identically across both runtimes. The difference is in implementation:

| Aspect | Claude Code | OpenCode |
|---------|-------------|----------|
| Who reviews | A team of agents (security-auditor, compliance-reviewer) in parallel | The model in a single step covering all dimensions |
| State file | `.claude/review-status.json` | `.opencode/review-status.json` |
| Binding verdict | Yes — `/ship` reads it before deploying | Yes — `/ship` reads it before deploying |
| Compliance review | Only in enterprise mode, via a dedicated agent | Only in enterprise mode, included in the single step |

The verdict written to `.opencode/review-status.json` is read by `/ship` to block the deploy if it is not approved.

---

## Daily use

A typical work session with Forge on OpenCode:

```
1. START THE SESSION
   /session-start
   → detects the current branch, shows context, recalls session rules

2. PLAN (if it's a new feature)
   /plan fase1 "Feature name"
   → creates a spec in docs/specs/, applies Planner-Critic, marks it ready

3. IMPLEMENT
   /work
   → detects the spec in ready state, proposes a sequential plan, implements step by step

4. REVIEW
   /review
   → single review covering security, quality, tests, and compliance (enterprise mode)
   → produces an APPROVED / CHANGES_REQUESTED / BLOCKED verdict
   → saves the result to .opencode/review-status.json

5. DEPLOY (only if the verdict is APPROVED)
   /ship
   → checks review-status.json and git status, merges the PR if applicable,
     triggers the deploy via CLI, polls until READY, verifies runtime logs

6. CLOSE THE SESSION
   /session-close
   → commits pending changes, generates a daily note, updates RELEASE-NOTES.md,
     pushes, and creates the PR on GitHub
```

---

## Known limitations

- **No parallel agent teams.** OpenCode has no `Agent` tool and no `run_in_background`. The entire implementation is single-threaded within the active session. For large features, split into atomic specs.

- **No PreToolUse/Stop hooks.** Security guardrails (branch guard, debug detection, production safety) are implemented as instructions in AGENTS.md, not as automatic tool interception. Compliance depends on the model following the instructions, not on forced script execution.

- **No isolation via worktrees.** Claude Code can assign each agent to a separate git worktree to avoid conflicts during parallel work. In OpenCode this does not apply because everything happens in a single process.

- **No Vercel MCP.** `/ship` uses CLI commands (`vercel deploy --prod`, `vercel inspect`, `vercel logs`) instead of the Vercel MCP tools available in Claude Code. The result is equivalent but requires the provider's CLI to be installed and authenticated.

- **No wiki skills.** The `/wiki-ingest`, `/wiki-query`, and `/wiki-lint` commands are specific to Claude Code. There is no equivalent in OpenCode.

- **Long context on large features.** With no parallelism, implementing a complex feature in a single session can hit context limits. Mitigation: `/session-close` at the end of each stage, reopen with `/session-start` for the next one.
