# Forge v2: Plan de Implementación Paso a Paso

**Versión:** 1.0
**Fecha:** Mayo 2026
**Propósito:** Convertir el plan de arquitectura (`forge-v2-plan.md`) en tareas ejecutables.
**Audiencia:** Líder técnico designado y equipo de SocialWeb.

---

## Cómo usar este documento

Este archivo está pensado para ser ejecutado en dos niveles.

**Nivel humano.** Cada bloque numerado corresponde a un issue de GitHub. Se cargan al repositorio `socialwebcl/forge` en el proyecto "Forge v2 Roadmap" usando el script `scripts/seed-issues.sh` que viene al final. Los issues tienen labels (`fase-0`, `fase-1`, etc.), milestones (uno por fase) y dependencias declaradas en el cuerpo.

**Nivel agéntico.** Las tareas marcadas con `parallel-safe` se pueden ejecutar en simultáneo por distintos agentes de Claude Code sin pisarse. Las marcadas con `serial` requieren que la anterior termine antes. Los agent teams del proyecto trabajan con esa marca para decidir cuántos teammates spawnear.

**Vocabulario.** A lo largo del documento se usa el modelo de cinco capas del Agent Development Kit como referencia común:

1. **Memory Layer** — CLAUDE.md fija las reglas
2. **Knowledge Layer** — Skills proveen expertise
3. **Guardrail Layer** — Hooks enforzan calidad
4. **Delegation Layer** — Subagents delegan trabajo
5. **Distribution Layer** — Plugins distribuyen al equipo

Cada tarea declara a qué capa pertenece, lo cual permite que el agent team sepa qué rol asignar.

---

## Estructura del repositorio durante la implementación

```
forge/
├── docs/
│   ├── architecture/
│   │   └── adr/                          # ADRs numerados
│   ├── plan/
│   │   ├── forge-v2-plan.md              # documento maestro
│   │   └── forge-v2-implementation.md    # este archivo
│   └── migration/                        # guías de migración v1 → v2
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── forge-task.md                 # template para issues nuevos
│   └── workflows/
│       └── seed-issues.yml               # workflow opcional para cargar issues
├── scripts/
│   ├── seed-issues.sh                    # crea los issues de este plan en GitHub
│   └── seed-project.sh                   # configura el GitHub Project
└── ...
```

---

## Pre-requisitos antes de arrancar

Las siguientes tres cosas son bloqueantes. Sin ellas el plan no empieza.

### PR-1: Designar líder técnico de Forge

**Responsable:** Cris
**Plazo:** Esta semana
**Output:** Memo interno indicando quién es la persona designada como mantenedora principal de Forge mientras Cris esté en Bienes Nacionales.

La persona designada debe cumplir:

- Senior con autoridad para aprobar PRs sin pasar por Cris
- Disponibilidad de al menos cuatro horas semanales para Forge
- Acceso a los proyectos cookycmp y fesw-encuestas (los dos casos de evidencia)

Sin esta designación, el resto del plan es teórico.

### PR-2: Conversar con probidad de Bienes Nacionales

**Responsable:** Cris
**Plazo:** Antes del cierre de Fase 0
**Output:** Documento de respaldo donde se deja constancia de que Cris notificó a probidad sobre el proyecto open source bajo SocialWeb, y la respuesta recibida.

Pregunta concreta a hacer: dado que Forge se publicará bajo SocialWeb con licencia Apache 2.0 y será usado por la consultora con clientes privados, ¿hay alguna restricción específica que respetar mientras Cris esté como Head of IT? La respuesta esperada es "ninguna mientras no toque al Estado", pero hay que tenerla por escrito.

### PR-3: Auditoría de contenido del repo actual

**Responsable:** Líder técnico designado (después de PR-1)
**Plazo:** Antes de cualquier publicación
**Output:** Lista de archivos a remover o anonimizar antes de publicar el repo.

Tareas concretas:

- Buscar cualquier referencia a clientes específicos (CNTV, UNICEF, IATA, SERCOTEC, DEP)
- Buscar credenciales, tokens, URLs internas, IDs de proyectos privados
- Buscar mención a Bienes Nacionales o cualquier órgano público
- Buscar referencias a Ley 21.719 que no sean genéricas (los profiles de compliance se eliminaron del scope, ver decisión)

---

## Fase 0 — Estabilización (Mayo–Junio 2026)

**Objetivo:** que Forge v1.5 (con session-start/close de cookycmp portado) esté siendo usado por al menos tres desarrolladores de SocialWeb en proyectos reales.

**Milestone:** `v1.5.0`

### F0-01: Portar `/session-start` desde cookycmp

**Capa:** Knowledge Layer
**Tipo:** `parallel-safe` (independiente de F0-02 a F0-05)
**Tamaño:** S (1-2 horas con agente)

**Descripción:**
Tomar el archivo `commands/session-start.md` de cookycmp y adaptarlo para Forge.

