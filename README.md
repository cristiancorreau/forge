# forge

[![tests](https://github.com/cristiancorreau/forge/actions/workflows/tests.yml/badge.svg)](https://github.com/cristiancorreau/forge/actions/workflows/tests.yml)
[![version](https://img.shields.io/badge/version-0.5.0-blue)](CHANGELOG.md)
[![license](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)

Framework de desarrollo agéntico para equipos de software. Un `project.yaml` genera la configuración correcta de agentes, skills y reglas para cualquier runtime de IA.

> Los agentes sin harness derivan. Forge es el harness: reglas persistentes, memoria del proyecto, y delegación estructurada desde el primer commit.

---

## Por qué Forge

- **Los agentes olvidan.** Sin memoria y reglas persistentes, cada sesión empieza desde cero. Forge mantiene el contexto entre sesiones.
- **El contexto se pierde entre archivos.** Un CLAUDE.md plano no sabe qué agente ejecuta qué tarea. Forge separa responsabilidades con agentes especializados por tier.
- **Cada runtime tiene su formato.** Claude Code, OpenCode, Kiro y Codex CLI esperan archivos distintos. Forge los genera todos desde una sola fuente de verdad.
- **La calidad baja con el tiempo.** Sin auditoría, los agentes se desactualizan silenciosamente. Forge detecta gaps y ofrece correcciones.

---

## Diferencias con otras herramientas

| Herramienta | Qué hace | Alcance | Runtimes | Hooks | Equipos |
|-------------|----------|---------|----------|-------|---------|
| **Forge** | Framework completo: agentes, skills, reglas, auditoría | Proyecto + team | Claude Code, OpenCode, Kiro, Codex CLI | Sí (pre-commit) | Sí (tiers) |
| `cc-sdd` | Plantillas SDD para Claude Code | Proyecto individual | Claude Code | No | No |
| `Bridle` | Guardrails para prompts | Prompt-level | Agnóstico | No | No |
| `wshobson/agents` | Colección de agent files | Proyecto individual | Claude Code | No | No |
| CLAUDE.md manual | Instrucciones en texto plano | Sesión | Claude Code | No | No |

**Lo que Forge NO es:** no es un modelo de IA, no es un servicio en la nube, no es una plataforma de deployment, no ejecuta agentes por sí solo. Es una capa de configuración y estructura que vive en tu repositorio.

---

## Quick start (5 minutos)

**Requisitos:** Python 3.9+, git, Claude Code (u otro runtime soportado).

```bash
# 1. Agregar forge al proyecto como submodule
git submodule add https://github.com/cristiancorreau/forge .agentic
pip3 install -r .agentic/requirements.txt
```

```bash
# 2. Copiar y completar project.yaml
cp .agentic/templates/project.yaml.tpl project.yaml
```

Editar `project.yaml` con los datos del proyecto:

```yaml
project:
  name: "Mi SaaS"
  mode: "standard"     # startup | standard | enterprise

stack:
  backend: "hono"
  frontend: "nextjs"

agents:
  active: [orchestrator, test-engineer, docs-writer]
  profiles: [hono-drizzle, nextjs-admin]

skills:
  active: [new-feature, security-audit, db-migrate]
```

```bash
# 3. Inicializar agentes
python3 .agentic/scripts/forge-init.py --tool claude-code
```

```bash
# 4. Abrir Claude Code y ejecutar
/session-start
```

Después del paso 4 verás: agentes instalados en `.claude/agents/`, un `CLAUDE.md` generado con el roster del proyecto, y slash commands disponibles en Claude Code.

---

## Arquitectura — cinco capas

| Capa | Qué hace |
|------|----------|
| **Memory** | `project.yaml` como fuente de verdad; wiki de proyecto persistente entre sesiones |
| **Knowledge** | Agentes especializados (Tier 1/2/3) con scope declarado y reglas no-negociables |
| **Guardrail** | Compliance by design, hook de pre-commit, auditoría con `forge-audit.py` |
| **Delegation** | Orquestador que descompone tareas y delega a agentes especializados |
| **Distribution** | Un solo `project.yaml` genera configs para todos los runtimes soportados |

Documentación completa: [`docs/guide.md`](docs/guide.md)

---

## Runtimes soportados

| Runtime | Soporte | Cómo instalar |
|---------|---------|---------------|
| **Claude Code** | Completo (agentes, CLAUDE.md, settings, slash commands) | `--tool claude-code` |
| **OpenCode** | Serial (AGENTS.md) | `--tool opencode` |
| **Codex CLI** | Serial (AGENTS.md enriquecido) | `--tool codex` |
| **Kiro** | Serial (steering files) | `--tool kiro` |
| **Todos** | Genera los cuatro | `--tool all` |

"Soporte completo" significa integración con hooks, settings.json y slash commands. "Serial" significa generación del archivo de instrucciones sin integración profunda con el runtime.

---

## Perfiles de stack disponibles

15 perfiles listos para usar, declarados en `agents.profiles` del `project.yaml`:

`hono-drizzle` · `nextjs-admin` · `astro` · `expo` · `playwright-crawler`
`fastapi` · `express` · `rails` · `nestjs` · `django`
`vuenuxt` · `go-gin` · `sveltekit` · `laravel` · `wordpress`

Cada profile instala uno o más agentes especializados en ese stack. Ver [`profiles/`](profiles/) para el detalle de cada uno.

Para stacks no cubiertos:

```bash
python3 .agentic/scripts/forge-scaffold-profile.py --name <stack> --engineer <agente>
```

---

## Contribuir

**Fork + PR.** Para cambios grandes, abre un issue primero.

**Agregar un profile:**

```bash
python3 .agentic/scripts/forge-scaffold-profile.py --name <stack> --engineer <agente>
```

El agente debe seguir el estándar en [`docs/agent-standard.md`](docs/agent-standard.md). Agregar el nombre al `CATALOG` en `scripts/aitmpl-search.py` y a los parametrize en `tests/test_profiles.py`.

**Agregar un skill:** Crear `core/skills/<nombre>/SKILL.md` con la estructura estándar. Ver skills existentes como referencia.

**Reportar fricción:** Abre un issue con el formato: _qué intentabas hacer → qué pasó → qué esperabas_. Los friction logs son bienvenidos como issues o PRs directamente en `docs/`.

**Tests antes de cada PR:**

```bash
python3 -m pytest tests/ -q   # debe pasar al 100%
```

---

## Licencia

Apache 2.0 — [Cristian Correa](https://github.com/cristiancorreau), 2026.
