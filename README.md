# forge

[![tests](https://github.com/cristiancorreau/forge/actions/workflows/tests.yml/badge.svg)](https://github.com/cristiancorreau/forge/actions/workflows/tests.yml)
[![npm](https://img.shields.io/npm/v/@cristiancorreau/forge)](https://www.npmjs.com/package/@cristiancorreau/forge)
[![license](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)

**Configura cualquier proyecto para trabajar con agentes IA en un comando.**

Wizard interactivo que detecta tu stack, instala agentes especializados, genera guardrails y mantiene un manifest con SHA-256 para auditar cada cambio.

> ⚠️ **Deprecation Notice**: `forge.py` y los scripts Python (`scripts/*.py`) están deprecados y serán removidos en **v3.0.0**.
> Usa `npx @cristiancorreau/forge` para todos los comandos (Node/Bun, sin Python). Ver [MIGRATION.md](MIGRATION.md).

---

## Instalación

forge corre con **Node.js 20+** (sin Python) y funciona con cualquier gestor.

**Probar sin instalar** (one-off con `npx`):

```bash
npx @cristiancorreau/forge init
```

**Instalar el comando global `forge`** (para usar `forge init`, `forge doctor`, … directo):

```bash
npm install -g @cristiancorreau/forge     # npm
pnpm add -g @cristiancorreau/forge        # pnpm  (requiere `pnpm setup` una vez)
bun add -g @cristiancorreau/forge         # bun   (requiere ~/.bun/bin en el PATH)
```

Luego:

```bash
forge init
forge doctor
forge --version
```

> **El comando `forge` no se reconoce tras el install global?** El directorio de binarios
> globales no está en tu `PATH`. `npx @cristiancorreau/forge <cmd>` siempre funciona sin
> instalar; para el comando pelado:
> - **npm:** `export PATH="$(npm prefix -g)/bin:$PATH"`
> - **pnpm:** corré `pnpm setup` y reabrí la terminal
> - **bun:** agregá `export PATH="$HOME/.bun/bin:$PATH"` a tu shell rc

---

## Cómo funciona

El wizard detecta y configura el proyecto en cinco pasos:

1. **Detecta el stack** — lee `package.json`, lockfiles y `Dockerfile` para identificar framework, lenguaje y dependencias.
2. **Selecciona agentes** — muestra un selector de flechas con los agentes disponibles para tu stack (TypeScript, Python, Ruby, Go, PHP).
3. **Instala configuración** — escribe `.claude/agents/`, `CLAUDE.md`, `settings.json` y `architecture.rules` en el repositorio.
4. **Instala hooks** — genera hooks de guardrail en JavaScript puro; sin dependencias de Python ni binarios externos.
5. **Crea el manifest** — `forge/.forge/manifest.json` con SHA-256 de cada archivo gestionado para rastrear derivaciones futuras.

---

## Funcionalidades

| Funcionalidad | Descripción | Estado | Runtime |
|---|---|---|---|
| SDD (Spec-Driven Development) | Flujo spec-first: ninguna tarea de código arranca sin una spec `APPROVED`. El `orchestrator` rechaza spawnear agentes sin spec aprobada; el skill `/spec` redacta specs en `docs/specs/`. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Agentes Tier 1 (universal) | Agentes definidos por output, no por stack: `orchestrator`, `backend-engineer`, `frontend-engineer`, `test-engineer`, `docs-writer`, `compliance-reviewer`, `security-auditor`. Sirven en cualquier proyecto. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Agentes Tier 2 (stack) | Mismo rol que Tier 1 con instrucciones del stack: Hono+Drizzle, FastAPI, Flask, Express, NestJS, Django, Go-Gin, Spring Boot, Rust (Axum), Laravel, Rails, Next.js, Expo, Flutter, Astro, SvelteKit, Nuxt/Vue, WordPress, Playwright. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Agentes Tier 3 (dominio) | Agentes que conocen el negocio (`dsar-specialist`, `gcm-engineer`, `policy-engineer`, `banner-engineer`). Viven en el proyecto y se registran en `agents.specialized`. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Hooks de guardrail (sin Python) | Guardrails de pre-edit/branch-guard, detección de debug, secretos y prod-safety, ejecutados por el runtime. | 🚧 | Claude Code, OpenCode, Codex, Kiro |
| Operaciones reversibles | Manifest SHA-256 + dry-run para instalaciones reversibles y verificables. | 🚧 | Claude Code, OpenCode, Codex, Kiro |
| Multi-runtime | Un mismo proyecto forge se adapta a varios runtimes con sus marcadores de detección y niveles de soporte. | ✅ | Claude Code (completo), OpenCode, Codex, Kiro |
| Auto-detección de stack | Detección por marcadores (`CLAUDE.md`+`.claude/`, `AGENTS.md`+`.opencode/`, `.codex/`, `.kiro/`) para activar profiles y adapters. | 🚧 | Claude Code, OpenCode, Codex, Kiro |
| Skills | Biblioteca de skills invocables (`spec`, `new-feature`, `security-audit`, `db-migrate`, `local2prod`, `browser-test`, `wiki-*`, etc.). | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Compliance (GDPR/LGPD/CCPA) | `compliance-reviewer` (Tier 1, model opus) revisa cada PR contra los marcos de compliance activos con poder de veto vinculante antes de mergear. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| forge wiki (knowledge base) | Knowledge base del proyecto: ingesta fuentes, compila páginas, mantiene índice y responde queries citando páginas (`wiki-ingest` / `wiki-lint` / `wiki-query`). | 🚧 | Claude Code, OpenCode, Codex, Kiro |
| Browser testing | Automatización de navegador (agent-browser sobre CDP) para verificar UI, flujos críticos, evidencia y diffs visuales/responsive (`/browser-test`). | ✅ | Claude Code, OpenCode, Codex, Kiro |
| DB migrations | Flujo seguro de migraciones compatible con Prisma, Drizzle, ActiveRecord, Alembic y Goose (`/db-migrate`). | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Deploy a producción | Publicación con gate `READY/SUCCESS` sobre Vercel, Railway, Fly.io, GitHub Actions y pipelines custom (`/local2prod`). | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Migración v1→v2 | Migración de `project.yaml` v1 a v2 con detección automática de versión, soporte `--dry-run` y `--backup` (`forge migrate`). | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Scaffold / Teardown | `forge scaffold` genera profiles Tier 2 (`--force`, `--description`, `--stack-details`) y `forge teardown` desinstala forge limpiamente vía manifest (`--dry-run`, `--keep-config`). Ambos en la CLI TypeScript con tests. | ✅ | Claude Code, OpenCode, Codex, Kiro |

Leyenda: ✅ disponible · 🚧 parcial · ❌ pendiente.

---

## Comandos

| Comando | Qué hace |
|---------|----------|
| `forge init` | Wizard completo: detecta stack, instala agentes, hooks y genera configuración |
| `forge generate` | Regenera configuración nativa de cada runtime desde `project.yaml` sin ejecutar el wizard completo |
| `forge migrate` | Migra `project.yaml` del schema v1 al v2 (`--dry-run`, `--backup`) |
| `forge scaffold` | Genera un agente nuevo: profile Tier 2 o agente de dominio Tier 3 (`--tier 3`, `--name`) |
| `forge teardown` | Desinstala forge del proyecto de forma limpia vía manifest (`--dry-run`, `--keep-config`) |
| `forge audit` | Verifica el estado del proyecto contra el manifest; detecta archivos modificados o faltantes |
| `forge validate` | Valida que los archivos generados cumplan el esquema esperado |
| `forge doctor` | Health-check del entorno: Node.js, git, runtime de IA activo, permisos |
| `forge skills` | Lista los skills disponibles agrupados por categoría |
| `forge aitmpl-search` | Busca en el catálogo curado offline (frameworks, MCP servers, profiles) |
| `forge session-start` | Abre una sesión de trabajo: detecta estado del repo y enruta |
| `forge session-close` | Cierra una sesión de trabajo: commit → daily note → sync → PR |
| `forge wiki` | Gestiona la knowledge base del proyecto (`status` \| `ingest` \| `query` \| `lint`) |

> **Dashboard post-install.** Cuando `forge init` corre con Bun, al terminar abre un dashboard interactivo navegable con OpenTUI: panel con paneles para explorar agentes instalados, skills, profiles activos y estado del manifest sin salir de la terminal. Con Node.js el wizard cae al flujo de prompts estándar.

---

## Runtimes soportados

| Runtime | Soporte |
|---------|---------|
| **Claude Code** | Completo — agentes, `CLAUDE.md`, `settings.json`, hooks |
| **OpenCode** | `AGENTS.md` generado |
| **Codex CLI** | `AGENTS.md` enriquecido para contexto de proyecto |
| **Kiro** | Steering files |

---

## Stacks soportados

| Lenguaje | Frameworks |
|----------|------------|
| TypeScript | Hono, Next.js, NestJS, Astro |
| Python | FastAPI, Django |
| Ruby | Rails |
| Go | Gin |
| PHP | Laravel |

Cada stack instala agentes especializados con reglas de arquitectura, convenciones de código y patrones específicos del framework.

---

## Sistema de TIERs

forge organiza agentes y configuración en tres niveles que se componen de lo general a lo específico. Cada tier hereda y especializa al anterior, y la resolución de colisiones favorece siempre al tier más concreto.

**Tier 1 — core (universal).** Agentes definidos por su output, no por el stack: `orchestrator`, `backend-engineer`, `frontend-engineer`, `test-engineer`, `docs-writer`, `compliance-reviewer`, `security-auditor`. Sirven en cualquier proyecto sin modificación y son la base sobre la que se montan los demás tiers.

**Tier 2 — profile (stack).** Los mismos roles que Tier 1 pero con instrucciones específicas del stack (Hono+Drizzle, FastAPI, Flask, Django, Spring Boot, Rust/Axum, Rails, Laravel, Go-Gin, Next.js, Expo, Flutter, Astro, SvelteKit, WordPress, Playwright…). Un proyecto puede activar varios profiles a la vez; ante una colisión, gana el profile.

**Tier 3 — project (dominio).** Agentes que conocen el negocio concreto del proyecto (`dsar-specialist`, `gcm-engineer`, `policy-engineer`, `banner-engineer`). Viven dentro del repositorio y se registran en `agents.specialized`.

Detalle completo en [docs/tiers.md](docs/tiers.md).

---

## Skills

forge incluye 14 skills invocables que encapsulan flujos completos: `session-start` (abre sesión), `session-close` (cierra sesión), `spec` (redacta specs SDD), `new-feature` (kickoff de feature spec-first), `security-audit`, `db-migrate`, `local2prod` (deploy con gate de producción), `browser-test`, `phase-kickoff`, `obsidian-sync`, `aitmpl-search` y la familia `wiki-*` (`wiki-ingest`, `wiki-lint`, `wiki-query`) para la knowledge base del proyecto. Se invocan como slash commands (`/spec`, `/new-feature`, `/db-migrate`, …) y se mapean por runtime.

Catálogo completo en [docs/skills.md](docs/skills.md).

---

## Sin Python requerido

Toda la CLI corre en Node.js. Los hooks de guardrail son JavaScript puro.

No hay `pip install`, no hay `requirements.txt`, no hay dependencias de sistema fuera de Node.js 20+.

> El `forge.py` y los scripts `scripts/*.py` que aún viven en el repositorio son la implementación **legacy** y están **deprecados**: serán removidos en v3.0.0. No los necesitás para usar forge vía `npx @cristiancorreau/forge`. Ver [MIGRATION.md](MIGRATION.md).

---

## Comparativa

| Capacidad | forge | autoskills | cc-sdd |
|---|---|---|---|
| Enfoque principal | Framework de agentic development end-to-end (agentes + skills + profiles + wiki + compliance) | Librería/colección de skills reutilizables | Spec-Driven Development para Claude Code |
| SDD spec-first con gate | ✅ spec `APPROVED` obligatoria, veto del orchestrator | ❌ | ✅ núcleo del producto |
| Agentes especializados por tier | ✅ Tier 1/2/3 (universal, stack, dominio) | ❌ | ❌ |
| Profiles por stack | ✅ 15+ stacks (Hono, FastAPI, Django, Rails, Laravel, Go, WordPress, Expo…) | 🚧 parcial | ❌ |
| Skills invocables | ✅ 14+ skills | ✅ foco central | 🚧 limitado |
| Multi-runtime | ✅ Claude Code, OpenCode, Codex, Kiro | 🚧 principalmente Claude Code | 🚧 Claude Code + parcial |
| Compliance con veto (GDPR/LGPD/CCPA) | ✅ `compliance-reviewer` vinculante | ❌ | ❌ |
| Hooks de guardrail (branch/secrets/prod) | 🚧 parcial, sin Python | ❌ | ❌ |
| Knowledge base / wiki del proyecto | ✅ ingest/lint/query con citas | ❌ | ❌ |
| Operaciones reversibles (manifest SHA-256, dry-run) | 🚧 parcial | ❌ | ❌ |
| Auto-detección de stack | 🚧 parcial | ❌ | ❌ |
| Deploy con gate de producción | ✅ multi-provider | ❌ | ❌ |
| Posicionamiento | Plataforma completa de orquestación de agentes, compliance-first y multi-runtime | Catálogo de skills sueltas | Especialista en disciplina de specs |

---

## Documentación

- [Guía completa](docs/guide.md)
- [Skills](docs/skills.md)
- [Wiki / knowledge base](docs/wiki.md)
- [Runtimes](docs/runtimes/)

---

## Licencia

Apache 2.0 — Copyright [Cristian Correa](https://github.com/cristiancorreau), 2026.
