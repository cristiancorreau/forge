# ADR-002 — Kiro support level in Forge v2

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-05-17 |
| **Deciders** | Forge maintainers |
| **Ticket** | F2-09 |

---

## Context

Kiro is an AI IDE developed by Amazon, announced in June 2025 and in preview through the end of 2025. It introduced several concepts directly relevant to Forge:

- **Steering documents** (`.kiro/steering/`) — persistent project context files loaded into every agent interaction, functionally similar to Forge's `CLAUDE.md`.
- **Specs workflow** — a structured three-file spec system (`requirements.md`, `design.md`, `tasks.md`) gated by agent-driven approval, philosophically aligned with Forge's Spec-Driven Development.
- **Hooks** — JSON-defined event handlers that fire on file-change, file-create, or pre-edit events, instructing Kiro's agent to take specific actions.
- **Agent teams** — a multi-agent orchestration capability announced but not shipped to public preview by August 2025.

Forge already ships a Kiro adapter (`adapters/kiro/generate-steering.py`) that generates steering docs from `project.yaml`. The question for Forge v2 is: should Kiro be promoted to a first-class runtime with full feature parity alongside Claude Code?

### State of Kiro as of 2026-05

- Still in limited availability; not generally available.
- Adoption metrics significantly below Claude Code, Cursor, and VS Code + Copilot in the developer tooling space.
- Agent-teams feature (critical for Forge's orchestrator pattern) was not publicly available.
- Hooks API changed between preview builds; no stable versioned contract.
- Community ecosystem (shared steering-doc libraries, integrations) is sparse.
- Amazon has not published a public roadmap with committed dates.

---

## Options considered

### Option A — Full Forge v2 support (first-class runtime)

Make Kiro a fully supported runtime alongside Claude Code:
- Extend `forge-init.py` with a `--runtime kiro` mode
- Generate steering docs, hooks, and a Kiro-native commands equivalent
- Maintain feature parity for SDD workflow, agent teams, and session hooks
- Write a spec bridge between Forge specs and Kiro's three-file spec format

**Pros:** positions Forge ahead of the market if Kiro gains traction; Kiro's concepts map well to Forge's philosophy.

**Cons:** significant maintenance burden for an unstable, low-adoption platform; hooks API instability means the adapter would break between Kiro preview builds; agent-teams not available means the core Forge orchestrator pattern cannot be exercised.

### Option B — Monitoring status (current adapter maintained)

Keep the existing adapter working and updated, document what works and what doesn't, and revisit the decision when Kiro reaches GA.

**Pros:** low maintenance cost; avoids investing in an API that is still changing; current adapter already provides real value (steering docs) to users who choose Kiro.

**Cons:** Forge users on Kiro get partial support; if Kiro grows rapidly, Forge is behind.

### Option C — Drop Kiro support

Remove the adapter until Kiro reaches GA.

**Pros:** no maintenance burden.

**Cons:** regresses existing users who use the steering-doc adapter; unnecessarily hostile to a platform with genuine philosophical alignment.

---

## Decision

**Option B — Monitoring status with current adapter maintained.**

The existing `generate-steering.py` adapter is extended to cover the Forge v2 SDD session flow, a `commands.md` steering doc, and a Kiro-native branch guard hook. No new runtime integration points are added until Kiro reaches GA.

The decision will be revisited when any of these conditions are met:

1. Kiro reaches general availability with a stable, versioned API.
2. Agent-teams (multi-agent orchestration) ships to GA.
3. Kiro adoption crosses a threshold where Forge users are regularly requesting Kiro-specific features (signal: >3 GitHub issues or community requests in a 30-day window).

---

## Consequences

### Positive

- The adapter delivers immediate value: any Forge project can generate steering docs that encode SDD rules, agent roster, session flow, and Forge commands for Kiro's context.
- Maintenance cost is bounded: one Python script, no runtime coupling.
- The hooks output gives Kiro users a branch guard rule out of the box.
- The `docs/runtimes/kiro.md` document clearly communicates what works and what doesn't, avoiding user confusion.

### Negative

- Kiro users cannot use the Forge orchestrator pattern (no agent-teams parity).
- Forge slash commands are not available in Kiro (`commands.md` documents them descriptively, but Kiro cannot invoke them).
- If Kiro grows quickly, Forge will need to catch up.

### Neutral

- The concept mapping documented in `docs/runtimes/kiro.md` (steering docs vs CLAUDE.md, Kiro specs vs Forge specs, Kiro hooks vs Forge hooks) serves as the design contract for when full support is implemented.
- ADR-003 should be opened when the re-evaluation trigger fires.
