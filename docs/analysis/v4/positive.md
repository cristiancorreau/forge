# Benchmark comparativo: forge vs el ecosistema de desarrollo con agentes IA

> Análisis independiente — Mayo 2026

---

## Resumen ejecutivo

El ecosistema de herramientas para desarrollo asistido por IA ha madurado rápidamente en los últimos 18 meses. Hoy existen dos grandes categorías: herramientas de _pair programming_ general (aider, Cursor, cline/Roo Code) y plataformas de agentes autónomos (OpenHands). Ninguna de las dos categorías resuelve bien el problema de _gobierno de agentes para equipos_: quién hace qué, en qué scope, con qué modelo, bajo qué reglas de compliance, y reproduciblemente entre proyectos.

forge ([github.com/socialwebcl/forge](https://github.com/socialwebcl/forge)) ocupa ese nicho. No es un pair programmer; es un framework de gobernanza que define, versiona y despliega equipos de agentes especializados en cualquier runtime (Claude Code, OpenCode, Kiro). El análisis siguiente muestra que, para equipos que usan Claude Code de forma activa y necesitan coherencia entre proyectos, forge no tiene competidor directo.

---

## Propuesta de valor de forge — evidencia en código

### 1. Arquitectura de tres tiers con fuente de verdad única

El diseño central de forge es un sistema de tres tiers documentado en [`docs/agent-standard.md`](../../agent-standard.md) y ejecutado por [`scripts/forge-init.py`](../../../scripts/forge-init.py):

```
Tier 1 — Universal        core/agents/           (7 agentes)
Tier 2 — Profile          profiles/<stack>/      (13 stacks)
Tier 3 — Dominio          proyecto/.claude/      (fuera de forge)
```

La regla de colisión es precisa: cuando un profile activo provee `api-engineer`, ese archivo tiene prioridad sobre el Tier 1 genérico. `forge-init.py` instala primero profiles, luego core, sin sobreescribir. Esto garantiza que specialización por stack no rompe el roster base.

El archivo `project.yaml` es la única fuente de verdad:

```yaml
agents:
  active: [orchestrator, backend-engineer, test-engineer]
  profiles: [hono-drizzle, nextjs-admin]

compliance:
  frameworks: [gdpr, ley-21719]
  pii_handling: true
```

Un único archivo configura agentes, stack, compliance y sprint para los tres runtimes. Ninguna herramienta comparada tiene este nivel de declaratividad.

### 2. Especialización por stack sin sacrificar universalidad

El agente [`profiles/nextjs-admin/agents/admin-engineer.md`](../../../profiles/nextjs-admin/agents/admin-engineer.md) ilustra la profundidad de specialización: especifica Next.js 15 con App Router, shadcn/ui + Tailwind 4 (con prohibición explícita de Tailwind 3), TanStack Query (con prohibición de SWR), cuatro estados de UI obligatorios, WCAG 2.1 AA, dark mode y gestión de PII. Esta especificidad no es accidental — está diseñada para que el agente no tome decisiones de stack por su cuenta.

Los 13 profiles cubren los principales ecosistemas modernos: `hono-drizzle`, `nextjs-admin`, `astro`, `expo`, `playwright-crawler`, `fastapi`, `express`, `rails`, `nestjs`, `go-gin`, `django`, `vuenuxt` y `sveltekit`.

### 3. Multi-runtime real, no cosmético

Los adaptadores en [`adapters/claude-code/`](../../../adapters/claude-code/), [`adapters/opencode/`](../../../adapters/opencode/) y [`adapters/kiro/`](../../../adapters/kiro/) generan configuraciones nativas para cada runtime desde el mismo `project.yaml`. Para Kiro, genera steering files con secciones de compliance propagadas automáticamente. Para Claude Code, genera `.claude/agents/` + `CLAUDE.md`. Para OpenCode, genera `AGENTS.md`.

### 4. Auditoría como ciudadano de primera clase

[`scripts/forge-audit.py`](../../../scripts/forge-audit.py) detecta: frontmatter incompleto, secciones faltantes, modelo incorrecto por tier, similitud contra la versión de forge (con umbrales calibrados: `SIMILARITY_WARN=0.80`, `SIMILARITY_OUTDATED=0.50`), agentes huérfanos y oportunidades de profiles no usados. El flag `--json` devuelve exit code 1 si hay errores críticos — integrable en CI directamente.

### 5. Suite de tests con 358 casos en 2.86s

Los 2328 líneas de tests en [`tests/`](../../../tests/) cubren: auditoría (`test_forge_audit.py`, 346 líneas), wizard (`test_forge_wizard.py`, 307 líneas), integración completa de init (`test_forge_init_integration.py`, 246 líneas), adapters (`test_adapters.py`), teardown (`test_forge_teardown.py`), profiles (`test_profiles.py`) y CLI principal (`test_forge.py`). Esto es inusual en frameworks de este tipo — la mayoría no tiene tests del framework mismo.

### 6. TUI con calidad de producto

El CLI interactivo en [`forge.py`](../../../forge.py) implementa: pills de categoría con colores (`FW`, `MCP`, `PRF`, `TL`, `DOC`), bordes redondeados con box-drawing characters, cursor `❯` con fondo de selección, panel de descripción contextual al item activo, y `--batch` para CI. Todo en Python puro, sin dependencias de TUI.

### 7. Catálogo MCP con instalación guiada

20 MCP servers con instalación directa desde el CLI: filesystem, git, github, postgres, sqlite, fetch, brave-search, slack, puppeteer, sequential-thinking, memory, supabase, Cloudflare y más. La instalación edita `.claude/settings.json` con los parámetros que el usuario especifica en la TUI.

---

## Benchmark con proyectos similares

### Herramientas evaluadas

**aider** ([github.com/Aider-AI/aider](https://github.com/Aider-AI/aider)) — 44.3k estrellas, pair programming CLI. Soporta 100+ lenguajes, commits automáticos, repomap para contexto de codebase, integración con todos los LLM principales. No tiene sistema de profiles, ni agentes especializados, ni MCP, ni auditoría. Es una herramienta de _edición asistida_, no de _gobernanza de agentes_.

**Cursor rules** (`.cursor/rules`) — El sistema de reglas del editor Cursor. Archivos de contexto por directorio que se inyectan en el prompt. Simple y efectivo para un desarrollador individual. No tiene profiles de stack predefinidos, no es multi-runtime, no tiene wizard de configuración, no tiene auditoría, no genera configuraciones para otros runtimes.

**cline / Roo Code** ([github.com/cline/cline](https://github.com/cline/cline), [github.com/RooVetGit/Roo-Code](https://github.com/RooVetGit/Roo-Code)) — extensiones de VS Code con agente autónomo. Cline tiene 61.3k estrellas, Roo Code 23.8k. Soportan múltiples LLM providers, MCP, checkpoints, aprobación humana en cada acción. Roo Code agrega modos (Code, Architect, Ask, Debug, Custom). No tienen sistema de profiles de stack, no son multi-runtime (dependen de VS Code), no tienen auditoría de agentes, no tienen fuente de verdad declarativa.

**OpenHands** ([github.com/All-Hands-AI/OpenHands](https://github.com/All-Hands-AI/OpenHands)) — 72.6k estrellas, plataforma de agentes autónomos. SDK Python, CLI, GUI local y nube. Soporta Claude, GPT y otros. Trusted by engineers at TikTok, Netflix, Amazon. No tiene profiles de stack predefinidos, no es multi-runtime en el sentido de forge, el directorio `enterprise/` requiere licencia comercial. Orientado a tareas autónomas, no a gobernanza de equipos de agentes.

**DIY manual** — El enfoque de crear `.claude/agents/` a mano, sin framework. Máxima flexibilidad, cero convenciones. El problema: no hay estándar de frontmatter, no hay sistema de tiers, no hay auditoría, no hay profiles reutilizables entre proyectos, cada equipo reinventa la rueda. La entropía aumenta con el tiempo.

---

## Matriz de benchmark

| Criterio | forge | aider | Cursor rules | cline/Roo | OpenHands | DIY manual |
|---|---|---|---|---|---|---|
| Setup en < 10 min | 5 | 5 | 4 | 4 | 3 | 1 |
| Especialización por stack | 5 | 1 | 2 | 2 | 1 | 3 |
| Multi-runtime (Claude/OpenCode/Kiro) | 5 | 1 | 1 | 1 | 2 | 2 |
| CLI interactivo | 5 | 4 | 1 | 3 | 4 | 1 |
| Auditoría de agentes | 5 | 1 | 1 | 1 | 1 | 1 |
| Catálogo MCP integrado | 5 | 1 | 1 | 3 | 2 | 1 |
| Tests del framework | 5 | 3 | 1 | 3 | 4 | 1 |
| Sin vendor lock-in | 5 | 5 | 1 | 4 | 4 | 5 |
| Comunidad activa | 2 | 5 | 4 | 5 | 5 | — |
| Gobernanza y compliance | 5 | 1 | 1 | 1 | 2 | 2 |

_Escala 1–5. "Comunidad activa" refleja tamaño de comunidad pública (estrellas, contribuidores, frecuencia de releases). forge es un framework joven con comunidad pequeña pero activa._

---

## Casos donde forge supera a las alternativas

### Equipo usando Claude Code con múltiples proyectos

Si un equipo tiene cinco proyectos distintos (un backend FastAPI, un admin Next.js, una app móvil Expo, un crawler con Playwright y un SaaS Rails), forge permite definir el roster de agentes una vez por proyecto en `project.yaml` y reutilizar los profiles correspondientes sin duplicar instrucciones. Cada proyecto obtiene agentes especializados en su stack, con reglas de compliance propagadas desde la configuración central.

Ninguna de las alternativas resuelve esto: aider es stateless por ejecución, Cursor rules son por directorio y no se propagan, cline/Roo Code son por sesión de VS Code, OpenHands no tiene profiles.

### Equipos con requisitos de compliance (GDPR, Ley 21.719)

El campo `compliance.frameworks` en `project.yaml` activa el `compliance-reviewer` (con modelo `opus` obligatorio, según `forge-audit.py`) y propaga las reglas al steering de Kiro. La auditoría detecta si el `compliance-reviewer` no usa `opus`. No hay equivalente en ninguna herramienta comparada.

### Incorporación de un runtime alternativo

Un equipo que usa Claude Code hoy y quiere experimentar con OpenCode o Kiro puede ejecutar `python3 .agentic/scripts/forge-init.py --tool all` y obtener las tres configuraciones desde el mismo `project.yaml`. La migración es reversible con `forge-teardown.py`. Las alternativas requieren reconfiguración manual completa.

### CI/CD con verificación de calidad de agentes

```bash
python3 .agentic/scripts/forge-audit.py --json | jq '.summary'
# exit code 1 si hay errores críticos
```

Esto permite bloquear merges si los agentes del proyecto están desactualizados respecto a forge, tienen frontmatter incompleto o usan el modelo equivocado. Ninguna herramienta comparada ofrece esto.

### Onboarding de un desarrollador nuevo

El wizard interactivo (`forge-wizard.py`) con modos `startup`, `standard` y `enterprise` genera un `project.yaml` correcto sin que el desarrollador conozca el framework. El CLI muestra el panel de descripción al moverse con las flechas — contexto sin tener que leer documentación.

---

## Casos donde una alternativa es mejor

**Para pair programming interactivo puro:** aider es la opción correcta. Si la tarea es editar un archivo específico con un LLM, hacer commits automáticos o trabajar con un codebase sin estructura de agentes, aider es más directo y tiene una comunidad 50 veces mayor. El repomap es una ventaja real para codebases grandes donde forge no ayuda.

**Para un desarrollador individual sin necesidad de coordinación:** Cursor rules o el DIY manual son más simples. Si hay un único desarrollador con un único proyecto sin requisitos de compliance, el overhead de `project.yaml` no se justifica. Las Cursor rules en `.cursor/rules/` dan contexto suficiente sin ningún framework.

**Para agentes autónomos a gran escala:** OpenHands es la opción. Si la tarea es ejecutar miles de tareas autónomas en nube, con GUI y SDK, OpenHands tiene una infraestructura que forge no pretende tener. forge no es una plataforma de ejecución de agentes; es un framework de gobernanza que corre sobre los runtimes existentes.

**Para integración nativa con VS Code:** cline o Roo Code dan una experiencia más integrada con el editor, con aprobación visual de cada cambio y checkpoints. Si el flujo de trabajo está centrado en VS Code y se necesita supervisión granular, estas herramientas son más ergonómicas.

---

## Conclusión: por qué SÍ se recomienda forge

forge resuelve un problema que las herramientas más populares no atacan: **cómo gobernar un equipo de agentes especializados de forma reproducible, auditable y agnóstica al runtime**.

Las razones concretas para recomendarlo:

1. **Inversión mínima, retorno alto.** Tres comandos para el setup inicial. El wizard genera la configuración. Los agentes se instalan con un comando. La curva de adopción es la más baja del benchmark para equipos con más de dos personas.

2. **Los profiles son la diferencia real.** Un `admin-engineer` que sabe que debe usar TanStack Query y no SWR, que tiene prohibido trabajar fuera de `packages/admin/`, que exige cuatro estados de UI y WCAG 2.1 AA — eso no se consigue con ninguna de las alternativas sin escribirlo a mano cada vez. Los 13 profiles son instrucciones que alguien pagó el costo de escribir y testear, y que se reutilizan sin fricción.

3. **La auditoría es el diferenciador para equipos serios.** Saber que un agente se desvió más del 20% de la versión de forge, o que el `compliance-reviewer` está usando `sonnet` en lugar de `opus`, o que hay agentes huérfanos en `.claude/agents/` que no están en `project.yaml` — esto es información de gobierno que ninguna otra herramienta entrega.

4. **358 tests pasando es una señal de madurez.** Para un framework joven, tener esta cobertura — incluyendo tests de integración completa del wizard, del audit, de los adapters y de todos los profiles — indica que los cambios futuros no van a romper proyectos existentes.

5. **El vendor lock-in es cero.** forge no requiere ninguna cuenta, no envía telemetría, no tiene nube propia. Es un submodule de git. `forge-teardown.py` revierte la instalación limpiamente. Si en doce meses aparece un runtime mejor que Claude Code, el `project.yaml` del proyecto no cambia.

La comunidad de forge es pequeña comparada con aider o cline — esa es su debilidad más honesta. Pero para un equipo que ya usa Claude Code y quiere estructura, reproducibilidad y compliance, forge es la elección más racional del ecosistema actual.

---

_Análisis basado en el código fuente de forge en `/forge/` y en la documentación pública de las herramientas comparadas. URLs de referencia: [aider](https://github.com/Aider-AI/aider) · [cline](https://github.com/cline/cline) · [Roo Code](https://github.com/RooVetGit/Roo-Code) · [OpenHands](https://github.com/All-Hands-AI/OpenHands)._
