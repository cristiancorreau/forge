# Changelog

Todos los cambios notables de forge se documentan en este archivo.

Formato: [Keep a Changelog](https://keepachangelog.com/es/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/lang/es/)

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