**Criterios de aceptación:**
- Archivo en `forge/core/commands/session-start.md` con la lógica completa
- Adaptado para que funcione en cualquier stack (no solo monorepos TypeScript)
- Soporta los tres escenarios (feature branch activa, main con trabajo previo, main limpio)
- Documentado en `docs/commands/session-start.md` con ejemplos

**Agente sugerido:** `senior-backend` o `docs-writer`

---

### F0-02: Portar `/session-close` desde cookycmp

**Capa:** Knowledge Layer
**Tipo:** `parallel-safe`
**Tamaño:** M (2-4 horas con agente)

**Descripción:**
Tomar `commands/session-close.md` de cookycmp y adaptarlo para Forge. El pipeline de ocho pasos debe quedar idéntico, pero la integración con GitHub Projects debe parametrizarse via `project.yaml`.

**Criterios de aceptación:**
- Archivo en `forge/core/commands/session-close.md`
- Las constantes de GitHub Projects salen de `project.yaml`, no hardcoded
- Si el proyecto no tiene GitHub Project configurado, el paso 4 se omite con un mensaje
- Si el proyecto no usa changesets, el paso 3 se omite
- Documentado en `docs/commands/session-close.md`

**Agente sugerido:** `senior-backend`

**Dependencia:** ninguna (independiente de F0-01)

---

### F0-03: Adaptar `pre-edit-check.py` para stacks no-TypeScript

**Capa:** Guardrail Layer
**Tipo:** `parallel-safe`
**Tamaño:** M (3-4 horas)

**Descripción:**
El hook actual está pensado para Node/TypeScript. Adaptarlo para que funcione también en PHP/Laravel, Python/Django, Ruby/Rails, etc.

**Criterios de aceptación:**
- Archivo en `forge/core/hooks/pre-edit-check.py`
- Detecta patrones equivalentes a `console.log` en cada lenguaje:
  - PHP: `var_dump`, `print_r`, `error_log` sin manejo
  - Python: `print(` en archivos que no son scripts
  - Ruby: `puts`, `p `, `pp `
- Mantiene la detección de PII y secrets (lenguaje-agnóstica)
- Mantiene el branch-guard contra editar en main
- Los patrones se configuran via `project.yaml` (`stack.language` → cargar reglas correctas)

**Agente sugerido:** `senior-backend`

---

### F0-04: Portar `stop-typecheck.sh` con detección de stack

**Capa:** Guardrail Layer
**Tipo:** `parallel-safe`
**Tamaño:** S (1-2 horas)

**Descripción:**
El script actual asume pnpm + turborepo. Generalizarlo para que detecte el package manager y la herramienta de typecheck/lint del proyecto.

**Criterios de aceptación:**
- Archivo en `forge/core/hooks/post-turn-check.sh` (renombrado para reflejar que hace más que typecheck)
- Detecta automáticamente: pnpm, npm, yarn, bun, composer, pip, bundler
- Lee de `project.yaml` qué comando correr (`scripts.check`)
- Si el proyecto no tiene comando configurado, el hook no falla (exit 0)
- Solo corre sobre archivos modificados en el turno, no sobre todo el repo

**Agente sugerido:** `senior-devops`

---

### F0-05: Crear documento de migración v1 → v1.5

**Capa:** transversal
**Tipo:** `serial` (depende de F0-01, F0-02, F0-03, F0-04)
**Tamaño:** S (1-2 horas)

**Descripción:**
Guía paso a paso para que un proyecto que ya usa Forge v1 incorpore los nuevos comandos de sesión y los hooks actualizados.

**Criterios de aceptación:**
- Archivo en `docs/migration/v1-to-v1.5.md`
- Contiene los comandos exactos para actualizar el submodule
- Documenta los cambios en `project.yaml` necesarios
- Incluye sección "qué hago si ya tenía hooks custom"
- Probado migrando manualmente cookycmp y fesw-encuestas

**Agente sugerido:** `docs-writer`

---

### F0-06: Definir la bitácora de fricción

**Capa:** transversal
**Tipo:** `parallel-safe`
**Tamaño:** S (1 hora)

**Descripción:**
Crear el formato de la bitácora donde cada desarrollador anota cada fricción que encuentra usando Forge. Esta bitácora es la fuente principal del roadmap de Fase 1.

**Criterios de aceptación:**
- Archivo en `docs/feedback/friction-log.md`
- Template para cada entrada: fecha, dev, proyecto, comando, fricción, severidad, propuesta
- Documentado en `CONTRIBUTING.md` cómo agregar entradas
- Mensaje fijado en el canal interno de Slack/Discord de SocialWeb explicando el formato

**Agente sugerido:** `docs-writer`

---

### F0-07: Adoptar Forge v1.5 en tres proyectos

