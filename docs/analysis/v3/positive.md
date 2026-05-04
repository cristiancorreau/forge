# Informe Técnico: Por qué se recomienda adoptar forge en proyectos reales

**Analista:** Revisión independiente del repositorio `socialwebcl/forge`
**Fecha:** 2026-05-03
**Versión del framework:** 2.0

---

## Resumen ejecutivo

forge es un framework de desarrollo con agentes IA que resuelve un problema concreto y frecuente: cómo incorporar Claude Code (y runtimes equivalentes) a un equipo de software de forma estructurada, reproducible y sin fricción. La propuesta no es académica ni especulativa — es operacional. El repositorio entrega código funcional, tests que pasan al 100% (290 en 2.51s), documentación precisa y herramientas CLI que un equipo puede usar desde el primer día.

La conclusión de este análisis es que **forge se recomienda adoptar** en proyectos que usan Claude Code, OpenCode o Kiro como asistentes de desarrollo. Las razones son técnicas: arquitectura bien pensada, bajo costo de adopción, alta reversibilidad y un conjunto de decisiones de diseño que mejoran activamente la calidad del software producido.

---

## 1. Propuesta de valor: el problema que resuelve

El problema que forge ataca es la inconsistencia en el uso de agentes IA dentro de un equipo. Sin estructura, cada desarrollador configura sus agentes de forma diferente, no hay separación de responsabilidades entre agentes, y las instrucciones del sistema se convierten en texto ad hoc difícil de mantener.

forge introduce una **fuente de verdad única** (`project.yaml`) que configura qué agentes existen, qué roles tienen, qué stack usan y qué marcos de compliance aplican. A partir de ese archivo, el framework genera la configuración correcta para el runtime que el equipo elija.

```yaml
# project.yaml — fuente de verdad
agents:
  active: [orchestrator, backend-engineer, frontend-engineer, test-engineer]
  compliance: [compliance-reviewer]
  profiles: [hono-drizzle, nextjs-admin]

compliance:
  frameworks: [gdpr, ley-21719]
  audit_logs: true
```

Este diseño tiene una consecuencia inmediata: la configuración de agentes deja de ser algo que cada desarrollador improvisa y pasa a ser algo que el equipo declara explícitamente, versiona en git y puede auditar.

---

## 2. Arquitectura de tres tiers: elegancia funcional

La decisión de diseño más importante de forge es su taxonomía de agentes en tres tiers. La clasificación está documentada en `/Users/skauch/Developer/Github/forge/docs/agent-standard.md` y se aplica consistentemente en todo el código:

```
Tier 1 — Universal    forge/core/agents/         (7 agentes)
Tier 2 — Profile      forge/profiles/<stack>/    (9 stacks, 9 agentes especializados)
Tier 3 — Dominio      proyecto/.claude/agents/   (no vive en forge)
```

**Por qué esta arquitectura es elegante:**

El criterio de clasificación no es subjetivo. El estándar de agentes define la prueba:

> "¿Podría usar este agente en un proyecto Rails, en uno de Hono y en uno de FastAPI sin cambiar nada? Si la respuesta es sí → Tier 1."

Los agentes Tier 1 (`orchestrator`, `backend-engineer`, `security-auditor`, etc.) son universales por diseño. Los Tier 2 tienen el mismo rol pero con instrucciones específicas al stack. La prueba se puede ver en el código: el `api-engineer` de `hono-drizzle` (línea 22 de `profiles/hono-drizzle/agents/api-engineer.md`) especifica Bun, Hono, Drizzle y Vitest, mientras que el de `fastapi` especifica Python 3.11+, FastAPI, SQLAlchemy 2.x async y pytest. El rol es el mismo; las instrucciones operativas son completamente diferentes.

**El mecanismo de prioridad Tier 2 > Tier 1** está implementado correctamente en `forge-init.py` (líneas 185-210): los profiles se instalan primero, y el core no sobreescribe lo que el profile ya instaló. Esto está cubierto por tests de integración explícitos:

```python
# tests/test_forge_init_integration.py, línea 127
def test_profile_reemplaza_agente_core_mismo_nombre(tmp_path):
    """El agente api-engineer del profile hono-drizzle debe instalarse en lugar del core."""
```

Los agentes Tier 3 son deliberadamente invisibles para forge: el framework no los toca, los audita pero los clasifica automáticamente como "fork intencional" si llevan `tier: 3` en el frontmatter. Esto permite que los proyectos tengan agentes propios del dominio de negocio sin colisionar con el framework.

---

## 3. CLI y experiencia de usuario

El CLI de forge (`forge.py`, 975 líneas) es una TUI completa escrita sobre primitivas de terminal puras — sin dependencias externas más allá de `pyyaml`. El diseño de la interfaz incluye:

- **Menú navegable con ↑↓ Enter** y cursor oculto durante la navegación
- **Panel de descripción contextual** que muestra información del ítem seleccionado en un recuadro con bordes Unicode (`╭─╮ │ │ ╰─╯`)
- **Pills de categoría con colores ANSI** por tipo de recurso (FW, MCP, PRF, TL, DOC)
- **Detección de TTY** para degradarse graciosamente en entornos no interactivos

