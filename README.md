# forge

[![tests](https://github.com/cristiancorreau/forge/actions/workflows/tests.yml/badge.svg)](https://github.com/cristiancorreau/forge/actions/workflows/tests.yml)
[![npm](https://img.shields.io/npm/v/@cristiancorreau/forge)](https://www.npmjs.com/package/@cristiancorreau/forge)
[![license](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)

**Configura cualquier proyecto para trabajar con agentes IA en un comando.**

Wizard interactivo que detecta tu stack, instala agentes especializados, genera guardrails y mantiene un manifest con SHA-256 para auditar cada cambio.

---

## Quick start

```bash
npx @cristiancorreau/forge init
```

Sin instalación global. Sin Python. Solo Node.js.

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
| Agentes Tier 2 (stack) | Mismo rol que Tier 1 con instrucciones del stack: Hono+Drizzle, FastAPI, Express, NestJS, Django, Go-Gin, Laravel, Rails, Next.js, Expo, Astro, SvelteKit, Nuxt/Vue, WordPress, Playwright. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Agentes Tier 3 (dominio) | Agentes que conocen el negocio (`dsar-specialist`, `gcm-engineer`, …). El wizard los pregunta y los registra en `agents.specialized`; en Claude Code genera un stub `.md` por agente y `forge audit` valida que existan, en OpenCode/Codex/Kiro se listan en `AGENTS.md`/steering. El conocimiento de negocio lo completa el equipo. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Hooks de guardrail (sin Python) | Branch-guard, detección de debug, secretos y prod-safety. En Claude Code (hooks JS en `settings.json`) y Kiro (branch-guard) como interceptación ejecutable; en OpenCode/Codex embebidos en `AGENTS.md` (su mecanismo nativo), y Codex además con hooks de sesión `onStart`/`onFinish` en `.codex/`. | ✅ | Claude Code, Kiro, OpenCode, Codex |
| Operaciones reversibles | Manifest SHA-256 + `--dry-run` en `init`/`generate`/`teardown` para instalaciones verificables; `forge audit` detecta derivaciones contra el manifest. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Multi-runtime | Un mismo proyecto forge se adapta a varios runtimes con sus marcadores de detección y niveles de soporte. | ✅ | Claude Code (completo), OpenCode, Codex, Kiro |
| Auto-detección de stack | Detección de runtimes por marcadores (`.claude/`, `.opencode/`, `.codex/`, `.kiro/`, `AGENTS.md`) y de stack desde `package.json`/lockfiles; el wizard pre-selecciona los profiles Tier 2 a partir del stack detectado. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Skills | Biblioteca de skills invocables (`spec`, `new-feature`, `security-audit`, `db-migrate`, `local2prod`, `browser-test`, `wiki-*`, etc.). | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Compliance (GDPR/LGPD/CCPA) | `compliance-reviewer` (Tier 1, model opus) revisa cada PR contra los marcos de compliance activos con poder de veto vinculante antes de mergear. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| forge wiki (knowledge base) | CLI `forge wiki status/ingest/query/lint` operativa para gestionar la base de conocimiento; la búsqueda semántica y la síntesis de páginas las realizan los skills `/wiki-*` en el agente. | 🚧 | Claude Code, OpenCode, Codex, Kiro |
| Browser testing | Automatización de navegador (agent-browser sobre CDP) para verificar UI, flujos críticos, evidencia y diffs visuales/responsive (`/browser-test`). | ✅ | Claude Code, OpenCode, Codex, Kiro |
| DB migrations | Flujo seguro de migraciones compatible con Prisma, Drizzle, ActiveRecord, Alembic y Goose (`/db-migrate`). | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Deploy a producción | Publicación con gate `READY/SUCCESS` sobre Vercel, Railway, Fly.io, GitHub Actions y pipelines custom (`/local2prod`). | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Migración v1→v2 | Portado de `project.yaml` v1 a v2 con `forge migrate` (`--dry-run`, `--backup`): añade las secciones v2 preservando el contenido existente. | ✅ | Claude Code, OpenCode, Codex, Kiro |
| Scaffold / Teardown | Generación de profiles Tier 2 (`forge scaffold`) y desmontaje limpio (`forge teardown`, manifest-driven con `--dry-run`). | ✅ | Claude Code, OpenCode, Codex, Kiro |

Leyenda: ✅ disponible · 🚧 parcial · ❌ pendiente.

---

## Comandos

| Comando | Qué hace |
|---------|----------|
| `forge init` | Wizard completo: detecta stack, instala agentes, hooks y genera configuración |
| `forge audit` | Verifica el estado del proyecto contra el manifest; detecta archivos modificados o faltantes |
| `forge generate` | Regenera configuración desde el estado actual del proyecto sin ejecutar el wizard completo |
| `forge validate` | Valida que los archivos generados cumplan el esquema esperado |
| `forge doctor` | Health-check del entorno: Node.js, git, runtime de IA activo, permisos |
| `forge migrate` | Migra `project.yaml` de v1 a v2 (`--dry-run`, `--backup`) preservando el contenido existente |
| `forge scaffold` | Genera un profile Tier 2 para un stack nuevo (`--name`, `--engineer`) |
| `forge teardown` | Desmonta forge del proyecto (manifest-driven, `--dry-run`, `--keep-config`, `--yes`) |
| `forge wiki` | Gestiona la knowledge base: `status`, `ingest`, `query`, `lint` |
| `forge skills` | Lista los skills invocables disponibles |
| `forge aitmpl-search` | Busca en el catálogo offline curado (frameworks, MCP servers, profiles) (`--json`) |

> **Dashboard post-install.** Cuando `forge init` corre con Bun, al terminar abre un dashboard interactivo navegable con OpenTUI: panel con paneles para explorar agentes instalados, skills, profiles activos y estado del manifest sin salir de la terminal. Con Node.js el wizard cae al flujo de prompts estándar.

---

## Runtimes soportados

| Runtime | Soporte |
|---------|---------|
| **Claude Code** | Completo — agentes, `CLAUDE.md`, `settings.json`, hooks |
| **OpenCode** | `AGENTS.md` generado |
| **Codex CLI** | `AGENTS.md` enriquecido + hooks de sesión `onStart`/`onFinish` en `.codex/` (JS) |
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

**Tier 2 — profile (stack).** Los mismos roles que Tier 1 pero con instrucciones específicas del stack (Hono+Drizzle, FastAPI, Django, Rails, Laravel, Go-Gin, Next.js, Expo, Astro, SvelteKit, WordPress, Playwright…). Un proyecto puede activar varios profiles a la vez; ante una colisión, gana el profile.

**Tier 3 — project (dominio).** Agentes que conocen el negocio concreto del proyecto (`dsar-specialist`, `gcm-engineer`, `policy-engineer`, `banner-engineer`). Viven dentro del repositorio y se registran en `agents.specialized`.

Detalle completo en [docs/tiers.md](docs/tiers.md).

---

## Skills

forge incluye 12 skills invocables que encapsulan flujos completos: `spec` (redacta specs SDD), `new-feature` (kickoff de feature spec-first), `security-audit`, `db-migrate`, `local2prod` (deploy con gate de producción), `browser-test`, `phase-kickoff`, `obsidian-sync`, `aitmpl-search` y la familia `wiki-*` (`wiki-ingest`, `wiki-lint`, `wiki-query`) para la knowledge base del proyecto. Se invocan como slash commands (`/spec`, `/new-feature`, `/db-migrate`, …) y se mapean por runtime.

Catálogo completo en [docs/skills.md](docs/skills.md).

---

## Sin Python requerido

Toda la CLI corre en Node.js. Los hooks de guardrail son JavaScript puro.

No hay `pip install`, no hay `requirements.txt`, no hay dependencias de sistema fuera de Node.js 20+.

---

## Comparativa

| Capacidad | forge | autoskills | cc-sdd |
|---|---|---|---|
| Enfoque principal | Framework de agentic development end-to-end (agentes + skills + profiles + wiki + compliance) | Librería/colección de skills reutilizables | Spec-Driven Development para Claude Code |
| SDD spec-first con gate | ✅ spec `APPROVED` obligatoria, veto del orchestrator | ❌ | ✅ núcleo del producto |
| Agentes especializados por tier | ✅ Tier 1/2/3 (universal, stack, dominio) | ❌ | ❌ |
| Profiles por stack | ✅ 15+ stacks (Hono, FastAPI, Django, Rails, Laravel, Go, WordPress, Expo…) | 🚧 parcial | ❌ |
| Skills invocables | ✅ 12+ skills | ✅ foco central | 🚧 limitado |
| Multi-runtime | ✅ Claude Code, OpenCode, Codex, Kiro | 🚧 principalmente Claude Code | 🚧 Claude Code + parcial |
| Compliance con veto (GDPR/LGPD/CCPA) | ✅ `compliance-reviewer` vinculante | ❌ | ❌ |
| Hooks de guardrail (branch/secrets/prod) | ✅ ejecutables en Claude Code/Kiro, embebidos en OpenCode/Codex | ❌ | ❌ |
| Knowledge base / wiki del proyecto | ✅ ingest/lint/query con citas | ❌ | ❌ |
| Operaciones reversibles (manifest SHA-256, dry-run) | ✅ manifest + dry-run + audit | ❌ | ❌ |
| Auto-detección de stack | ✅ runtimes + stack + profiles | ❌ | ❌ |
| Deploy con gate de producción | ✅ multi-provider | ❌ | ❌ |
| Posicionamiento | Plataforma completa de orquestación de agentes, compliance-first y multi-runtime | Catálogo de skills sueltas | Especialista en disciplina de specs |

---

## Documentación

- [Guía completa](docs/guide.md)
- [Runtimes](docs/runtimes/)

---

## Licencia

Apache 2.0 — Copyright [Cristian Correa](https://github.com/cristiancorreau), 2026.
