**English** · [Español](../skills.md)

# forge Skills

forge includes **14 skills** that can be invoked as slash commands. Each skill encapsulates a reusable workflow (planning a feature, migrating a database, auditing security, querying the wiki, etc.) that is triggered by an explicit command or by contextual triggers.

## Summary table

| Skill | Command | Category | Main trigger |
|---|---|---|---|
| session-start | `/session-start` | Session | Opens the session: detects repo state and routes |
| session-close | `/session-close` | Session | Closes the session: commit → daily note → sync → PR |
| spec | `/spec` | Development flow | When creating or updating a spec in `docs/specs/` |
| new-feature | `/new-feature` | Development flow | When starting any new feature |
| security-audit | `/security-audit` | Development flow | When implementing/modifying endpoints or auth |
| local2prod | `/local2prod` | Development flow | When deploying a finished feature to production |
| db-migrate | `/db-migrate` | Data | When modifying the schema / migrating the DB |
| wiki-ingest | `/wiki-ingest` | Wiki / knowledge | When adding documentation or knowledge to the wiki |
| wiki-query | `/wiki-query` | Wiki / knowledge | When answering questions with the project wiki |
| wiki-lint | `/wiki-lint` | Wiki / knowledge | After a wiki-ingest or to verify the wiki |
| browser-test | `/browser-test` | Testing / verification | Before considering a UI task finished |
| phase-kickoff | `/phase-kickoff` | Sprint | When starting a new phase or sprint |
| aitmpl-search | `/aitmpl-search` | Catalog | When exploring AI agent frameworks/tools |
| obsidian-sync | `/obsidian-sync` | Integrations | When syncing the Obsidian vault with the code |

---

## Session

### session-start
- **Command:** `/session-start`
- **Purpose:** Opens the work session: detects the repo state, identifies the scenario, and routes accordingly. It is the first step of the SDD workflow, before any code editing.
- **Trigger:** `/session-start`, "start session", "kick off session", "start working"; when opening the editor and getting to work.

### session-close
- **Command:** `/session-close`
- **Purpose:** Closes the work session with a pipeline: commit, changeset, GitHub Projects, daily note, release notes, sync, and PR. It is the last step of the SDD workflow.
- **Trigger:** `/session-close`, "close session", "end session", "wrap up the day"; when finishing work on a feature branch.

---

## Development flow

### spec
- **Command:** `/spec`
- **Purpose:** Draft feature specs following the forge framework template. It is triggered before writing any new spec.
- **Trigger:** `/spec`, "create spec", "draft spec", "new spec"; when creating a new spec in `docs/specs/`; when updating an existing spec after implementation changes; when turning a ticket/issue into a formal spec.

### new-feature
- **Command:** `/new-feature`
- **Purpose:** Complete checklist for implementing a new feature from planning to deploy. It orchestrates the other skills in the correct order. It ensures spec, security, and deploy are never skipped.
- **Trigger:** `/new-feature`, "new feature", "I want to add", "implement"; when starting any new feature, no matter how small.

### security-audit
- **Command:** `/security-audit`
- **Purpose:** Security checklist for API endpoints and modules that handle authentication, authorization, or sensitive data. Stack-agnostic.
- **Trigger:** `/security-audit`, "audit security", "review endpoints", "security check"; when implementing new endpoints; when modifying auth; before merging a PR that touches protected routes; when the `security-auditor` requests it in a review.

### local2prod
- **Command:** `/local2prod`
- **Purpose:** Complete production release flow. Compatible with Vercel, Railway, Fly.io, GitHub Actions, and custom pipelines. Never consider a task finished without a deploy in READY/SUCCESS state. The provider comes from `project.yaml` (`deploy.provider`).
- **Trigger:** `/local2prod`; when finishing a feature and wanting to deploy it to production.

---

## Data

### db-migrate
- **Command:** `/db-migrate`
- **Purpose:** Safe flow for running database migrations. Compatible with Prisma, Drizzle, ActiveRecord (Rails), Alembic (Python), and Goose (Go).
- **Trigger:** `/db-migrate`, "migrate schema", "update database", "migrate DB"; when modifying the schema; before/after adding models, columns, or indexes; when resolving migration conflicts between branches.

---

## Wiki / knowledge

> Wiki structure, the `forge wiki` commands (init/status/ingest/query/lint), and their
> relationship to these skills: see [docs/en/wiki.md](wiki.md).

### wiki-ingest
- **Command:** `/wiki-ingest`
- **Purpose:** Ingests a new source into the project wiki. It stores the original in `raw/`, compiles knowledge into wiki pages, updates the index, and logs the operation.
- **Trigger:** `/wiki-ingest`, "ingest", "add to the wiki", "learn from"; when incorporating documentation/papers/specs/decisions; when reading dependency code; when the user says "remember this" or "save this to the wiki".

### wiki-query
- **Command:** `/wiki-query`
- **Purpose:** Answers questions using the project wiki as a knowledge base, citing the relevant pages. Optionally archives the answer as a synthesis page.
- **Trigger:** `/wiki-query`; before implementing something the wiki might already have documented; to answer questions about past decisions, technical concepts, or regulation; when the user asks about the project's accumulated knowledge.

### wiki-lint
- **Command:** `/wiki-lint`
- **Purpose:** Verifies the structural integrity of the wiki: index, links, orphans, and overall health. Auto-repairs what it can and reports what needs a human decision.
- **Trigger:** `/wiki-lint`, "lint wiki", "verify wiki", "review wiki"; after a wiki-ingest; periodically (at the start of each sprint); when broken links or orphaned pages are suspected.

---

## Testing / verification

### browser-test
- **Command:** `/browser-test`
- **Purpose:** Browser automation (agent-browser, a Rust CLI over CDP) to verify UI in development, test critical flows, capture evidence and visual diffs, and test responsiveness.
- **Trigger:** `/browser-test`, "open in browser", "screenshot of", "verify it renders", "test visually", "navigate to", "test the flow for", "see how it looks", "review this URL", "capture screen of", "visual test", "open <url>"; before considering a UI task finished; when inspecting a URL; when capturing compliance evidence.

---

## Sprint

### phase-kickoff
- **Command:** `/phase-kickoff`
- **Purpose:** Protocol for starting a new development phase in a forge project. It is triggered at the beginning of each new sprint or phase.
- **Trigger:** `/phase-kickoff`; when starting work on a new phase or sprint of the project.

---

## Catalog

### aitmpl-search
- **Command:** `/aitmpl-search`
- **Purpose:** Searches forge's curated catalog: AI agent frameworks, installable MCP servers, stack profiles, and tools. Offline search (local catalog), optionally extensible to GitHub with `--github`.
- **Trigger:** `/aitmpl-search`; when exploring AI agent frameworks/tools; before designing a new Tier 2 agent (to check whether a profile already exists); when installing an MCP server; to explore reusable architecture patterns.

---

## Integrations

### obsidian-sync
- **Command:** `/obsidian-sync`
- **Purpose:** Keeps an Obsidian vault in sync with the project code. An integration skill: it requires Obsidian running with the Local REST API plugin, a configured token, and `vault_path` set in `project.yaml`.
- **Trigger:** `/obsidian-sync`, "update obsidian", "sync vault", "document changes".