**Capa:** transversal
**Tipo:** `parallel-safe` (los tres proyectos en paralelo)
**Tamaño:** L (por proyecto)

**Descripción:**
Tres devs distintos adoptan Forge v1.5 en tres proyectos reales y reportan fricciones durante un mes.

**Criterios de aceptación:**
- Tres proyectos con Forge v1.5 instalado y `/session-start` y `/session-close` siendo usados al menos diez veces cada uno
- Al menos cinco entradas en la bitácora de fricción
- Cada dev firma una nota corta confirmando que el flujo le funciona o explicando por qué no

**Bloqueante para cierre de Fase 0.**

---

## Fase 1 — Forge v2 Core (Julio–Agosto 2026)

**Objetivo:** las cinco capas del Agent Development Kit implementadas, los seis comandos principales funcionando, y cookycmp + fesw-encuestas migrados como prueba de validez.

**Milestone:** `v2.0.0-alpha`

### Bloque A: Memory Layer (Capa 1)

#### F1-A01: Separar `global.md` y `project.md` en CLAUDE.md

**Capa:** Memory Layer
**Tipo:** `parallel-safe`
**Tamaño:** M (3 horas)

**Descripción:**
Hoy el CLAUDE.md de cada proyecto mezcla reglas universales (commits, idioma, herramientas) con reglas específicas del proyecto (stack, comandos). Forge v2 los separa:

- `~/.claude/CLAUDE.md` — reglas universales del desarrollador (`global.md`)
- `<repo>/CLAUDE.md` — reglas del proyecto (`project.md`)
- `<repo>/.claude/architecture.rules` — convenciones de arquitectura del proyecto

**Criterios de aceptación:**
- Tres templates en `forge/core/templates/claude-md/`
- Documentación en `docs/claude-md-layers.md` explicando cuál usar para qué
- `forge init` genera los tres archivos automáticamente
- Si ya existe un CLAUDE.md monolítico, el comando `forge migrate-claude-md` lo divide

**Agente sugerido:** `senior-backend`

---

#### F1-A02: Crear `project.yaml` v2 schema

**Capa:** Memory Layer
**Tipo:** `serial` (bloquea Bloque B y siguientes)
**Tamaño:** L (5-6 horas)

**Descripción:**
Refactor del `project.yaml` actual a la versión 2.0 con todas las nuevas secciones: deploy, mcp, github, rules.

**Criterios de aceptación:**
- Schema JSON en `forge/core/schemas/project.schema.json`
- Validador en Python que verifica cumplimiento
- Migrador automático v1 → v2 (`forge migrate-project-yaml`)
- Documentación completa en `docs/project-yaml-reference.md`
- Tests con tres ejemplos: startup, standard, enterprise

**Agente sugerido:** `senior-backend` + `qa-reviewer`

**Bloqueante para todo el resto de la Fase 1.**

---

### Bloque B: Knowledge Layer (Capa 2) — Comandos principales

#### F1-B01: Implementar `/plan` completo

**Capa:** Knowledge Layer
**Tipo:** `parallel-safe` (con F1-B02 a F1-B04)
**Tamaño:** L (6-8 horas)

**Descripción:**
Comando que crea o continúa specs en `docs/specs/`. Incluye plantilla obligatoria y patrón Planner-Critic para modos standard y enterprise.

**Criterios de aceptación:**
- Archivo `forge/core/commands/plan.md`
- Plantilla en `forge/core/templates/spec-template.md`
- Implementa los tres modos: `/plan <fase> "<título>"`, `/plan` (continuar), `/plan --review <spec>`
- En modo standard y enterprise, antes de marcar spec como ready, invoca dialéctica Planner-Critic
- Documentado en `docs/commands/plan.md` con ejemplos
- Tests manuales en cookycmp creando una spec real

**Agente sugerido:** `senior-backend` + `compliance-reviewer` (para validar Planner-Critic)

---

#### F1-B02: Implementar `/work` con agent teams

**Capa:** Knowledge Layer
**Tipo:** `parallel-safe`
**Tamaño:** XL (8-12 horas)

**Descripción:**
Comando que recibe una spec aprobada y orquesta un agent team para implementarla.

**Criterios de aceptación:**
- Archivo `forge/core/commands/work.md`
- Lee spec asociada (o pide elegirla)
- Propone composición de team según `project.yaml` y modo del proyecto
- Soporta flags: `--serial`, `--codex`, `--autorun` (experimental)
- Si `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` no está habilitado, usa subagentes seriales
- Documentado con ejemplos en `docs/commands/work.md`

**Agente sugerido:** `senior-backend`

---

#### F1-B03: Implementar `/review` multi-agente

**Capa:** Knowledge Layer + Delegation Layer
**Tipo:** `parallel-safe`
**Tamaño:** M (4-5 horas)

**Descripción:**
Revisión sobre diff actual o PR específico. Spawnea agentes en paralelo según modo del proyecto.

