[English](README.md) · **Español**

<div align="center">

<br>

<!-- forge — logo SVG (vectorial, nítido). Ruta relativa: GitHub lo sirve como image/svg+xml. -->
<img alt="forge" height="92" src="docs/assets/forge-logo.svg">

<br>
<br>

# Forge AI

### Configura cualquier proyecto para trabajar con agentes de IA en un solo comando

Un equipo de agentes, todos los runtimes — **19 runtimes** (4 nativos + 15 editores basados en reglas) desde un único `project.yaml`.

<br>

[![npm version](https://img.shields.io/npm/v/@cristiancorreau/forge?style=for-the-badge&labelColor=0a0a0a&color=FF9F1C&logo=npm)](https://www.npmjs.com/package/@cristiancorreau/forge)
[![CI tests](https://img.shields.io/github/actions/workflow/status/cristiancorreau/forge/tests.yml?branch=main&style=for-the-badge&labelColor=0a0a0a&color=FFD26F&label=tests)](https://github.com/cristiancorreau/forge/actions/workflows/tests.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-FF9F1C?style=for-the-badge&labelColor=0a0a0a)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-FFD26F?style=for-the-badge&labelColor=0a0a0a&logo=node.js&logoColor=white)](https://nodejs.org)

<br>

**[Landing](https://cristiancorreau.github.io/forge/)**
&nbsp;&nbsp;•&nbsp;&nbsp;
**[Documentación](docs/guide.md)**
&nbsp;&nbsp;•&nbsp;&nbsp;
**[npm](https://www.npmjs.com/package/@cristiancorreau/forge)**
&nbsp;&nbsp;•&nbsp;&nbsp;
**[Issues](https://github.com/cristiancorreau/forge/issues)**

<br>

</div>

```bash
npx @cristiancorreau/forge init
```

<div align="center">

<br>

<img alt="Panel interactivo de forge en la terminal (OpenTUI): agentes, skills, hooks y profiles" width="780" src="https://raw.githubusercontent.com/cristiancorreau/forge/main/docs/assets/cli-preview.png">

<sub>El panel interactivo de forge (<code>forge panel</code>) requiere Bun (OpenTUI) — explora agentes, skills, hooks y profiles sin salir de la terminal.</sub>

<br>

</div>

---

## ¿Qué es Forge AI?

**Forge AI** (la CLI `forge`) es un framework de _agentic development_ multi-runtime. Un solo comando analiza tu proyecto, instala un equipo de agentes especializados, cablea guardrails de seguridad y deja un `project.yaml` como **única fuente de verdad** desde la que se regenera la configuración nativa de cada runtime de IA.

En vez de copiar y pegar reglas de agentes entre proyectos y entre herramientas, defines el equipo **una vez** y forge lo materializa para los 19 runtimes soportados.

- 🤖 **Equipos de agentes multi-runtime** — 7 agentes universales + 19 profiles de stack
- 📐 **Flujo SDD spec-first** — ninguna tarea de código sin una spec `APPROVED`
- 🪝 **Guardrail hooks en JS puro** — branch-guard, debug, secretos y prod-safety, cero Python
- 🔁 **Un `project.yaml`, cada CLI** — 19 runtimes: 4 nativos + 15 basados en reglas
- ⚖️ **Compliance con veto vinculante** — revisor GDPR/LGPD/CCPA que bloquea el merge
- 🔄 **Operaciones reversibles** — manifest SHA-256 + `--dry-run` para auditar cada cambio
- 📚 **Knowledge base del proyecto** — wiki que ingesta, lintea y responde con citas

---

## ¿Por qué forge?

### vs. reglas de agente hechas a mano

- **Un `project.yaml`, cuatro runtimes** — escribes el equipo una vez, no cuatro.
- **Spec-first por defecto** — el `orchestrator` rechaza spawnear agentes sin spec aprobada.
- **Guardrails ya cableados** — hooks de seguridad listos, sin instalar nada de Python.
- **Regenerable** — `forge generate` reconstruye todo el equipo desde la fuente de verdad.

### vs. copiar y pegar agentes entre proyectos

- **TIERs componibles** — universal → stack → dominio, con resolución de colisiones predecible.
- **19 profiles de stack** listos — Next.js, FastAPI, Django, Rails, Laravel, Go, Rust, Flutter…
- **Operaciones reversibles** — manifest SHA-256 detecta drift; `forge teardown` desinstala limpio.
- **Drift bajo control** — `forge update` re-sincroniza con el catálogo preservando tus ediciones.

---

## Instalación

forge corre con **Node.js 20+**. Con **Bun** se desbloquea el panel full-screen (OpenTUI, `@opentui/core`); en Node cae a prompts [@clack](https://github.com/bombshell-dev/clack); en consolas legacy, a ASCII.

**Probar sin instalar:**

```bash
npx @cristiancorreau/forge init
```

**Instalar el comando global `forge`** — elegí tu gestor:

```bash
npm  install -g @cristiancorreau/forge   # npm
pnpm add     -g @cristiancorreau/forge   # pnpm  (requiere `pnpm setup` una vez)
bun  add     -g @cristiancorreau/forge   # bun   (requiere ~/.bun/bin en el PATH)
```

> El wizard de `forge init` usa por defecto los prompts `@clack`, multiplataforma e idénticos en Windows, macOS y Linux. El wizard full-screen OpenTUI es **opt-in**: define `FORGE_ENABLE_OPENTUI=1` (requiere **Bun** y una terminal capaz). Si tienes forge instalado con bun **y** con npm a la vez, gana el que esté primero en el `PATH`; actualiza ese mismo gestor (p. ej. `bun add -g @cristiancorreau/forge@latest`).

<details>
<summary>Troubleshooting de PATH</summary>

<br>

¿El comando `forge` no se reconoce tras el install global? El directorio de binarios globales no está en tu `PATH`. `npx @cristiancorreau/forge <cmd>` siempre funciona sin instalar; para el comando a secas:

- **npm:** `export PATH="$(npm prefix -g)/bin:$PATH"`
- **pnpm:** ejecuta `pnpm setup` y reabre la terminal
- **bun:** agrega `export PATH="$HOME/.bun/bin:$PATH"` a tu shell rc

</details>

---

## Quickstart (30 s)

```bash
# 1. Inicializa forge en tu proyecto
#    (wizard: detecta stack, instala agentes + hooks, escribe el manifest)
npx @cristiancorreau/forge init

# 2. Verifica el entorno y la conformidad
forge doctor
forge validate

# 3. Regenera la configuración nativa de cada runtime desde project.yaml
forge generate
```

¿Ya tienes un codebase en marcha? Intégralo sin partir de cero:

```bash
forge adopt        # analiza el repo existente + auto-wiki
```

---

## Las 5 capas

forge se organiza en cinco capas que van de la fuente de verdad a la materialización por runtime.

| Capa | Responsabilidad |
|------|-----------------|
| 🧠 **Memory** | `project.yaml` como única fuente de verdad — stack, equipo, skills, reglas. |
| 📚 **Knowledge** | Agentes + profiles de stack que aportan el saber de cada rol y framework. |
| 🛡️ **Guardrail** | Enforcement de compliance y seguridad: hooks, branch-guard, detección de secretos. |
| 🎯 **Delegation** | Orquestación y despacho de skills: qué agente atiende qué tarea. |
| 📡 **Distribution** | Adapters de runtime que traducen la fuente de verdad a 19 runtimes de IA (4 nativos + 15 basados en reglas). |

---

## Sistema de TIERs

Tres niveles componibles, de lo general a lo específico. Cada tier hereda y especializa al anterior; ante una colisión, gana el más concreto.

| Tier | Qué es | Ejemplos |
|------|--------|----------|
| **Tier 1 — universal** | 7 agentes definidos por su _output_, no por el stack. Sirven en cualquier proyecto. | `orchestrator`, `backend-engineer`, `frontend-engineer`, `test-engineer`, `docs-writer`, `compliance-reviewer`, `security-auditor` |
| **Tier 2 — stack** | Los mismos roles con instrucciones del framework. 19 profiles disponibles. | Next.js, FastAPI, Django, Rails, Laravel, Go-Gin, Rust, NestJS… |
| **Tier 3 — dominio** | Agentes que conocen el negocio del proyecto. Viven en el repo, se registran en `agents.specialized`. | `dsar-specialist`, `gcm-engineer`, `policy-engineer`… |

Detalle completo en [docs/tiers.md](docs/tiers.md).

---

## Comandos

Los 18 comandos de la CLI.

| Comando | Qué hace |
|---------|----------|
| `forge init` | Wizard completo: detecta el stack, instala agentes y hooks, escribe el manifest. |
| `forge adopt` | Onboarda forge en un codebase **existente** (análisis + auto-wiki). |
| `forge analyze` | Lectura determinística y offline de un repo existente (stack, hotspots, TODO/FIXME, tests, agentes sugeridos). Base del skill `/onboard`; `--json` / `--write`. |
| `forge generate` | Regenera la configuración nativa de cada runtime desde `project.yaml`. |
| `forge update` | Re-sincroniza archivos gestionados con el catálogo preservando ediciones locales (drift SHA-256). |
| `forge validate` | Valida que `project.yaml` y los archivos generados cumplan el esquema. |
| `forge doctor` | Health-check del entorno: Node.js, git, runtime de IA activo, permisos. |
| `forge migrate` | Migra `project.yaml` del schema v1 al v2 (`--dry-run`, `--backup`). |
| `forge audit` | Verifica el proyecto contra el manifest; detecta archivos modificados o faltantes. |
| `forge export` | Emite el modelo resuelto del proyecto (agentes, skills, comandos, MCP servers) como JSON estable (`--json`, valida contra `export.schema.json`). |
| `forge mcp serve` | Server MCP completo por stdio: resources (specs, export, audit), prompts (agentes/comandos como templates) y tools (`forge_audit`, `forge_recommend`, `forge_generate`). Conéctalo con `claude mcp add forge -- forge mcp serve`. |
| `forge scaffold` | Genera un agente nuevo: profile Tier 2 o agente de dominio Tier 3. |
| `forge teardown` | Desinstala forge del proyecto de forma limpia vía manifest (`--dry-run`, `--keep-config`). |
| `forge skills` | Lista los skills disponibles agrupados por categoría. |
| `forge aitmpl-search` | Busca en el catálogo curado offline (frameworks, MCP servers, profiles). |
| `forge wiki` | Gestiona la knowledge base del proyecto (`status` \| `ingest` \| `query` \| `lint`). |
| `forge panel` | Panel interactivo OpenTUI (config / monitor / skills / hooks / templates). |
| `forge session-start` | Abre una sesión de trabajo: detecta el estado del repo y enruta. |
| `forge session-close` | Cierra una sesión: commit → daily note → sync → PR. |

> **Panel interactivo.** Con Bun, `forge panel` (y el dashboard post-`init`) abre un panel navegable OpenTUI para explorar agentes, skills, hooks y profiles sin salir de la terminal. Con Node cae al flujo de prompts estándar.

---

## Stacks / Profiles (19)

Profiles Tier 2 listos para activar. Cada uno aporta reglas de arquitectura, convenciones de código y patrones del framework.

<details open>
<summary>Ver los 19 profiles</summary>

<br>

| TypeScript / JS | Python | PHP | Otros |
|---|---|---|---|
| `astro` | `django` | `laravel` | `go-gin` (Go) |
| `express` | `fastapi` | `wordpress` | `rust` |
| `hono-drizzle` | `flask` | | `springboot` (Java) |
| `nestjs` | | | `rails` (Ruby) |
| `nextjs-admin` | | | `flutter` (Dart) |
| `sveltekit` | | | |
| `vuenuxt` | | | |
| `expo` | | | |
| `playwright-crawler` | | | |

</details>

---

## Runtimes

Un mismo proyecto forge se adapta a cuatro runtimes, cada uno con su salida nativa.

| Runtime | Soporte | Salida |
|---------|---------|--------|
| **Claude Code** | ✅ Completo | `CLAUDE.md`, `.claude/agents/`, `.claude/commands/`, `.claude/settings.json`, hooks |
| **OpenCode** | ✅ Soportado | `AGENTS.md` generado desde la raíz |
| **Codex CLI** | ✅ Soportado | `AGENTS.md` enriquecido para contexto de proyecto |
| **Kiro** | 🔭 Monitoring | steering files (`.kiro/steering/*.md`) |

Detalle por runtime en [docs/runtimes/](docs/runtimes/).

---

## Skills

12 skills **generales** que encapsulan flujos completos, mapeados por runtime y disparables como slash commands (`/spec`, `/new-feature`, `/db-migrate`…), más skills **por stack**.

| Skill | Para qué |
|-------|----------|
| `spec` | Redacta specs SDD en `docs/specs/`. |
| `new-feature` | Kickoff de feature spec-first, de plan a deploy. |
| `security-audit` | Checklist de auditoría de seguridad. |
| `db-migrate` | Migraciones seguras (Prisma, Drizzle, ActiveRecord, Alembic, Goose). |
| `local2prod` | Deploy con gate de producción multi-provider. |
| `browser-test` | Verificación de UI y flujos críticos vía navegador. |
| `phase-kickoff` | Arranque de una fase del roadmap. |
| `obsidian-sync` | Sincronización con Obsidian. |
| `aitmpl-search` | Busca en el catálogo curado offline. |
| `wiki-ingest` | Ingesta fuentes a la knowledge base. |
| `wiki-lint` | Lintea la consistencia de la wiki. |
| `wiki-query` | Responde queries citando páginas de la wiki. |

> Además, `session-start` y `session-close` están disponibles como comandos de la CLI.

> **Skills por stack.** El profile **Laravel** suma 5 skills orientados a Laravel 13: `/laravel-eloquent`, `/laravel-pest`, `/laravel-security`, `/laravel-verify` y `/laravel-mcp` (Boost, `laravel/mcp`, AI SDK, embeddings/pgvector).

Catálogo completo en [docs/skills.md](docs/skills.md).

---

## SDD: spec-first, no opcional

forge aplica **Spec-Driven Development** con un gate real, no una sugerencia:

- Ninguna tarea de código arranca sin una spec en estado **`APPROVED`** dentro de `docs/specs/`.
- El **`orchestrator` veta** spawnear agentes de implementación si no hay spec aprobada.
- El skill `/spec` redacta la spec; `/new-feature` la lleva de plan a deploy.

El resultado: el equipo de agentes no improvisa código sobre requisitos ambiguos — primero se acuerda el _qué_, después se genera el _cómo_.

---

## Compliance con veto vinculante

El agente **`compliance-reviewer`** (Tier 1, model `opus`) revisa cada PR contra los marcos de compliance activos — **GDPR / LGPD / CCPA** — con **poder de veto vinculante** antes de mergear.

Sumado a los **guardrail hooks en JavaScript puro** (cero Python):

- 🚫 **branch-guard** — evita commits directos sobre ramas protegidas.
- 🐛 **debug detection** — bloquea `console.log` / `print` de depuración.
- 🔐 **secret detection** — frena secretos hardcodeados antes del commit.
- 🚀 **prod-safety** — protege operaciones sensibles contra producción.

---

## Comparativa

| Capacidad | forge | autoskills | cc-sdd |
|---|:---:|:---:|:---:|
| Enfoque | Framework agentic end-to-end | Colección de skills | SDD para Claude Code |
| SDD spec-first con gate | ✅ veto del orchestrator | ❌ | ✅ núcleo |
| Agentes por tier (1/2/3) | ✅ | ❌ | ❌ |
| Profiles de stack | ✅ 19 | 🚧 parcial | ❌ |
| Skills invocables | ✅ 12 | ✅ foco central | 🚧 |
| Multi-runtime | ✅ 19 runtimes | 🚧 sobre todo Claude Code | 🚧 |
| Compliance con veto (GDPR/LGPD/CCPA) | ✅ vinculante | ❌ | ❌ |
| Guardrail hooks (branch/secrets/prod) | ✅ sin Python | ❌ | ❌ |
| Knowledge base / wiki con citas | ✅ ingest/lint/query | ❌ | ❌ |
| Operaciones reversibles (SHA-256, dry-run) | ✅ | ❌ | ❌ |
| Deploy con gate de producción | ✅ multi-provider | ❌ | ❌ |

---

## Documentación

- 🌐 **[Landing](https://cristiancorreau.github.io/forge/)** — el pitch en una página.
- 📖 **[Guía completa](docs/guide.md)**
- 🧩 **[Skills](docs/skills.md)**
- 🏗️ **[TIERs](docs/tiers.md)**
- 📚 **[Wiki / knowledge base](docs/wiki.md)**
- 📡 **[Runtimes](docs/runtimes/)**

---

<div align="center">

<br>

### Forja tu equipo de agentes en un comando

```bash
npx @cristiancorreau/forge init
```

**[Empieza en la landing →](https://cristiancorreau.github.io/forge/)**

<br>

<sub>Hecho con fuego, yunque y mucho dogfooding.</sub>

<br>

</div>

---

## Licencia

[Apache-2.0](LICENSE) — Copyright © 2026 [Cristian Correa](https://github.com/cristiancorreau).
