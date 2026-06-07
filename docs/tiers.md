# Sistema de 3 TIERs de forge

forge organiza sus agentes en tres niveles (TIERs) según su **grado de reutilización**. El problema que resuelve este sistema es evitar dos extremos: agentes tan genéricos que no saben nada del stack ni del negocio, y agentes tan específicos que hay que reescribirlos en cada proyecto.

La clave del modelo es separar el **rol** (qué tipo de output produce el agente) del **contexto** (qué stack usa y qué conceptos del negocio conoce). Así, un mismo rol —por ejemplo "ingeniero de backend"— puede existir en tres versiones de creciente especialización sin duplicar conocimiento innecesariamente:

- **Tier 1 (Universal/core):** definido por su tipo de output, no por la tecnología. Vive en `core/`.
- **Tier 2 (Profile/stack):** el mismo rol, pero con instrucciones específicas de un stack. Vive en `profiles/`.
- **Tier 3 (Dominio/project):** conoce conceptos del negocio del producto. Vive solo en el proyecto.

Un proyecto compone su equipo tomando lo universal de core, especializándolo con los profiles que active, y completándolo con los agentes de dominio propios.

---

## Tier 1 — Universal (core)

**Definición.** Agentes definidos por su tipo de output, no por la tecnología. Cualquier proyecto de cualquier stack los usa **sin modificación**.

**Criterio.** Si el agente sirve igual en un proyecto Rails, Hono y FastAPI sin cambiar nada, es Tier 1.

**Ubicación.** `core/agents/`

**Naming.** `<rol>-engineer` / `<rol>-reviewer` / `<rol>-auditor`

**Ejemplos reales (`core/agents/`):**

| Agente | Rol |
|---|---|
| `orchestrator` | Agente lead que coordina al team: descompone tareas, delega y sintetiza resultados (model: opus). Una sola invocación por sesión. Rechaza spawnear agentes sin una spec APPROVED. |
| `backend-engineer` | Implementa el backend genérico (API, base de datos, lógica de negocio; model: sonnet). Se usa cuando el proyecto no activa un profile de backend específico. |
| `frontend-engineer` | Implementa el frontend genérico (UI, componentes, páginas; model: sonnet). Se usa cuando el proyecto no activa un profile de frontend específico. |
| `test-engineer` | Escribe y mantiene tests unitarios, de integración y E2E (model: sonnet). NO escribe código de producción. |
| `docs-writer` | Mantiene specs, ADRs, READMEs y documentación pública (model: sonnet). NO modifica código de producción. |
| `compliance-reviewer` | Revisa cada PR contra los marcos de compliance activos; tiene poder de veto (model: opus). Gate vinculante antes de mergear. |
| `security-auditor` | Audita el código por vulnerabilidades: autenticación, autorización, inyección y dependencias (model: opus). NO modifica código. |

---

## Tier 2 — Profile (stack)

**Definición.** El mismo rol que un agente Tier 1, pero con instrucciones específicas al stack: comandos, convenciones y anti-patterns propios de la tecnología.

**Ubicación.** `profiles/<stack>/agents/`

**Naming.** Igual al Tier 1 que extiende — **mismo nombre, distinto path**. El frontmatter incluye `profile: <stack>`.

**Regla de colisión (profile gana sobre core).** Cuando un profile provee, por ejemplo, `api-engineer`, ese archivo tiene **prioridad sobre el Tier 1 genérico**. El instalador (`forge-init.py`) instala **primero los profiles y luego core sin sobreescribir**, de modo que la versión especializada del stack siempre prevalece sobre la genérica.

Un proyecto puede activar **varios profiles** a la vez (por ejemplo, un profile de API + uno de frontend + uno de admin).

**Profiles disponibles y sus agentes:**