**Criterios de aceptación:**
- Archivo `forge/core/commands/review.md`
- Modos: `/review`, `/review HEAD~N..HEAD`, `/review PR-N`, `/review --codex`
- Genera reporte estructurado con resultado: APPROVED / CHANGES_REQUESTED / BLOCKED
- Si BLOCKED, marca la sesión como no apta para `/ship`
- Documentado en `docs/commands/review.md`

**Agente sugerido:** `senior-backend` + `qa-reviewer`

---

#### F1-B04: Implementar `/ship` con polling controlado

**Capa:** Knowledge Layer
**Tipo:** `parallel-safe`
**Tamaño:** XL (10-12 horas)

**Descripción:**
Pipeline de deploy + verificación. Solo disponible si `project.yaml` tiene sección `deploy`.

**Criterios de aceptación:**
- Archivo `forge/core/commands/ship.md`
- Implementa los 10 pasos del plan maestro
- Polling con backoff: máximo 1 poll/minuto a Vercel/Railway/etc.
- Smoke tests definidos en `project.yaml` se ejecutan post-deploy
- Si runtime logs tienen errores en los primeros 60s, sugiere rollback (no lo ejecuta)
- Documenta cómo agregar un provider nuevo en `docs/ship-providers.md`
- Provider Vercel funcional al menos (con `mcp__claude_ai_Vercel__*`)

**Agente sugerido:** `senior-devops` + `senior-backend`

---

### Bloque C: Guardrail Layer (Capa 3) — Hooks

#### F1-C01: Implementar hooks por modo

**Capa:** Guardrail Layer
**Tipo:** `parallel-safe`
**Tamaño:** L (6-8 horas)

**Descripción:**
Sistema que selecciona hooks a instalar según el modo del proyecto (startup/standard/enterprise) y el stack declarado.

**Criterios de aceptación:**
- Configuración en `forge/core/hooks/registry.yaml`
- `forge init` instala el set correcto según `project.yaml`
- Cada hook tiene matchers explícitos para PreToolUse, PostToolUse, Stop, UserPromptSubmit, SessionStart
- Documentado en `docs/hooks-by-mode.md`

**Agente sugerido:** `senior-devops`

---

#### F1-C02: `pre-bash-check.py` para modo production

**Capa:** Guardrail Layer
**Tipo:** `parallel-safe`
**Tamaño:** M (3-4 horas)

**Descripción:**
Hook que bloquea comandos destructivos contra URLs de producción. Basado en la lección del incidente fesw del 2026-04-28.

**Criterios de aceptación:**
- Archivo `forge/core/hooks/pre-bash-check.py`
- Detecta patrones: `--force-reset`, `DROP TABLE`, `TRUNCATE`, `DELETE FROM` sin WHERE, `prisma migrate reset`, `dropdb`, `rm -rf` en paths sensibles
- Lee `PRODUCTION_DATABASE_URL` o equivalentes del proyecto
- Si el comando incluye URL de producción, bloquea sin más
- Si es ambiguo, pide confirmación explícita
- Tests con casos reales del incidente fesw

**Agente sugerido:** `senior-devops` + `security-auditor`

---

#### F1-C03: SessionStart hook determinístico

**Capa:** Guardrail Layer
**Tipo:** `parallel-safe`
**Tamaño:** S (2 horas)

**Descripción:**
Hook bash que dispara al inicio de cada sesión (no es el slash command `/session-start`). Hace verificaciones determinísticas: env vars cargadas, herramientas instaladas, estado del repo.

**Criterios de aceptación:**
- Archivo `forge/core/hooks/session-start.sh`
- Verifica que las herramientas declaradas en `project.yaml` estén disponibles
- Carga env vars de `.env.local` si existe
- Muestra estado del repo en una línea: branch, commits ahead/behind, PRs abiertos
- Diferenciar bien del slash command `/session-start` en la docs

**Agente sugerido:** `senior-devops`

---

### Bloque D: Delegation Layer (Capa 4) — Subagents

#### F1-D01: Refactorizar agentes Tier 1

**Capa:** Delegation Layer
**Tipo:** `parallel-safe`
**Tamaño:** L (5-6 horas)

**Descripción:**
Los siete agentes universales (orchestrator, backend-engineer, frontend-engineer, test-engineer, docs-writer, compliance-reviewer, security-auditor) se actualizan para que sean conscientes del nuevo flujo de sesiones, del Planner-Critic, y del modo del proyecto.

**Criterios de aceptación:**
- Archivos en `forge/core/agents/`
- Cada agente declara qué slash commands puede invocar
- Cada agente tiene contexto sobre los hooks activos y los respeta
- Documentación de cada agente en `docs/agents/<nombre>.md`

**Agente sugerido:** `senior-backend` + `compliance-reviewer`

---

#### F1-D02: Actualizar profiles Tier 2