El menú principal tiene seis operaciones:

1. **Wizard** — nuevo proyecto paso a paso
2. **Init** — instalar agentes en el runtime elegido
3. **Audit** — auditar coherencia del proyecto
4. **Catálogo** — buscar frameworks, MCP servers y profiles
5. **Scaffold** — crear un profile Tier 2 nuevo
6. **Teardown** — revertir la instalación

Cada operación tiene descripciones contextuales precisas. Por ejemplo, la opción de auditoría JSON describe exactamente el contrato: "Retorna exit code 1 si hay errores de severidad 'error' o 'critical'. Integrar en pipelines con: `forge-audit.py --json | jq '.summary'`".

Lo notable es que el CLI no es solo una envoltura estética: gestiona la instalación directa de MCP servers escribiendo en `.claude/settings.json`, agrega profiles a `project.yaml` sin corromper el YAML, y maneja correctamente los estados de "ya instalado" vs "instalar por primera vez".

---

## 4. Sistema de profiles: extensibilidad real

Los nueve profiles disponibles (`hono-drizzle`, `nextjs-admin`, `astro`, `fastapi`, `rails`, `nestjs`, `express`, `expo`, `playwright-crawler`) cubren los stacks más comunes en desarrollo web moderno. Pero más importante que el catálogo actual es el mecanismo de extensión.

El comando `forge-scaffold-profile.py` genera un agente Tier 2 completo con frontmatter correcto, secciones obligatorias y un checklist de próximos pasos en la salida. El template generado incluye:

- Frontmatter con `tier: 2` y `profile: <nombre>`
- Secciones `## Stack`, `## Tu trabajo`, `## Reglas`, `## Workflow`, `## No hagas`
- Reglas de seguridad no negociables pre-incorporadas (logs append-only, parámetros preparados, auth + authz)

El scaffolder detecta automáticamente el directorio forge tanto cuando se usa desde dentro del repo como cuando está instalado como submodule en `.agentic/`. No requiere editar ningún archivo de configuración de forge: `forge-init.py` detecta profiles dinámicamente leyendo el filesystem.

---

## 5. Catálogo MCP y utilidad práctica

El catálogo en `aitmpl-search.py` contiene 40+ recursos con instalación directa para 20 MCP servers. Cada entrada tiene estructura completa:

```python
{
    "name":    "MCP — postgres",
    "install": {
        "slug":    "postgres",
        "command": "npx",
        "args":    ["-y", "@modelcontextprotocol/server-postgres", "{CONNECTION_STRING}"],
        "params":  [{"key": "CONNECTION_STRING", "label": "...", "default": "postgresql://..."}],
    },
}
```

La instalación desde el CLI guía al usuario por los parámetros necesarios, escribe la configuración en `.claude/settings.json` y maneja el caso de reinstalación mostrando el estado actual. El catálogo funciona completamente **offline** — sin dependencias de red para la búsqueda base — y puede extenderse con GitHub API mediante el flag `--github`.

Los 20 MCP servers cubiertos abarcan el ciclo completo de desarrollo: acceso a filesystem, git, GitHub, postgres, sqlite, fetch web, Slack, Playwright, Docker, Cloudflare, Vercel, Linear, Sentry, memoria persistente, reasoning estructurado y más.

---

## 6. Wizard interactivo: onboarding en minutos

El wizard (`forge-wizard.py`) guía la configuración de un proyecto nuevo en una secuencia de 11 pasos con selección interactiva. La lógica de negocio es correcta y está completamente cubierta por tests:

- **Detección automática de modo** según tamaño del equipo (1-2 → startup, 3-8 → standard, 9+ → enterprise)
- **Inferencia de lenguaje** a partir del stack elegido (`detect_language("nextjs", "fastapi") == "mixed"`)
- **Sugerencia automática de profiles** según el tipo y stack del proyecto
- **Generación de YAML diferenciada** por modo: startup omite fases de sprint; enterprise genera 4 fases con compliance incluido; standard genera 2 fases con skills

La detección es inteligente en los detalles. Si el proyecto usa `database: "none"`, el skill `db-migrate` se comenta automáticamente en el YAML generado (`# - db-migrate`). Si el modo es enterprise y hay compliance, `audit_logs: true` se activa automáticamente.

Todos estos comportamientos están verificados en `tests/test_forge_wizard.py` (33 tests, 261 líneas) con casos extremos explícitos.

---

## 7. Sistema de auditoría: mantenibilidad a largo plazo

`forge-audit.py` es una de las piezas más valiosas del framework para equipos que trabajan a largo plazo. Analiza cuatro dimensiones:

1. **Health check por agente**: frontmatter completo, secciones requeridas, modelo apropiado
2. **Gap analysis vs forge**: similitud con la versión de referencia usando `SequenceMatcher.ratio()`
3. **Oportunidades**: profiles y skills disponibles que el proyecto no usa
4. **Huérfanos**: agentes en `.claude/` no declarados en `project.yaml`

La clasificación de similitud es calibrada (documentada en el código en líneas 54-58):

