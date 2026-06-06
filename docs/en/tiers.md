**English** · [Español](../tiers.md)

# forge's 3-TIER System

forge organizes its agents into three levels (TIERs) according to their **degree of reusability**. The problem this system solves is avoiding two extremes: agents so generic that they know nothing about the stack or the business, and agents so specific that they have to be rewritten in every project.

The key to the model is separating the **role** (what kind of output the agent produces) from the **context** (what stack it uses and what business concepts it knows). This way, a single role —for example "backend engineer"— can exist in three versions of increasing specialization without needlessly duplicating knowledge:

- **Tier 1 (Universal/core):** defined by its output type, not by the technology. Lives in `core/`.
- **Tier 2 (Profile/stack):** the same role, but with stack-specific instructions. Lives in `profiles/`.
- **Tier 3 (Domain/project):** knows the product's business concepts. Lives only in the project.

A project composes its team by taking what's universal from core, specializing it with the profiles it activates, and rounding it out with its own domain agents.

---

## Tier 1 — Universal (core)

**Definition.** Agents defined by their output type, not by the technology. Any project on any stack uses them **without modification**.

**Criterion.** If the agent works the same in a Rails, Hono, and FastAPI project without changing anything, it's Tier 1.

**Location.** `core/agents/`

**Naming.** `<role>-engineer` / `<role>-reviewer` / `<role>-auditor`

**Real examples (`core/agents/`):**

| Agent | Role |
|---|---|
| `orchestrator` | Lead agent that coordinates the team: breaks down tasks, delegates, and synthesizes results (model: opus). A single invocation per session. Refuses to spawn agents without an APPROVED spec. |
| `backend-engineer` | Implements the generic backend (API, database, business logic; model: sonnet). Used when the project does not activate a specific backend profile. |
| `frontend-engineer` | Implements the generic frontend (UI, components, pages; model: sonnet). Used when the project does not activate a specific frontend profile. |
| `test-engineer` | Writes and maintains unit, integration, and E2E tests (model: sonnet). Does NOT write production code. |
| `docs-writer` | Maintains specs, ADRs, READMEs, and public documentation (model: sonnet). Does NOT modify production code. |
| `compliance-reviewer` | Reviews each PR against the active compliance frameworks; has veto power (model: opus). A binding gate before merging. |
| `security-auditor` | Audits the code for vulnerabilities: authentication, authorization, injection, and dependencies (model: opus). Does NOT modify code. |

---

## Tier 2 — Profile (stack)

**Definition.** The same role as a Tier 1 agent, but with stack-specific instructions: commands, conventions, and anti-patterns particular to the technology.

**Location.** `profiles/<stack>/agents/`

**Naming.** Same as the Tier 1 it extends — **same name, different path**. The frontmatter includes `profile: <stack>`.

**Collision rule (profile wins over core).** When a profile provides, for example, `api-engineer`, that file takes **priority over the generic Tier 1**. The installer (`forge init`) installs **profiles first and then core without overwriting**, so the stack's specialized version always prevails over the generic one.

A project can activate **several profiles** at once (for example, an API profile + a frontend one + an admin one).

**Available profiles and their agents:**