**Capa:** Delegation Layer
**Tipo:** `parallel-safe` (cada profile independiente)
**Tamaño:** M por profile (3-4 horas)

**Descripción:**
Los profiles de stack (hono-drizzle, nextjs-admin, laravel, wordpress, etc.) se actualizan a la convención v2.

**Sub-tareas paralelas:**
- F1-D02a: profile `hono-drizzle`
- F1-D02b: profile `nextjs-admin`
- F1-D02c: profile `laravel`
- F1-D02d: profile `wordpress`
- F1-D02e: profile `astro`
- F1-D02f: profile `fastapi`
- F1-D02g: profile `expo`

Los siete son independientes, se pueden hacer en paralelo por siete agentes.

**Criterios de aceptación por cada uno:**
- Archivo en `forge/profiles/<nombre>/`
- Agentes específicos del stack actualizados
- Hooks específicos del stack (ej: `prisma-safety` para nextjs, `composer-check` para laravel)
- Skills específicas del stack
- README en `forge/profiles/<nombre>/README.md`

---

### Bloque E: Distribution Layer (Capa 5) — Plugins

#### F1-E01: Crear `manifest.json` del proyecto Forge

**Capa:** Distribution Layer
**Tipo:** `serial` (depende de F1-D01 y F1-D02)
**Tamaño:** S (2 horas)

**Descripción:**
Manifest que describe qué se instala con Forge. Para futura distribución vía marketplace de Claude Code.

**Criterios de aceptación:**
- Archivo `manifest.json` en raíz del repo
- Lista skills, agents, hooks, commands disponibles
- Versionado coherente con el VERSION del proyecto

---

#### F1-E02: Documentar instalación por team

**Capa:** Distribution Layer
**Tipo:** `parallel-safe`
**Tamaño:** S (2 horas)

**Descripción:**
Cómo un equipo entero instala Forge en cinco minutos y queda con la misma configuración.

**Criterios de aceptación:**
- Documentación en `docs/team-install.md`
- Script `scripts/team-install.sh` que descarga la versión del submodule, instala dependencias, ejecuta `forge init` con valores por defecto del equipo
- Probado con tres devs de SocialWeb

---

### Bloque F: Memoria del proyecto (transversal)

#### F1-F01: Implementar `forge wiki`

**Capa:** Knowledge Layer (transversal)
**Tipo:** `parallel-safe`
**Tamaño:** L (5-6 horas)

**Descripción:**
Comandos para gestionar `docs/wiki/`: ingest, query, lint.

**Criterios de aceptación:**
- Subcomandos: `forge wiki ingest`, `forge wiki query`, `forge wiki lint`
- Estructura estándar: `index.md`, `log.md` (append-only), `raw/`, `concepts/`, `entities/`, `sources/`, `synthesis/`
- `forge wiki lint` detecta links rotos, archivos huérfanos, ediciones a `raw/`
- Integración opcional con Obsidian via MCP documentada en `docs/wiki-obsidian.md`

**Agente sugerido:** `senior-backend` + `docs-writer`

---

#### F1-F02: Estandarizar daily-notes

**Capa:** Memory Layer
**Tipo:** `parallel-safe`
**Tamaño:** S (2 horas)

**Descripción:**
`/session-close` debe generar una nota en `docs/daily-notes/YYYY-MM-DD-<tema>.md`. Definir el formato exacto.

**Criterios de aceptación:**
- Template en `forge/core/templates/daily-note.md`
- `/session-close` lo genera automáticamente
- Contiene: tareas completadas, archivos modificados, commits, decisiones, blockers para próxima sesión
- Si hay GitHub Project, incluye issues movidos a Done

**Agente sugerido:** `docs-writer`

---

### Bloque G: Validación con proyectos reales

#### F1-G01: Migrar cookycmp a Forge v2

**Capa:** transversal
**Tipo:** `serial` (depende de TODAS las anteriores de Fase 1)
**Tamaño:** XL (8-10 horas)

**Descripción:**
El proyecto cookycmp se convierte en el primer caso real corriendo con Forge v2. Si no funciona, Forge v2 está mal.

**Criterios de aceptación:**
- `project.yaml` v2 generado y validado
- Comandos de sesión funcionando
- Hooks activos en modo enterprise
- Wiki migrada desde la estructura actual
- Tres sesiones completas hechas por al menos dos devs sin tropezar
- Bitácora de fricción actualizada con cualquier hallazgo

**Bloqueante para cierre de Fase 1.**

---

#### F1-G02: Migrar fesw-encuestas a Forge v2

**Capa:** transversal
**Tipo:** `serial` (depende de F1-G01 para detectar problemas antes)
**Tamaño:** L (6-8 horas)

**Descripción:**
Segundo proyecto de validación. Tiene la complejidad adicional del modo production y los MCP servers.