```python
SIMILARITY_WARN     = 0.80  # <80% → posibles mejoras disponibles en forge
SIMILARITY_OUTDATED = 0.50  # <50% → probablemente desactualizado o fork intencional
```

Y la lógica diferencia correctamente entre "fork intencional" (el proyecto tiene más líneas que forge → especialización legítima) y "desactualizado" (forge tiene más líneas → el proyecto se quedó atrás).

El modo `--json` retorna el resultado estructurado con exit code 1 si hay errores críticos, lo que permite integrarlo en CI/CD:

```bash
python3 .agentic/scripts/forge-audit.py --json | jq '.summary'
```

---

## 8. Soporte multi-runtime: la misma config para cualquier herramienta

Un solo `project.yaml` genera configuración para tres runtimes diferentes:

| Runtime | Genera | Adapter |
|---------|--------|---------|
| Claude Code | `.claude/agents/` + `CLAUDE.md` + slash commands | `adapters/claude-code/` |
| OpenCode | `AGENTS.md` | `adapters/opencode/` |
| Kiro | `.kiro/steering/*.md` | `adapters/kiro/` |

El adapter de Kiro genera hasta cuatro archivos de steering (`product.md`, `structure.md`, `agents.md`, `compliance.md`), donde `compliance.md` solo se crea si el proyecto tiene frameworks configurados. El adapter de OpenCode lee el frontmatter `description` de cada agente desde los archivos de forge, preservando la descripción específica del profile cuando existe.

Esta arquitectura de adapters significa que cambiar de runtime no requiere reconfigurar el proyecto desde cero — solo ejecutar `forge-init.py --tool <nuevo-runtime>`.

---

## 9. Calidad de código y suite de tests

La suite de tests tiene 290 casos que pasan en 2.51 segundos, organizados en 11 archivos temáticos con ~1974 líneas de tests:

- `test_forge_wizard.py` — 33 tests de lógica de negocio del wizard
- `test_forge_init_integration.py` — tests de integración que ejercitan el flujo completo con `tmp_path`
- `test_forge_audit.py` — tests del sistema de auditoría con agentes sintéticos
- `test_profiles.py` — tests estructurales parametrizados sobre todos los agentes de todos los profiles
- `test_adapters.py` — tests de los tres adapters de runtime

La cobertura de los tests estructurales de profiles es especialmente valiosa: cualquier profile nuevo que no cumpla el estándar (frontmatter completo, tier correcto, secciones obligatorias, modelo apropiado) rompe la suite antes de llegar a producción.

El código es Python 3.9+ compatible, usa solo la librería estándar más `pyyaml`, y declara el mínimo de dependencias (`requirements.txt` tiene dos líneas: `pyyaml>=6.0` y `pytest>=7.0`).

---

## 10. Casos de uso donde forge brilla

**Equipo de 3-8 personas adoptando Claude Code**: el wizard configura el roster completo en minutos. La auditoría periódica detecta agentes desactualizados. El catálogo MCP permite agregar postgres o GitHub sin recordar la sintaxis exacta de configuración.

**Proyecto con compliance regulatorio (GDPR, Ley 21.719)**: el `compliance-reviewer` con poder de veto se instala automáticamente cuando se declaran frameworks en `project.yaml`. Las reglas de compliance no-negociables están en el core de cada agente, no en instrucciones ad hoc.

**Equipo que cambia de runtime**: si el equipo migra de Claude Code a Kiro (o usa ambos), `forge-init.py --tool all` genera los tres formatos desde la misma configuración.

**Proyecto con stack no cubierto**: `forge-scaffold-profile.py --name django --engineer api-engineer --stack-details "Django 4.2 + PostgreSQL + DRF"` genera un Tier 2 conforme al estándar en segundos, listo para completar con las reglas específicas del stack.

**CI/CD con verificación de agentes**: `forge-audit.py --json` con exit code semántico permite agregar un paso de verificación de coherencia de agentes en cualquier pipeline.

---

## Conclusión: por qué se recomienda adoptar forge

forge no es un experimento conceptual. Es un framework operacional con:

- **290 tests pasando** que cubren el flujo completo de uso
- **Arquitectura de tres tiers** que separa correctamente lo universal de lo específico al stack
- **Reversibilidad total**: `forge-teardown.py` elimina lo que forge instaló sin tocar el trabajo del proyecto
- **Una sola dependencia de runtime** (`pyyaml`) que cualquier entorno Python ya tiene
- **Instalación como submodule git**: `git submodule add ... .agentic` — sin npm, sin cargo, sin binarios externos
- **Filosofía alineada con buenas prácticas**: SDD como flujo central, compliance by design, agentes con scope acotado

El costo de adopción es bajo (tres comandos para estar operacional) y el costo de abandono también (un comando para revertir). Esa combinación de bajo riesgo y alto valor operacional es exactamente lo que hace que una herramienta valga la pena introducir en un proyecto real.

Para equipos que trabajan con agentes IA en desarrollo de software, forge es la capa de estructura que permite escalar el uso de esos agentes de forma ordenada, auditada y reproducible.