| Profile | Agente(s) | Stack |
|---|---|---|
| `hono-drizzle` | `api-engineer` | Hono + Drizzle + PostgreSQL (TypeScript) |
| `fastapi` | `api-engineer` | FastAPI + SQLAlchemy/SQLModel + PostgreSQL (Python) |
| `express` | `api-engineer` | Express + Prisma/TypeORM + PostgreSQL (Node.js) |
| `nestjs` | `api-engineer` | NestJS + TypeORM/Prisma + PostgreSQL (TypeScript) |
| `django` | `api-engineer` | Django 4.x/5.x + DRF/Django Ninja + PostgreSQL |
| `go-gin` | `api-engineer` | Go con Gin/Echo + sqlc + PostgreSQL + golang-migrate |
| `laravel` | `api-engineer`, `fullstack-engineer`, `migration-specialist` | Laravel 10+ + Sanctum/Passport + PostgreSQL/MySQL |
| `nextjs-admin` | `admin-engineer` | Next.js 15 + shadcn/ui (dashboard de administración) |
| `expo` | `mobile-engineer` | Expo SDK (React Native) |
| `astro` | `frontend-engineer` | Astro: SSG, SSR, islands, MDX |
| `sveltekit` | `frontend-engineer` | SvelteKit 2 + Svelte 5 runes + TypeScript + Tailwind |
| `vuenuxt` | `frontend-engineer` | Nuxt 3 + Vue 3 Composition API + Pinia + TypeScript |
| `rails` | `fullstack-engineer` | Ruby on Rails: modelos, controladores, vistas, migraciones |
| `playwright-crawler` | `scanner-engineer` | Workers de crawling/scraping con Playwright + BullMQ |
| `wordpress` | `wp-engineer`, `divi-engineer`, `elementor-engineer` | WordPress moderno (FSE, Gutenberg, plugins), Divi, Elementor |

> Cada agente Tier 2 trabaja **solo dentro del directorio definido en `project.yaml`** (por ejemplo `app/`, `src/`, `internal/`, el directorio de API/admin/móvil/scanner). No sale de su scope.

---

## Tier 3 — Dominio (project)

**Definición.** Agentes que conocen conceptos del **negocio del producto**. No son reutilizables fuera del mismo tipo de producto.

**Criterio.** Si el nombre refiere a un concepto del negocio (no a un rol técnico), es Tier 3.

**Dónde viven.** Solo en el proyecto:
- Los archivos en `proyecto/.claude/agents/`
- Se registran en `agents.specialized` dentro de `project.yaml`

**No van a forge.** Estos agentes nunca se promueven al framework; son propios del producto.

**Naming.** `<dominio>-<rol>` / `<dominio>-specialist`

**Ejemplos reales:**

| Agente | Concepto de negocio |
|---|---|
| `dsar-specialist` | DSAR / Ley 21.719 (solicitudes de derechos de los titulares de datos) |
| `gcm-engineer` | Google Consent Mode |
| `policy-engineer` | Políticas de privacidad |
| `banner-engineer` | Banner SDK de CookyCMP |

---

## Tabla resumen

| Tier | Ubicación | Reutilizable | Naming | Ejemplo |
|---|---|---|---|---|
| **1 — Universal (core)** | `core/agents/` | Cualquier proyecto, cualquier stack | `<rol>-engineer` / `<rol>-reviewer` / `<rol>-auditor` | `backend-engineer`, `security-auditor` |
| **2 — Profile (stack)** | `profiles/<stack>/agents/` | Cualquier proyecto que use ese stack | Igual al Tier 1 que extiende (+ `profile: <stack>`) | `api-engineer` (hono-drizzle), `admin-engineer` (nextjs-admin) |
| **3 — Dominio (project)** | `proyecto/.claude/agents/` + `agents.specialized` en `project.yaml` | No (atado al negocio del producto) | `<dominio>-<rol>` / `<dominio>-specialist` | `dsar-specialist`, `gcm-engineer` |

---

## Cómo se instalan

El orden de instalación es lo que hace funcionar la **regla de colisión** (Tier 2 gana sobre Tier 1):

1. **Profiles primero.** `forge init` instala los agentes de los profiles activos (`profiles/<stack>/agents/`). Cada uno escribe su archivo (`api-engineer`, `frontend-engineer`, etc.) con las instrucciones del stack.
2. **Core después, sin sobreescribir.** Luego se instalan los agentes universales de `core/agents/`, pero **sin pisar** los archivos que ya colocó un profile. Así, donde un profile provee una versión especializada, esa prevalece; donde no hay profile para ese rol, queda la versión genérica de core.
3. **Tier 3 lo aporta el proyecto.** El conocimiento de negocio lo escribe el equipo, pero el wizard de `forge init` los pregunta, los registra en `agents.specialized` y genera un **stub** por agente en `proyecto/.claude/agents/` cuando no existe (nunca pisa uno existente, ni siquiera con `--force`). Un nombre de Tier 3 que colisione con un agente core/profile se omite con aviso. `forge audit` valida que cada agente declarado exista en disco.

El resultado es un equipo compuesto por capas: lo universal de core, especializado por los profiles activos y completado con los agentes de dominio del producto.