**Criterios de aceptación:**
- Todo lo de F1-G01 más:
- `/ship` funcionando con Vercel real (deploy verificado)
- MCP de Supabase y Vercel integrados via `project.yaml`
- Hook `pre-bash-check.py` previniendo el incidente del 2026-04-28 en una simulación controlada
- Daily-notes en formato Forge v2 generadas en `docs/daily-notes/` y también sincronizadas a Obsidian vault si está configurado

**Bloqueante para cierre de Fase 1.**

---

## Fase 2 — Multi-runtime real (Septiembre–Octubre 2026)

**Objetivo:** Forge v2 funcionando en al menos OpenCode y Codex CLI además de Claude Code.

**Milestone:** `v2.0.0-beta`

### F2-01 a F2-04: Soporte OpenCode

Cuatro tareas paralelas para implementar el flujo completo en OpenCode.

- **F2-01:** Traducir slash commands de Claude Code a OpenCode commands (`parallel-safe`, M)
- **F2-02:** Adaptar hooks al sistema de OpenCode (`parallel-safe`, L)
- **F2-03:** Verificar comportamiento de agent teams en OpenCode (`parallel-safe`, M)
- **F2-04:** Documentar diferencias en `docs/runtimes/opencode.md` (`serial` después de las tres anteriores, S)

### F2-05 a F2-08: Soporte Codex CLI

Análogas a las de OpenCode pero para Codex.

- **F2-05:** Implementar `$forge-plan`, `$forge-work`, etc. para Codex (`parallel-safe`, M)
- **F2-06:** Investigar qué hooks soporta Codex y portar los compatibles (`parallel-safe`, L)
- **F2-07:** Setup script `setup-codex.sh` que instala todo en `~/.codex` o `.codex/` (`parallel-safe`, M)
- **F2-08:** Documentar en `docs/runtimes/codex.md` (`serial`, S)

### F2-09: Decisión Kiro

**Tipo:** `parallel-safe`
**Tamaño:** S (2 horas, mayormente investigación)

Evaluar el estado de Kiro a Septiembre 2026. Si tiene tracción razonable, agregar a la lista. Si no, documentar la decisión de no soportarlo y por qué.

### F2-10: Capa de traducción de configs

**Tipo:** `serial` (depende de F2-04 y F2-08)
**Tamaño:** XL (8-10 horas)

Forge v2 debe poder leer `project.yaml` y generar config nativa para cada runtime. Esto extiende el patrón actual de "generar config para Claude Code, OpenCode, Kiro, Codex" pero con el detalle de los hooks.

### F2-11: Validar con dos proyectos reales

**Tipo:** `serial`
**Tamaño:** L

Dos proyectos de SocialWeb se desarrollan, uno en cada runtime distinto. Al cierre de Fase 2, los devs reportan si funcionó o no.

---

## Fase 3 — Liberación pública (Noviembre 2026–Enero 2027)

**Objetivo:** Forge v2 publicado bajo `socialwebcl/forge` con Apache 2.0.

**Milestone:** `v2.0.0`

### Pre-requisitos (deben estar todos en sí antes de empezar Fase 3)

- F3-PR1: Un dev nuevo en SocialWeb usa Forge productivamente con solo la docs
- F3-PR2: Dos devs además de Cris pueden modificar Forge con autonomía
- F3-PR3: Forge sobrevivió cinco proyectos reales sin parches mayores en arquitectura

### F3-01: Limpieza final del repo

**Tipo:** `serial`
**Tamaño:** M

Revisar exhaustivamente que no haya rastros de clientes específicos, credenciales o información sensible. Re-ejecutar la auditoría que se hizo en PR-3 con ojos frescos.

### F3-02: README final

**Tipo:** `parallel-safe`
**Tamaño:** L

Reescribir el README con:
- Posicionamiento honesto (no exagerar)
- Comparativa explícita contra cc-sdd, Bridle, Harness, wshobson/agents
- Quick start de cinco minutos
- Casos de uso reales (sin nombres de clientes)
- Sección de contribuciones

### F3-03: Conversación final con probidad

**Tipo:** `serial` (debe ocurrir antes de la publicación)
**Tamaño:** S

Confirmar que las condiciones de PR-2 siguen vigentes y que la publicación pública no genera problemas.

### F3-04: Publicar extensión VS Code al Marketplace

**Tipo:** `parallel-safe` con F3-02
**Tamaño:** M

Solo después de confirmar quién es el mantenedor designado de la extensión (no debe ser Cris). Publicar al Marketplace con el manifiesto correcto.

### F3-05: Artículos de lanzamiento

**Tipo:** `parallel-safe`
**Tamaño:** XL (tres artículos)

Tres a cinco artículos en LinkedIn firmados desde el rol académico (profesor UTFSM, alumno MIT). No mencionar el rol en Bienes Nacionales.

