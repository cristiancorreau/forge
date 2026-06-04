# Changelog

Todos los cambios notables de forge se documentan en este archivo.

Formato: [Keep a Changelog](https://keepachangelog.com/es/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/lang/es/)

---

## [2.9.11] — 2026-06-04

### Cambiado (infraestructura)
- **CI migrado a Bun.** El `package-lock.json` de `packages/cli` estaba corrupto (la raíz declaraba 8 dependencias pero el árbol solo resolvía `@clack/*`), por lo que `npm ci` nunca instalaba `@opentui/core`. Se elimina ese lockfile y `bun.lock` pasa a ser el único lockfile. El workflow `release` ahora usa `oven-sh/setup-bun` + `bun install --frozen-lockfile`; Node sigue corriendo la suite de tests (matriz 20/22) y `npm publish --provenance` (Bun no soporta provenance).
- `package-lock.json` de `packages/cli` añadido a `.gitignore` para que npm no lo regenere.
- `build:all` invoca las herramientas directamente (`node scripts/build-assets.mjs && tsc`) en vez de `npm run`, para no depender del runner (Bun reescribe `npm run` a `bun run`).

---

## [2.9.10] — 2026-06-04

### Corregido
- **Dashboard post-install: el panel derecho no cambiaba al navegar/Enter.** Los handlers leían `nav.selectedIndex`, pero `SelectRenderable` de OpenTUI no expone un getter `selectedIndex` (solo setter + `getSelectedIndex()`), así que devolvía `undefined` y todas las secciones renderizaban como índice 0 (siempre Overview). Ahora se usa el índice que el evento emite (`selectionChanged`/`itemSelected` pasan `(index, option)`), con fallback a `getSelectedIndex()`. Verificado en PTY: ↑↓ actualiza el panel en vivo y recorre agents → workflow → skills → runtimes → tech.

### Notas
- El welcome/tutorial del wizard ya aparecía al inicio desde 2.9.9 (verificado en PTY). Si no se veía, era una versión cacheada anterior vía `bunx` — usar `bunx @cristiancorreau/forge@latest`.

---

## [2.9.9] — 2026-06-03

### Corregido
- **Fuga de modos de terminal tras `forge init`**: el dashboard post-install (OpenTUI) referenciaba `VERSION` sin importarla. Bajo Bun esto lanzaba `ReferenceError` *después* de que el renderer activara alt-screen y mouse reporting, por lo que el renderer nunca se destruía y la terminal quedaba inundada de secuencias ANSI (iTerm2: "mouse reporting was left on").
- `src/tui/dashboard.ts`: importa `VERSION`; el ciclo del renderer va dentro de `try/finally` que siempre llama `renderer.destroy()` y restaura los modos de terminal (`?1000/1002/1003/1006` mouse, `?1004` focus, `?2004` bracketed paste, `?1049` alt-screen, `?25h` cursor).
- `src/tui/wizard.ts`: misma red de seguridad `restoreTerminal()` en todas las salidas, incluido el path de excepción.
- `src/commands/init.ts`: la versión del manifest se toma de `VERSION` en vez de un literal hardcodeado.

### Tests
- Nuevo test de regresión: cualquier módulo TUI que use `VERSION` debe importarla (cubre el punto ciego de `@ts-nocheck`).
- `--version` y el manifest ahora se validan contra `package.json` (sin literal hardcodeado). 29 tests pasando.

---

## [2.0.1] — 2026-05-18

### Agregado
- `forge wiki` subcomando: `status`, `ingest`, `query`, `lint` (F1-F01)
- 45 tests nuevos: validador de project.yaml, migrador v1→v2, forge-generate-all, pre-bash-check
- Copyright headers en 7 scripts principales (Apache 2.0, SocialWeb 2026)
- `vscode-extension/forge-agent-framework-0.5.0.vsix` empaquetada y lista para instalar

### Total: 509 tests pasando

---

## [2.0.0] — 2026-05-18

### Agregado — Forge v2 Fase 3 (liberación pública)

#### Limpieza (F3-01)
- `LICENSE`: Apache 2.0, Copyright 2026 SocialWeb
- `docs/RELEASE-CHECKLIST.md`: checklist de liberación pública (seguridad, técnico, legal, operativo)
- Anonimización de referencias internas en `docs/plan/`: clientes reales → `Cliente-Media`, `Cliente-ONG`, etc.; proyectos internos → `proyecto-alpha`, `proyecto-beta`; `Bienes Nacionales` → `organismo-publico`

#### README y documentación (F3-02)
- README reescrito para público general: posicionamiento honesto, tabla comparativa vs cc-sdd/Bridle/wshobson, quick start de 4 pasos, sin referencias a clientes

#### Extensión VS Code (F3-04)
- Versión `0.2.1` → `0.5.0` (alineada con forge pre-milestone)
- 3 nuevos comandos: `forge: Generate All Runtimes`, `forge: Validate project.yaml`, `forge: Migrate project.yaml to v2`
- Handlers en `extension.ts` con confirmación para migración destructiva

#### Artículos (F3-05)
- `docs/content/linkedin-articles/`: 3 borradores listos para publicar
  - "Por qué los agentes de IA necesitan un harness, no solo prompts"
  - "Las cinco capas de un kit de desarrollo agéntico"
  - "Cómo usamos agentes para enseñar gestión de proyectos de software"

### Convenciones
- Versión `2.0.0` corresponde a Forge v2 completo (Fases 0–3)
- Milestone: `v2.0.0` — listo para publicación pública

---

## [0.5.0] — 2026-05-17

### Agregado — Forge v2 Fase 2 (multi-runtime)

#### OpenCode (F2-01/02/03/04)
- `adapters/opencode/commands/`: 6 comandos adaptados para ejecución serial (plan, work, review, ship, session-start, session-close)
- `/work` en OpenCode: modo serial equivalente a `--serial` de Claude Code (sin agent teams paralelos)
- `/review`: veredicto APPROVED/CHANGES_REQUESTED/BLOCKED; escribe `.opencode/review-status.json`
- `/ship`: usa `vercel deploy` vía CLI en vez de MCP tools
- `adapters/opencode/HOOKS.md`: tabla de equivalencia hook-por-hook; todos los guardrails se embeben en AGENTS.md
- `adapters/opencode/generate-agents-md.py`: agrega sección de comandos SDD y reglas de guardrail al AGENTS.md generado
- `docs/runtimes/opencode.md`: guía completa con diferencias vs Claude Code, agent teams serial, limitaciones

#### Codex CLI (F2-05/06/07/08)
- `adapters/codex/commands/`: 6 prompt templates para uso con Codex CLI autónomo
- `adapters/codex/hooks/codex.yaml.tpl`: template de configuración con hooks `onStart`/`onFinish`
- `adapters/codex/hooks/forge-codex-start.sh`: checks determinísticos de entorno al inicio de sesión
- `adapters/codex/hooks/forge-codex-finish.sh`: typecheck/lint post-sesión por tipo de archivo
- `scripts/setup-codex.sh`: instalación automática del entorno Codex en 7 pasos
- `adapters/codex/generate-codex-config.py`: agrega SDD workflow, production safety rules y branch guard al AGENTS.md
- `docs/runtimes/codex.md`: guía completa con tabla de diferencias, uso diario y consideraciones de seguridad

#### Kiro (F2-09)
- `adapters/kiro/generate-steering.py`: agrega flujo SDD en `structure.md`, genera `commands.md` y hook `pre-edit-branch-guard.json`
- `docs/runtimes/kiro.md`: tablas de equivalencia de conceptos, guía de uso, roadmap para soporte completo
- `docs/architecture/adr/ADR-002-kiro-support-level.md`: decisión formal de soporte en nivel "monitoring"

#### Capa de traducción (F2-10)
- `scripts/forge-generate-all.py`: punto de entrada unificado para generar configs de todos los runtimes activos
- Auto-detección por marcadores de filesystem (`.claude/`, `.opencode/`, `.kiro/`, `AGENTS.md`)
- Flags: `--runtime`, `--dry-run`, `--force`
- `templates/project.yaml.tpl`: nueva sección `runtimes.active` con los 4 runtimes soportados
- `core/schemas/project.schema.json`: validación de la nueva sección `runtimes`
- `docs/runtimes/README.md`: índice de runtimes con tabla de nivel de soporte

---

## [0.4.0] — 2026-05-17

### Agregado — Forge v2 Fase 1 (core commands + full stack)

#### Memory Layer (Capa 1)
- Templates `core/templates/claude-md/`: `global.md`, `project.md`, `architecture.rules` (separación 3 capas de CLAUDE.md)
- Template `core/templates/daily-note.md` con placeholders para `/session-close`
- Template `core/templates/spec-template.md` con secciones obligatorias (Problem, Non-goals, Acceptance, Compliance, Edge cases)
- `forge-init.py`: `_install_templates()` crea `docs/daily-notes/`, `docs/specs/_template.md`, `.claude/architecture.rules` automáticamente
- `generate-claude-md.py`: genera `.claude/architecture.rules` al crear CLAUDE.md si no existe
- Schema JSON Draft-07: `core/schemas/project.schema.json` para validar `project.yaml` v2
- Validador: `scripts/forge-validate-project-yaml.py` con flag `--json`, exit 1 en errores
- Migrador: `scripts/forge-migrate-project-yaml.py` de v1 → v2, soporta `--dry-run` y `--backup`
- Referencia completa: `docs/project-yaml-v2-reference.md` con tablas por sección

#### Knowledge Layer (Capa 2)
- Slash command `/plan` (3 modos): crear spec, listar specs, revisar con Planner-Critic
- Slash command `/work`: lee spec aprobada, propone team según mode, spawna teammates en paralelo
- Slash command `/review` (F1-B03): multi-agente en standard/enterprise; veredicto APPROVED/CHANGES_REQUESTED/BLOCKED; escribe `.claude/review-status.json` para `/ship`
- Slash command `/ship`: pipeline 10 pasos, polling max 1/min a Vercel, smoke tests, logs en tiempo real

#### Guardrail Layer (Capa 3)
- `core/hooks/hooks-registry.yaml`: declarativo por mode (universal/standard/enterprise) y stack
- `core/hooks/pre-bash-check.py`: bloquea comandos destructivos basado en incidente 2026-04-28
- `core/hooks/session-start.sh`: verificaciones determinísticas al inicio de sesión (tools, branch, env)
- `forge-init.py`: lee `hooks-registry.yaml` para instalar hooks según mode del proyecto
- Nuevas entradas en hooks-registry.yaml para stacks `nextjs-admin` (prisma-safety) y `laravel` (composer-check)

#### Delegation Layer (Capa 4)
- 7 agentes Tier 1 (`core/agents/`) actualizados con sección `## Forge v2` (spec-first, hooks awareness, scope rules)
- 7 perfiles Tier 2 actualizados a Forge v2: `hono-drizzle`, `nextjs-admin`, `laravel`, `fastapi`, `astro`, `expo`, `wordpress`
- `README.md` creado para cada perfil con agentes, cuándo usar, hooks específicos del stack, activación en `project.yaml`

#### Distribution Layer (Capa 5)
- `manifest.json`: inventario completo de agentes, perfiles, skills, comandos, hooks y schemas
- `docs/team-install.md`: guía de onboarding de 5 minutos para nuevos desarrolladores
- `scripts/team-install.sh`: script de instalación automática del equipo

---

## [0.3.0] — 2026-05-17

### Agregado — Forge v2 Fase 0 (session lifecycle + hooks)
- Slash commands de ciclo de sesión: `/session-start` (3 escenarios, detección automática de branch) y `/session-close` (pipeline de 8 pasos: commit, changeset, GitHub Projects, daily-note, RELEASE-NOTES, rebase + PR)
- Hook `pre-edit-check.py` (PreToolUse): branch guard en main, detección de debug statements multi-stack (TS/PHP/Python/Ruby), detección de credenciales hardcodeadas
- Hook `post-turn-check.sh` (Stop): typecheck automático sobre archivos modificados, auto-detección de package manager, soporte `scripts.check` en project.yaml
- `forge-init.py`: instala hooks en `.claude/hooks/` del proyecto (función `install_hooks()`)
- `forge-init.py`: `session-start.md` y `session-close.md` se instalan siempre (sin requerir skill activa)
- `settings.json` ahora incluye configuración de hooks (`PreToolUse`, `Stop`) además de `permissions.allow`
- Documentación del plan v2: `docs/plan/forge-v2-plan.md`, `docs/plan/forge-v2-implementation.md`
- Bitácora de fricción: `docs/feedback/friction-log.md` con template y formato estándar
- Guía de migración: `docs/migration/v1-to-v1.5.md`

### Convenciones
- Versión "Forge v1.5" del plan de arquitectura = `0.3.0` en semver

---

## [0.2.2] — 2026-05-05

### Agregado
- Picker TUI de dos paneles en audit: lista navegable (izquierda) + detalle del ítem (derecha)
- `forge-init.py`: genera CLAUDE.md automáticamente desde el adapter de claude-code
- `forge-init.py`: inyecta `scope:` en el frontmatter de cada agente desde `agent_paths` en project.yaml
- `forge-init.py`: genera `.claude/settings.json` con `permissions.allow` según el stack del proyecto
- Slash commands nuevos: `/new-feature`, `/deploy-check`, `/review` instalados automáticamente por forge-init
- CLI: opción "Regenerar CLAUDE.md — sin reinstalar agentes" en el submenú de init
- Extensión VS Code: comando `forge: Regenerate CLAUDE.md` con icono en el panel lateral
- `generate-claude-md.py`: tabla "Agentes y su scope" en el CLAUDE.md generado
- `generate-claude-md.py`: soporte a `--force` para bypass del prompt interactivo
- `project.yaml.tpl`: sección `agent_paths` con keys api, frontend, admin, mobile, scanner
- Extensión VS Code: `showOpportunitiesPicker()` multi-select QuickPick con `canPickMany: true`
- Extensión VS Code: context states `forge.installed` / `forge.active` vía `setContext`
- Extensión VS Code: `AuditOpportunity` interface para parseo estructurado del JSON de audit

### Cambiado
- Picker de oportunidades: reemplaza lista estática + prompt de texto por TUI de dos paneles
- CLI `menu_init()`: descripciones actualizadas mencionando settings.json y slash commands
- `ForgeActionsProvider`: incluye "Regenerate CLAUDE.md" en el panel de acciones
- Fallback a `_simple_opp_picker` en Windows, terminal <60 cols o modo no-TTY/CI

---

## [0.2.1] — 2026-05-04

### Agregado
- Profile `laravel`: agentes `api-engineer`, `fullstack-engineer`, `migration-specialist` con ruta completa L6→L13
- Profile `wordpress`: agentes `wp-engineer`, `divi-engineer`, `elementor-engineer` (FSE, Divi 5, Elementor Pro)
- `scripts/forge-add-opportunities.py`: aplica profiles/skills seleccionados a `project.yaml` vía CLI o VS Code
- Filtrado inteligente de oportunidades en audit por stack declarado (`_PROFILE_RELEVANCE`)
- Picker interactivo numerado en terminal para seleccionar y aplicar oportunidades
- Catálogos `_SKILL_INFO` y `_PROFILE_INFO` con descripción y trigger por item
- Agentes especialistas: `forge-init-specialist`, `forge-audit-specialist`, `forge-catalog-specialist`
- VS Code: `showOpportunitiesPicker()` con QuickPick multi-select
- VS Code: vistas `forgeActionsView`, `forgeProjectView`, `forgeAgentsView` con `viewsWelcome`
- VS Code: campo `publisher: "socialwebcl"` en `package.json`
- GitHub Actions: workflow `tests.yml` con matrix Python 3.9/3.11/3.12
- Campo `last_verified` en agentes de terceros (Divi, Elementor) con check de expiración en audit
- Sección de extensión VS Code en README y `docs/guide.md`

### Corregido
- Windows: `ModuleNotFoundError: No module named 'termios'` reemplazado por mensaje orientativo con exit limpio
- URL del submodule en README: `socialweb-cl` → `socialwebcl` (sin guión)
- Instrucciones de `git submodule update --init --recursive` para colaboradores nuevos
- Campo `summary` ausente en salida JSON de `forge-audit.py` (generaba falsa seguridad en CI)
- Flags `--forge` y `--only` declarados en docs pero no implementados en `forge-audit.py`
- 4 profiles sin documentar en `agent-standard.md` (django, go-gin, sveltekit, vuenuxt)
- `codex.md` con convención no verificada en spec de Codex CLI → eliminado, adapter simplificado
- Referencias a `aitmpl.com` en código activo → removidas
- Wizard: 4 brechas de UX para usuario nuevo (mensajes de error, terminología)
- `pbcopy`/`open` macOS-only → reemplazado por alternativas multiplataforma
- Extensión VS Code: sin documentación ni instrucciones de instalación → documentada con VSIX

### Cambiado
- Audit terminal: agentes OK colapsados en una línea por tier (reduce scroll)
- Oportunidades en audit: cards con descripción, agentes/trigger y selección numerada integrada
- Extensión VS Code: 624 → 1071 líneas (opportunity picker, estados gestionados)
- `forge-audit.py`: 557 → 855 líneas (filtrado, catálogos, UI)
- Tests: 358 → 464 casos (contratos JSON, platform compat, VS Code extension, profiles nuevos)
- Extensión VS Code: `0.1.2` → `0.2.1`

---

## [0.2.0] — 2026-05-03

### Agregado
- Profiles: `django`, `go-gin`, `sveltekit`, `vuenuxt`, `astro`
- Skills: `browser-test`, `wiki-ingest`, `wiki-query`, `wiki-lint`
- Adapter Codex CLI
- Extensión VS Code (inicial, sin publicar)
- Wizard interactivo TUI con 10 preguntas guiadas
- `forge-audit.py` con salida `--json` e integración CI
- Catálogo curado offline (20 MCP servers, 13 profiles, 5 frameworks)

---

## Convenciones de versioning

- **MAJOR** (`1.0.0`): breaking changes en `project.yaml`, estructura de agentes, o adapters
- **MINOR** (`0.X.0`): profiles nuevos, skills nuevos, features de CLI o extensión
- **PATCH** (`0.2.X`): bugfixes, documentación, mejoras de UX sin cambios de estructura