| Profile | Agent(s) | Stack |
|---|---|---|
| `hono-drizzle` | `api-engineer` | Hono + Drizzle + PostgreSQL (TypeScript) |
| `fastapi` | `api-engineer` | FastAPI + SQLAlchemy/SQLModel + PostgreSQL (Python) |
| `flask` | `api-engineer` | Flask 3 + blueprints + SQLAlchemy + marshmallow/pydantic (Python) |
| `express` | `api-engineer` | Express + Prisma/TypeORM + PostgreSQL (Node.js) |
| `nestjs` | `api-engineer` | NestJS + TypeORM/Prisma + PostgreSQL (TypeScript) |
| `django` | `api-engineer` | Django 4.x/5.x + DRF/Django Ninja + PostgreSQL |
| `go-gin` | `api-engineer` | Go with Gin/Echo + sqlc + PostgreSQL + golang-migrate |
| `springboot` | `api-engineer` | Spring Boot 3 + Spring Data JPA/Hibernate + Flyway (Java/Kotlin) |
| `rust` | `api-engineer` | Axum + Tokio + sqlx/SeaORM (Actix/Rocket variants) |
| `laravel` | `api-engineer`, `fullstack-engineer`, `migration-specialist` | Laravel 10+ + Sanctum/Passport + PostgreSQL/MySQL |
| `nextjs-admin` | `admin-engineer` | Next.js 15 + shadcn/ui (admin dashboard) |
| `expo` | `mobile-engineer` | Expo SDK (React Native) |
| `flutter` | `mobile-engineer` | Flutter 3 + Dart 3 + Riverpod/Bloc + go_router |
| `astro` | `frontend-engineer` | Astro: SSG, SSR, islands, MDX |
| `sveltekit` | `frontend-engineer` | SvelteKit 2 + Svelte 5 runes + TypeScript + Tailwind |
| `vuenuxt` | `frontend-engineer` | Nuxt 3 + Vue 3 Composition API + Pinia + TypeScript |
| `rails` | `fullstack-engineer` | Ruby on Rails: models, controllers, views, migrations |
| `playwright-crawler` | `scanner-engineer` | Crawling/scraping workers with Playwright + BullMQ |
| `wordpress` | `wp-engineer`, `divi-engineer`, `elementor-engineer` | Modern WordPress (FSE, Gutenberg, plugins), Divi, Elementor |

> Each Tier 2 agent works **only within the directory defined in `project.yaml`** (for example `app/`, `src/`, `internal/`, the API/admin/mobile/scanner directory). It does not step outside its scope.

---

## Tier 3 — Domain (project)

**Definition.** Agents that know the **product's business** concepts. They are not reusable outside the same type of product.

**Criterion.** If the name refers to a business concept (not a technical role), it's Tier 3.

**Where they live.** Only in the project:
- The files in `project/.claude/agents/`
- They are registered in `agents.specialized` within `project.yaml`

**They do not go into forge.** These agents are never promoted to the framework; they belong to the product.

**Naming.** `<domain>-<role>` / `<domain>-specialist`

**Real examples:**

| Agent | Business concept |
|---|---|
| `dsar-specialist` | DSAR / Law 21.719 (data subject rights requests) |
| `gcm-engineer` | Google Consent Mode |
| `policy-engineer` | Privacy policies |
| `banner-engineer` | CookyCMP Banner SDK |

---

## Summary table

| Tier | Location | Reusable | Naming | Example |
|---|---|---|---|---|
| **1 — Universal (core)** | `core/agents/` | Any project, any stack | `<role>-engineer` / `<role>-reviewer` / `<role>-auditor` | `backend-engineer`, `security-auditor` |
| **2 — Profile (stack)** | `profiles/<stack>/agents/` | Any project that uses that stack | Same as the Tier 1 it extends (+ `profile: <stack>`) | `api-engineer` (hono-drizzle), `admin-engineer` (nextjs-admin) |
| **3 — Domain (project)** | `project/.claude/agents/` + `agents.specialized` in `project.yaml` | No (tied to the product's business) | `<domain>-<role>` / `<domain>-specialist` | `dsar-specialist`, `gcm-engineer` |

---

## How they are installed

The installation order is what makes the **collision rule** work (Tier 2 wins over Tier 1):

1. **Profiles first.** `forge init` installs the agents from the active profiles (`profiles/<stack>/agents/`). Each one writes its file (`api-engineer`, `frontend-engineer`, etc.) with the stack's instructions.
2. **Core afterward, without overwriting.** Then the universal agents from `core/agents/` are installed, but **without overwriting** the files a profile has already placed. This way, wherever a profile provides a specialized version, that one prevails; where there is no profile for that role, the generic core version remains.
3. **Tier 3 is contributed by the project.** forge does not install the domain agents: they live in `project/.claude/agents/` and are registered manually in `agents.specialized` of `project.yaml`.

The result is a team composed in layers: what's universal from core, specialized by the active profiles, and rounded out with the product's domain agents.