Temas sugeridos:
- "Por qué los agentes de IA necesitan un harness, no solo prompts"
- "Cinco capas de un kit de desarrollo agéntico" (basado en el modelo del Agent Development Kit)
- "Cómo enseñamos gestión de proyectos con agentes en INF-360" (caso de uso académico)

---

## Cómo cargar este plan a GitHub

### Script para crear los issues

El siguiente script genera todos los issues automáticamente a partir de este documento. Requiere `gh` CLI autenticado.

```bash
#!/bin/bash
# scripts/seed-issues.sh
# Crea los issues de Forge v2 en GitHub a partir del documento de implementación.

set -euo pipefail

REPO="socialwebcl/forge"
PROJECT_NUMBER=2

# Crear milestones (uno por fase)
gh api repos/$REPO/milestones -f title="Fase 0 - Estabilización" -f due_on="2026-06-30T23:59:59Z" || true
gh api repos/$REPO/milestones -f title="Fase 1 - Forge v2 Core" -f due_on="2026-08-31T23:59:59Z" || true
gh api repos/$REPO/milestones -f title="Fase 2 - Multi-runtime" -f due_on="2026-10-31T23:59:59Z" || true
gh api repos/$REPO/milestones -f title="Fase 3 - Liberación" -f due_on="2027-01-31T23:59:59Z" || true

# Crear labels
gh label create "fase-0" --color "0e8a16" --description "Fase 0 - Estabilización" || true
gh label create "fase-1" --color "1d76db" --description "Fase 1 - Forge v2 Core" || true
gh label create "fase-2" --color "5319e7" --description "Fase 2 - Multi-runtime" || true
gh label create "fase-3" --color "b60205" --description "Fase 3 - Liberación" || true

gh label create "capa-memory" --color "d4c5f9" --description "Memory Layer (CLAUDE.md)" || true
gh label create "capa-knowledge" --color "fef2c0" --description "Knowledge Layer (skills/commands)" || true
gh label create "capa-guardrail" --color "fad8c7" --description "Guardrail Layer (hooks)" || true
gh label create "capa-delegation" --color "c5def5" --description "Delegation Layer (agents)" || true
gh label create "capa-distribution" --color "d4c5f9" --description "Distribution Layer (plugins)" || true

gh label create "parallel-safe" --color "0e8a16" --description "Puede ejecutarse en paralelo con otras" || true
gh label create "serial" --color "b60205" --description "Requiere que dependencias terminen primero" || true

gh label create "size-S" --color "c2e0c6" --description "1-2 horas" || true
gh label create "size-M" --color "fef2c0" --description "3-4 horas" || true
gh label create "size-L" --color "fbca04" --description "5-8 horas" || true
gh label create "size-XL" --color "d93f0b" --description "8+ horas" || true

# Función auxiliar para crear un issue
create_issue() {
  local title="$1"
  local body="$2"
  local milestone="$3"
  local labels="$4"
  
  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body "$body" \
    --milestone "$milestone" \
    --label "$labels"
}

# ─────────────────────────────────────────────────────────
# Fase 0
# ─────────────────────────────────────────────────────────

create_issue \
  "F0-01: Portar /session-start desde cookycmp" \
  "Capa: Knowledge Layer
Tipo: parallel-safe
Tamaño: S

Tomar commands/session-start.md de cookycmp y adaptarlo para Forge.

## Criterios de aceptación
- [ ] Archivo en forge/core/commands/session-start.md con la lógica completa
- [ ] Adaptado para que funcione en cualquier stack
- [ ] Soporta los tres escenarios (feature branch activa, main con trabajo previo, main limpio)
- [ ] Documentado en docs/commands/session-start.md con ejemplos

## Agente sugerido
senior-backend o docs-writer" \
  "Fase 0 - Estabilización" \
  "fase-0,capa-knowledge,parallel-safe,size-S"

create_issue \
  "F0-02: Portar /session-close desde cookycmp" \
  "Capa: Knowledge Layer
Tipo: parallel-safe
Tamaño: M

## Criterios de aceptación
- [ ] Archivo en forge/core/commands/session-close.md
- [ ] Constantes de GitHub Projects parametrizadas via project.yaml
- [ ] Si el proyecto no tiene GitHub Project configurado, paso 4 se omite
- [ ] Si el proyecto no usa changesets, paso 3 se omite
- [ ] Documentado en docs/commands/session-close.md

## Agente sugerido
senior-backend" \
  "Fase 0 - Estabilización" \
  "fase-0,capa-knowledge,parallel-safe,size-M"

# ... (el resto de issues se generan análogamente)

echo "Issues de Fase 0 creados. Para crear los de fases siguientes, ejecutar:"
echo "  scripts/seed-issues-fase-1.sh"
echo "  scripts/seed-issues-fase-2.sh"
echo "  scripts/seed-issues-fase-3.sh"
```

El script completo con los issues de todas las fases se genera por separado (es muy largo para incluir aquí). Vale la pena dividirlo en cuatro scripts (uno por fase) para que se ejecute incrementalmente.

