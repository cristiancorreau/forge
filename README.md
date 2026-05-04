# forge

Framework de desarrollo con agentes de IA para equipos de software.

Agnóstico al runtime (Claude Code, OpenCode, Kiro) y al stack tecnológico.
Un único `project.yaml` genera la configuración correcta para cada herramienta.

---

## Inicio rápido

```bash
# 1. Agregar forge al proyecto como submodule
git submodule add https://github.com/socialweb-cl/forge .agentic

# 2. Instalar dependencias (solo pyyaml)
pip3 install -r .agentic/requirements.txt

# 3. Abrir el CLI interactivo
python3 .agentic/forge.py
```

El CLI guía el resto: genera `project.yaml`, instala agentes y configura el runtime elegido.

---

## CLI interactivo

```
python3 .agentic/forge.py
```

```
  ┌──────────────────────────────────────────────┐
  │ forge v2.0  —  Agentic Development Framework │
  └──────────────────────────────────────────────┘

  ¿Qué quieres hacer?

  ▶ Nuevo proyecto         wizard interactivo
    Inicializar agentes    forge-init
    Auditar proyecto       forge-audit
    Buscar templates       aitmpl.com
    Nuevo profile Tier 2   scaffold
    Teardown               revertir instalación
    ──────────────────────────────────────
    Salir

  ↑↓ navegar   Enter seleccionar   q salir
```

Navegar con `↑↓`, seleccionar con `Enter`, salir con `q`.

---

## Wizard de nuevo proyecto

El wizard detecta el modo según el tamaño del equipo:

| Personas | Modo | Características |
|----------|------|-----------------|
| 1-2 | **startup** | Un agente, sin fases, SDD opcional |
| 3-8 | **standard** | Roster completo, fases A/B, skills |
| 9+ | **enterprise** | Compliance, audit logs, 4 fases, CI |

Genera `project.yaml` adaptado y opcionalmente ejecuta `forge-init` al final.

---

## Sistema de agentes — 3 tiers

```
Tier 1 — Universal     .agentic/core/agents/
Tier 2 — Profile       .agentic/profiles/<stack>/agents/
Tier 3 — Dominio       proyecto/.claude/agents/   (no está en forge)
```

### Tier 1 — Agentes universales

| Agente | Rol |
|--------|-----|
| `orchestrator` | Coordina agentes, descompone tareas |
| `backend-engineer` | API, base de datos, lógica de negocio |
| `frontend-engineer` | UI, componentes, integración con API |
| `test-engineer` | Testing unitario, integración, E2E |
| `docs-writer` | Documentación, specs, ADRs |
| `compliance-reviewer` | Revisión contra marcos regulatorios |
| `security-auditor` | Auditoría de vulnerabilidades |

### Tier 2 — Profiles de stack

| Profile | Agente que provee |
|---------|-------------------|
| `hono-drizzle` | `api-engineer` — Hono + Drizzle + TypeScript |
| `nextjs-admin` | `admin-engineer` — Next.js 15 + shadcn/ui |
| `astro` | `frontend-engineer` — Astro + Tailwind + TypeScript |
| `expo` | `mobile-engineer` — React Native / Expo |
| `playwright-crawler` | `scanner-engineer` — Scraping y crawling |
| `fastapi` | `api-engineer` — FastAPI + Python |
| `express` | `api-engineer` — Express + Node.js |
| `rails` | `fullstack-engineer` — Ruby on Rails |
| `nestjs` | `api-engineer` — NestJS + TypeScript |
| `django` | `api-engineer` — Django 4.x + Django REST Framework |
| `vuenuxt` | `frontend-engineer` — Nuxt 3 + Vue 3 + Pinia |
| `go-gin` | `api-engineer` — Go + Gin + sqlc |
| `sveltekit` | `frontend-engineer` — SvelteKit 2 + Svelte 5 runes |

Para stacks no cubiertos, el CLI ofrece scaffoldear un profile Tier 2 nuevo.

---

## Runtimes soportados

| Runtime | Genera | Comando |
|---------|--------|---------|
| Claude Code | `.claude/agents/` + `CLAUDE.md` | `--tool claude-code` |
| OpenCode | `AGENTS.md` | `--tool opencode` |
| Kiro | `.kiro/steering/` | `--tool kiro` |
| Codex CLI | `AGENTS.md` + `codex.md` | `--tool codex` |
| Todos | Los cuatro anteriores | `--tool all` |

---

## project.yaml — fuente de verdad

```yaml
project:
  name: "Mi Proyecto"
  mode: "standard"       # startup | standard | enterprise

stack:
  backend: "hono"
  frontend: "nextjs"

agents:
  active: [orchestrator, test-engineer, docs-writer]
  compliance: [compliance-reviewer]
  profiles: [hono-drizzle, nextjs-admin]

compliance:
  frameworks: [gdpr, ley-21719]
  pii_handling: true
  audit_logs: true
```

Un solo archivo configura agentes, stack, compliance y sprint para todos los runtimes.

---

## Scripts disponibles

| Script | Uso |
|--------|-----|
| `forge.py` | CLI interactivo principal |
| `scripts/forge-init.py` | Instala agentes en el proyecto |
| `scripts/forge-audit.py` | Audita coherencia de agentes |
| `scripts/forge-wizard.py` | Wizard de configuración (standalone) |
| `scripts/forge-scaffold-profile.py` | Crea un profile Tier 2 nuevo |
| `scripts/forge-teardown.py` | Revierte la instalación |
| `scripts/aitmpl-search.py` | Busca templates en aitmpl.com |
| `scripts/token-stats.py` | Estadísticas de tokens por agente |

---

## Skills disponibles

Skills universales que se activan en `project.yaml` bajo `skills.active`:

`new-feature` · `security-audit` · `db-migrate` · `local2prod` · `spec`
`wiki-ingest` · `wiki-query` · `wiki-lint` · `phase-kickoff` · `browser-test`
`aitmpl-search` · `obsidian-sync`

---

## Auditoría en CI

```bash
# Salida JSON — retorna exit code 1 si hay errores críticos
python3 .agentic/scripts/forge-audit.py --json | jq '.summary'
```

---

## Filosofía

- **Spec-Driven Development (SDD):** spec antes que código, siempre.
- **Agentes especializados:** cada agente tiene un scope claro y no sale de él.
- **Compliance by design:** las reglas no-negociables van en el core, no en cada proyecto.
- **Agnóstico al runtime:** el mismo `project.yaml` genera configs para cualquier herramienta.
- **Reversible:** `forge-teardown.py` permite salir sin perder el trabajo del proyecto.
