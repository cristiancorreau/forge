# forge

[![tests](https://github.com/socialwebcl/forge/actions/workflows/tests.yml/badge.svg)](https://github.com/socialwebcl/forge/actions/workflows/tests.yml)

Framework de desarrollo con agentes de IA para equipos de software.

Agnóstico al runtime (Claude Code, OpenCode, Kiro) y al stack tecnológico.
Un único `project.yaml` genera la configuración correcta para cada herramienta.

Ver [CHANGELOG.md](CHANGELOG.md) para el historial de versiones.

---

## Extensión VS Code

forge tiene una extensión oficial para VS Code que provee un panel lateral con todas las acciones disponibles sin necesidad de abrir la terminal.

### Instalación

```bash
# Desde la raíz del repo forge
cd vscode-extension
npx vsce package --no-dependencies
code --install-extension forge-agent-framework-0.2.1.vsix
```

Después de instalar, aparece el ícono **forge** (robot) en la barra de actividad izquierda.

### Panel lateral — 3 vistas

| Vista | Qué muestra |
|-------|-------------|
| **Actions** | Botones de acceso rápido: Wizard, Init, Audit, Buscar catálogo, Estado |
| **Project** | Información del `project.yaml` activo (nombre, stack, profiles) |
| **Agents** | Lista de agentes instalados en `.claude/agents/` con botón de audit inline |

### Comandos disponibles

Todos accesibles desde `Ctrl+Shift+P` / `Cmd+Shift+P`:

| Comando | Descripción |
|---------|-------------|
| `forge: Setup Wizard` | Inicia el wizard interactivo de configuración |
| `forge: Initialize Agents` | Instala o actualiza agentes en el proyecto |
| `forge: Run Audit` | Audita coherencia de agentes con opción de agregar oportunidades |
| `forge: Audit Specific Agent` | Audita un agente puntual |
| `forge: Search Catalog (MCP / Profiles)` | Busca en el catálogo de templates y MCP servers |
| `forge: Show Project Status` | Muestra resumen del estado en el output channel |
| `forge: Install` | Agrega forge como submodule en proyectos nuevos |

### Flujo de audit en VS Code

Al correr **Run Audit**, la extensión:
1. Ejecuta `forge-audit.py --json` en background
2. Muestra el resultado en una notificación con botones de acción
3. Si hay oportunidades (profiles/skills disponibles), ofrece un selector multi-item para agregarlos a `project.yaml` directamente desde VS Code
4. Después de aplicar, ofrece "Initialize Agents" para instalar los nuevos agentes

### Configuración

En `Settings > forge`:

| Setting | Por defecto | Descripción |
|---------|-------------|-------------|
| `forge.forgePath` | `.agentic` | Ruta a la instalación de forge relativa al workspace |
| `forge.tool` | `claude-code` | Runtime target (`claude-code`, `opencode`, `kiro`, `codex`, `all`) |
| `forge.autoAuditOnSave` | `false` | Auditar automáticamente al guardar un archivo de agente |

---

## Requisitos

- **Sistema operativo:** macOS o Linux (el CLI interactivo usa `termios`/`tty`). En Windows, usar WSL.
- **Python:** 3.9+
- **Dependencia:** `pyyaml` (`pip3 install -r .agentic/requirements.txt`)

---

## Inicio rápido

### Proyecto nuevo

```bash
# 1. Agregar forge al proyecto como submodule (fijar a tag estable recomendado)
git submodule add https://github.com/socialwebcl/forge .agentic
git -C .agentic checkout v0.2.2   # fijar a versión estable, no seguir main

# 2. Instalar dependencias (solo pyyaml)
pip3 install -r .agentic/requirements.txt

# 3. Abrir el CLI interactivo
python3 .agentic/forge.py
```

El CLI guía el resto: genera `project.yaml`, instala agentes y configura el runtime elegido.

### Unirse a un proyecto que ya usa forge

Cuando alguien clona un repositorio que tiene forge como submodule, el directorio `.agentic/` aparece vacío por defecto. Ejecutar:

```bash
git clone <url-del-repositorio>
cd <repositorio>
git submodule update --init --recursive
pip3 install -r .agentic/requirements.txt
python3 .agentic/forge.py
```

Alternativa: clonar con submodules en un solo paso:

```bash
git clone --recurse-submodules <url-del-repositorio>
```

> **Síntoma de submodule no inicializado:** si `.agentic/` está vacío o Python lanza `No such file or directory: '.agentic/forge.py'`, ejecutar `git submodule update --init --recursive` desde la raíz del repositorio.

---

## CLI interactivo

```
python3 .agentic/forge.py
```

```
  ┌──────────────────────────────────────────────┐
  │ forge v0.2.2  —  Agentic Development Framework │
  └──────────────────────────────────────────────┘

  ¿Qué quieres hacer?

  ▶ Nuevo proyecto         wizard interactivo
    Inicializar agentes    forge-init
    Auditar proyecto       forge-audit
    Buscar templates       catálogo curado
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
| `laravel` | `api-engineer` + `fullstack-engineer` + `migration-specialist` (upgrade L6→L13) |
| `wordpress` | `wp-engineer` (FSE + Gutenberg) + `divi-engineer` + `elementor-engineer` |

Para stacks no cubiertos, el CLI ofrece scaffoldear un profile Tier 2 nuevo.

---

## Runtimes soportados

| Runtime | Genera | Comando |
|---------|--------|---------|
| Claude Code | `.claude/agents/` + `CLAUDE.md` | `--tool claude-code` |
| OpenCode | `AGENTS.md` | `--tool opencode` |
| Kiro | `.kiro/steering/` | `--tool kiro` |
| Codex CLI | `AGENTS.md` (enriquecido) | `--tool codex` |
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
| `scripts/forge-add-opportunities.py` | Aplica profiles/skills seleccionados a `project.yaml` |
| `scripts/aitmpl-search.py` | Busca en catálogo curado de templates, MCP servers y profiles |
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