### Configurar el GitHub Project

```bash
#!/bin/bash
# scripts/seed-project.sh
# Configura el GitHub Project para Forge v2.

REPO_OWNER="socialwebcl"
PROJECT_TITLE="Forge v2 Roadmap"

# Crear el proyecto si no existe
PROJECT_ID=$(gh api graphql -f query='
  mutation {
    createProjectV2(input: {
      ownerId: "<OWNER_NODE_ID>"
      title: "'"$PROJECT_TITLE"'"
    }) {
      projectV2 { id number }
    }
  }
' --jq '.data.createProjectV2.projectV2.id')

# Agregar campos custom
gh api graphql -f query='
  mutation {
    createProjectV2Field(input: {
      projectId: "'"$PROJECT_ID"'"
      dataType: SINGLE_SELECT
      name: "Capa"
      singleSelectOptions: [
        { name: "Memory", color: PINK }
        { name: "Knowledge", color: YELLOW }
        { name: "Guardrail", color: ORANGE }
        { name: "Delegation", color: BLUE }
        { name: "Distribution", color: PURPLE }
      ]
    }) { projectV2Field { id } }
  }
'

# (Análogamente para campos Fase, Tamaño, Estado)

echo "GitHub Project configurado. ID: $PROJECT_ID"
```

---

## Cómo ejecutar este plan con agentes de Claude Code

### Patrón de ejecución por bloque

Cada bloque del roadmap (A, B, C, D, E, F, G dentro de cada fase) se puede ejecutar como una sesión multi-agente coordinada. El orquestador asigna tareas a teammates según la marca `parallel-safe` o `serial`.

### Ejemplo de sesión para Bloque B de Fase 1

```
/session-start

> Vamos a implementar el Bloque B de Fase 1: los cuatro comandos principales 
> (/plan, /work, /review, /ship).

/forge phase start fase-1-bloque-b

# Forge orquesta automáticamente:
# - Lee los issues F1-B01 a F1-B04 del milestone "Fase 1 - Forge v2 Core"
# - Identifica que los cuatro son parallel-safe
# - Propone un agent team de cuatro teammates, uno por tarea
# - Cada teammate toma un issue y lo trabaja en su propia rama
# - Al terminar cada teammate, su trabajo va a una rama feature/F1-BXX-<slug>
# - El orquestador sintetiza al final y crea cuatro PRs separados

/review --all-branches feature/F1-B01-* feature/F1-B02-* feature/F1-B03-* feature/F1-B04-*

# Después de aprobar:

/session-close

# /session-close maneja:
# - Mergear los cuatro PRs uno a uno (no en batch, para mantener historial limpio)
# - Mover issues a Done en el GitHub Project
# - Actualizar daily-note con resumen del bloque
# - Crear changesets para el bump de versión
```

### Cuándo NO paralelizar

A pesar de la marca `parallel-safe`, hay momentos donde conviene serializar:

- Cuando hay menos de tres devs disponibles para revisar PRs (el bottleneck no es el código, son las reviews)
- Cuando una tarea descubre algo que cambia el diseño de otra (vale la pena cancelar las paralelas y rehacer)
- Cuando se está aprendiendo el patrón (las primeras dos o tres tareas conviene hacerlas en secuencia para que todos vean cómo se hace)

---

## Cómo iterar este plan

Este documento NO es definitivo. Cada cierre de fase obliga a una retrospectiva donde:

1. Se revisa qué se completó y qué quedó pendiente
2. Se revisa la bitácora de fricción y se priorizan ajustes
3. Se actualiza el roadmap de las fases siguientes con los aprendizajes
4. Se actualiza la versión de este documento (1.0 → 1.1, etc.)

La retrospectiva queda documentada como ADR en `docs/architecture/adr/`.

---

## Checklist final para el líder técnico

Antes de arrancar Fase 0, el líder técnico designado debe:

- [ ] Confirmar disponibilidad (mínimo 4 horas/semana)
- [ ] Tener acceso a cookycmp y fesw-encuestas como casos de evidencia
- [ ] Leer `forge-v2-plan.md` completo
- [ ] Leer este documento completo
- [ ] Tener una conversación con Cris para alinear expectativas
- [ ] Ejecutar `scripts/seed-issues.sh` para cargar Fase 0 a GitHub
- [ ] Crear el GitHub Project ejecutando `scripts/seed-project.sh`
- [ ] Iniciar la bitácora de fricción (F0-06)
- [ ] Anunciar el plan al equipo de SocialWeb

Una vez completado el checklist, ejecutar:

```bash
/session-start
```

Y arrancar con F0-01.

---

**Documento mantenido por:** Por definir (líder técnico Fase 0)
**Última revisión:** Mayo 2026
**Próxima revisión:** Cierre de Fase 0 (Junio 2026)
