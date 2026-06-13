# Changelog

Todos los cambios notables de forge se documentan en este archivo.

Formato: [Keep a Changelog](https://keepachangelog.com/es/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/lang/es/)

---

## [3.10.0] — 2026-06-13

### Agregado
- **`forge init --from <answers.json>` (SPEC-069)** — modo **no-interactivo** de `init`: lee un archivo de respuestas (un `WizardResult`), salta el wizard y produce el mismo `project.yaml` + `.claude/*` que el flujo interactivo. Habilita un modo de configuración **GUI** (webview de la extensión VS Code y app Electron) para usuarios que no usan la consola, y `init` en CI. `lib/init-answers.ts` aplica defaults tolerantes (slug, mode, runtime) y deriva los profiles de los frameworks vía un mapeo compartido en `lib/wizard-flow.ts`. Funciona con `--dry-run` para previsualizar.

### Specs
- Plan del modo GUI no-consola: SPEC-070 (webview VS Code), SPEC-071 (app Electron, esfuerzo separado) y SPEC-072 (tests de paridad GUI↔CLI). Implementación en PRs aparte.

---

## [3.9.1] — 2026-06-13

> Tier `next`/`later` del análisis vs Open GSD (`docs/analysis/forge-vs-gsd-2026-06.md`).

### Agregado
- **Guard de consistencia de gestor de paquetes (SPEC-066)** — `pre-bash-check.js` ahora advierte (sin bloquear) cuando un comando que afecta el lockfile (`install/add/ci/update`) usa un gestor distinto al declarado en `stack.package_manager`. Misma clase de fallo que el sentinel de imagen de Open GSD, adaptada a lo que forge sí conoce.
- **Ecosistema GSD en el catálogo (SPEC-067)** — `gsd-browser` (mcp-server) y `gsd-test-runner` (tool) entran al catálogo unificado como integraciones externas curadas; `forge recommend` sugiere `gsd-browser` ante frontend + testing E2E (Playwright). forge integra el ecosistema en vez de reconstruirlo.
- **Hook PreCompact de re-anclaje (SPEC-068)** — `precompact-headroom.js`: justo antes de que el runtime compacte el contexto, recuerda releer `.forge/state/STATE.md` (SPEC-062) para no perder el panorama. Registrado solo en runtimes que exponen el evento (claude-code).

### Cambiado
- Mensajes de `pre-bash-check.js` neutralizados a español latino (sin voseo).

---

## [3.9.0] — 2026-06-13

> Cierra los gaps prioritarios del análisis vs Open GSD (`docs/analysis/forge-vs-gsd-2026-06.md`), implementados en paralelo por 4 equipos. Adaptaciones a la arquitectura de forge (compilador, determinístico, offline), sin copiar.

### Agregado
- **Artefacto `.forge/state/` (SPEC-062)** — `forge generate`/`init`/`adopt` emiten `STATE.md`, `PLAN.md` y `CONTEXT.md` desde `project.yaml` + las specs, como punto de re-anclaje de contexto determinístico (regenerable, en el manifest SHA-256 para drift en `audit`). El hook `session-start` inyecta un resumen de `STATE.md`. Ataca el "context rot" por la vía de un compilador, sin ser orquestador.
- **Registro declarativo de capacidades (SPEC-063)** — `core/registry/units.yaml` mapea cada agente/skill a `{scope, tools, outputs, phase}`; `forge audit` valida presencia de archivo, que los `tools` del frontmatter estén dentro del contrato, y parity registro↔disco (estilo Unit Registry, verificado en compile/audit time).
- **`forge spec-probe` (SPEC-064)** — gate de SALIDA determinístico que puntúa la completitud verificable de una spec (criterios como checklist, alternativas resueltas, estado único), reusando la maquinaria pura de `forge eval`. `--json`. Extiende el gate de entrada del SDD hacia un gate de salida offline.

### Cambiado
- **Wizard confiable en Windows (SPEC-065)** — `@clack/prompts` pasa a ser el wizard por defecto en todas las plataformas; OpenTUI queda **opt-in** vía `FORGE_ENABLE_OPENTUI=1`. Sin esa variable, `forge init` ya no intenta el relaunch bajo Bun (elimina el descuadre y la fragilidad en Windows PowerShell, #74).

---

## [3.8.9] — 2026-06-13

### Cambiado
- **Español latino neutro** en el contenido reciente — se eliminó el voseo (corré→ejecuta, pegá→pega, anclá→ancla, verificá→verifica, etc.) en el skill `/onboard`, las secciones de resiliencia de `forge-skill-creator`/`forge-skill-improver` y el mensaje de `forge analyze`. Sin cambios funcionales.

---

## [3.8.8] — 2026-06-13

### Agregado
- **`forge analyze` + skill `/onboard` (SPEC-061)** — flujo para entender y documentar un repo **ya existente** (complementa `forge adopt`, que instala forge en proyectos creados).
  - **`forge analyze [path] [--json] [--write]`**: análisis determinístico y offline del código (`lib/code-analysis.ts`) — stack, lenguajes, hotspots (directorios y archivos más grandes), marcadores `TODO/FIXME/HACK/XXX`, presencia de tests y los agentes sugeridos por el stack. `--write` guarda `docs/analysis/<fecha>-analysis.md`. Sin LLM ni red: base reproducible.
  - **Skill `/onboard`**: orquesta a los agentes especializados (`docs-writer`, `security-auditor`, ingenieros del stack) para **leer el código** y generar `docs/architecture.md`, `docs/onboarding.md` y `docs/security-review.md`, alimentando el wiki. Anclado en la salida de `forge analyze`. Incluye las secciones de resiliencia (SPEC-060) y pasa su gate (91/A).
- `forge eval --help` ahora documenta las 8 categorías (incluye `resilience`).

---

## [3.8.7] — 2026-06-13

### Agregado
- **Resiliencia de skills (SPEC-060)** — `forge eval` suma una 8ª categoría, `resilience`, que recompensa el patrón anti-racionalización + gates de verificación: la tabla `## Excusas comunes` (Excusa|Realidad), la sección `## Señales de alerta` y el `## Verificación` con checklist + evidencia obligatoria ("'parece bien' nunca alcanza"). El `overallScore` ahora promedia 8 categorías y el two-gate (SPEC-054) exige el patrón en skills `installable`. Los meta-skills `forge-skill-creator` y `forge-skill-improver` lo incorporan (dogfooding) y enseñan a emitirlo. Patrón inspirado en [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) (MIT), reimplementado en español como scorer determinístico — sin copiar contenido del repo original.

---

## [3.8.6] — 2026-06-12

### Corregido
- **Agentes huérfanos al reconfigurar el stack** — `forge init` instalaba los agentes del profile elegido pero **nunca eliminaba** los del profile anterior. Al reconfigurar un proyecto (p. ej. cambiar de `laravel` a `express`+`nextjs` y reinstalar), los agentes del profile viejo quedaban pegados en `.claude/agents/` — por eso aparecían agentes de Laravel (`api-engineer`, `fullstack-engineer`, `laravel-specialist`, `laravel-test-engineer`, `migration-specialist`) en proyectos que no son Laravel. Ahora `installCoreAgents()` **poda** los agentes del bundle de forge que la configuración actual ya no selecciona, preservando los agentes Tier-3 registrados en `agents.specialized` y cualquier agente hecho a mano. Aplica a `forge init` y `forge adopt`. Test guardián del escenario reconfigurar→podar.

---

## [3.8.5] — 2026-06-08

### Corregido
- **Recuadros desalineados con contenido de color** — `ui/box.ts` calculaba el ancho y el padding con `.length`, que cuenta los códigos de color ANSI (invisibles). Como cada línea traía distinta cantidad de color, el borde derecho se corría y la decoración "se descuadraba" (visible en `forge wiki status` y `forge skills`, sobre todo en Windows PowerShell). Ahora se mide el **ancho visible** (sin ANSI) para el ancho y el relleno. Afecta a los 12 comandos que usan recuadros (skills, wiki, doctor, audit, recommend, migrate, scaffold, adopt, teardown, session, aitmpl-search, panel). Test guardián que verifica que todas las líneas del recuadro tienen el mismo ancho visible.

---

## [3.8.4] — 2026-06-08

> Tercer sprint del cockpit (SPEC-059) — completa el rediseño v1 de `forge panel`.

### Agregado
- **Filtro `/` + acción inline `i`** (SPEC-059 PR5) — en Skills/Catálogo/Hooks, `/` filtra la lista en vivo (modo FILTER explícito, sin robar foco) e `i` instala el ítem seleccionado.
- **Home contextual** (SPEC-059 PR6) — sección Inicio (por defecto) que detecta el estado del proyecto (`getProjectState`/`detectBrownfield`, puras y testeadas) y destaca la **siguiente acción sugerida** (empty→init, brownfield→adopt, configured→recommend, healthy→audit, needs-attention→doctor) + acciones rápidas + pulse. Render-then-hydrate (sin latencia en el arranque).

Con esto el panel pasó de **visor read-only** a **cockpit**: Home contextual, command palette `:`, runner/log, filtro y acciones, todo sobre una máquina de modos + KEYMAP único. Backlog v2 (nav 2-niveles, dry-run→apply, multi-select, destructivas) en #146.

---

## [3.8.3] — 2026-06-08

> Segundo sprint del cockpit (SPEC-059): correr comandos desde el panel.

### Agregado
- **Command palette `:`** (SPEC-059 PR4) — desde `forge panel`, la tecla `:` abre un buscador fuzzy para correr cualquier comando por nombre (`rcm` → recommend). Los comandos puros (audit/doctor/validate/recommend/eval) corren in-panel; los interactivos (init/migrate/session) salen del panel y delegan (evita el conflicto de alt-screen). El modo PALETTE apaga el foco del fondo.
- **Runner / log pane** (SPEC-059 PR3) — los comandos corren in-process y muestran su salida en un pane con buffer-ventana (acotado) y estado `✓ done` / `✗`.
- Lógica en un módulo puro testeable `lib/panel-commands.ts` (`COMMANDS`, `fuzzyMatch`, `logBuffer`, `runPanelCommand`) con 38 tests.

---

## [3.8.2] — 2026-06-08

> Primer sprint del rediseño del panel a "cockpit" (SPEC-059, Epic #147).

### Agregado
- **`forge panel` — máquina de modos + KEYMAP único** (SPEC-059 PR1) — el manejo de teclas del TUI pasa a una state machine explícita (`NAV/FILTER/PALETTE/CONFIRM/LOG`) con un KEYMAP declarativo que es la fuente única del dispatcher, el footer contextual y el nuevo overlay de ayuda `?`. Elimina los flags ad-hoc de foco (raíz del bug del live-search). El panel se comporta igual; los modos PALETTE/CONFIRM/LOG quedan listos para los próximos sprints.
- **Acciones de la capa de datos del panel** (SPEC-059 PR2) — `uninstallItem`, `enableSkill`/`disableSkill`, `installHook` (puras, idempotentes, YAML-safe), expuestas también en el fallback `@clack`. Test de paridad i18n en/es para prevenir drift.

---

## [3.8.1] — 2026-06-08

### Corregido
- **`forge panel` mostraba `[object Object]`** en el nav, los títulos de sección y las filas del catálogo (OpenTUI, runtime Bun). Dos causas: (1) el template tag `t` de `@opentui/core` y la función i18n `t()` compartían nombre, así que `t('panel.sec.config')` devolvía un `StyledText` en vez del texto traducido (ahora el tag de OpenTUI se importa como `otText`); (2) las opciones del catálogo interpolaban fragmentos estilizados `fg()` en el `name` del `SelectRenderable`, que debe ser texto plano. Se agregó un test guardián (`tui-panel-guard.test.mjs`) que bloquea ambas regresiones. El wizard y el dashboard no estaban afectados (no usan i18n inline).

---

## [3.8.0] — 2026-06-08

### Corregido
- **Wizard/dashboard decían "4 runtimes"** — el texto de bienvenida de `forge init` (TUI OpenTUI y fallback `@clack`) y el dashboard post-install tenían el conteo de runtimes hardcodeado en "4". Ahora se deriva de `runtimeIds()` (registry), así que muestra el total real (**19**) y no se vuelve a desactualizar al agregar runtimes. La versión ya era dinámica (`VERSION`).

---

## [3.7.0] — 2026-06-08

> Meta-skills de autoría destiladas de asm: crear y mejorar skills guiado por `forge eval`.

### Agregado
- **`forge-skill-creator`** y **`forge-skill-improver`** (SPEC-058) — dos skills nuevas (categoría Desarrollo, instalables vía catálogo) que cierran el ciclo de autoría sobre `forge eval`: `forge-skill-creator` guía la creación de un `SKILL.md` desde cero e itera hasta pasar el gate de calidad; `forge-skill-improver` lleva un `SKILL.md` existente al estándar corrigiendo la categoría más débil por vuelta (con `forge eval --fix` para los arreglos mecánicos reversibles). Delegan en el scorer existente (cero scoring nuevo) y **pasan su propio gate** (dogfooding verificado por test: grade A).

---

## [3.6.0] — 2026-06-08

> Paridad de runtimes con asm: de 15 a **19 runtimes**, y documentación + landing alineadas.

### Agregado
- **4 runtimes nuevos** (SPEC-056) — `antigravity` (Google Antigravity), `openclaw`, `pi` y `hermes`, cada uno generando su archivo de reglas en `.<runtime>/rules/forge.md`. Forge pasa a soportar **19 runtimes** (4 nativos + 15 rules-based), igualando la cobertura de asm.

### Corregido
- **Desincronización del schema de runtimes** — el enum de `runtimes.active` en `core/schemas/project.schema.json` había quedado en los 4 runtimes nativos pese a que el registry ya tenía 15; `forge validate` rechazaba runtimes válidos. Ahora el enum lista los 19 y un test (`project.schema.json runtime enum matches runtimeIds()`) previene que vuelva a desincronizarse.

### Cambiado
- **Documentación y landing** — README (ES/EN), `docs/runtimes/` (ES/EN), descripciones de `manifest.json` / `package.json` y la landing actualizadas para reflejar los 19 runtimes (antes decían 4).

---

## [3.5.0] — 2026-06-07

> Mejoras destiladas del análisis de [luongnv89/asm](https://github.com/luongnv89/asm) (agent-skill-manager), alineadas con la tesis del board (compile+maintain, un motor, WHY anclado, read-only, cero telemetría, catálogo curado): scorer de calidad `forge eval`, two-gate en `add`, registry de runtimes (4→15), bundle exportable en `recommend` y mejoras de `panel`.

### Agregado
- **`forge eval`** (SPEC-053) — scorer de calidad **determinístico** de un `SKILL.md` (sin LLM, offline): 7 categorías (structure, description, prompt-engineering, context-efficiency, safety, testability, naming), `overallScore` 0–100 y grade A–F, con notas accionables por categoría. `forge eval <path|owner/repo> [--json] [--fix]`; `--fix` aplica solo arreglos mecánicos reversibles (`.bak`), nunca toca prosa. Motor en `lib/skill-eval.ts`.
- **Two-gate en `forge add`** (SPEC-054) — el gate de seguridad existente (`skill-security.ts`) se combina con un piso de calidad (`overall >= 75` AND `min(categoría) >= 6`): si la calidad cae bajo el piso, advierte y pide confirmación (`--force` override); el bloqueo duro sigue siendo solo seguridad/formato.
- **Registry de runtimes + 11 runtimes nuevos** (SPEC-056) — `lib/generators/registry.ts` reemplaza el `if/else` duplicado en init/generate/adopt por un descriptor central. Forge pasa de 4 a **15 runtimes**: nativos (claude-code, opencode, codex, kiro) + rules-based (cursor, windsurf, copilot, gemini, zed, cline, aider, continue, roo, amp, augment), cada uno generando su archivo de reglas en la ruta convencional (`.cursor/rules/forge.md`, `.github/copilot-instructions.md`, `GEMINI.md`, `CONVENTIONS.md`, …).
- **Bundle exportable en `forge recommend`** (SPEC-055) — `--intent "<texto>"`, `--interactive` (flujo guiado), `--export <file>` (escribe un `RecommendBundle` JSON con `why` anclado en la señal) y `--apply <file>` (instala solo los `installable:true` vía `installItem`, lista los manuales). Reusa el motor existente; nunca inventa items; cero telemetría.

### Cambiado
- **`forge panel`** (SPEC-057) — filtro por categoría en Skills, badge `[active]`, tipos de catálogo coloreados, badge `[installed]` y vista de detalle (descripción completa) antes de instalar. Mejoras incrementales sobre @clack/OpenTUI, sin reescritura.

---

## [3.4.0] — 2026-06-06

> El wedge "compile, don't recommend": advisor `forge recommend` sobre un catálogo unificado, marcador North Star y endurecimiento de `forge migrate`.

### Agregado
- **`forge recommend`** (SPEC-051) — advisor read-only stack-aware: analiza el stack detectado (`detect.ts`) y recomienda los mejores items del catálogo para ESTE proyecto, con un **WHY anclado en la señal de detección** (django→profile django, postgres→MCP postgres, CI→claude-code-action). Read-only por defecto; `--apply` instala los instalables vía `installItem` (idempotente) y muestra el comando manual para los MCP no instalables, nunca `--apply` sobre lo que no puede instalar. `--category`, `--top N`, `--json`. Un solo motor (`lib/recommend.ts`) en 3 superficies.
- **Catálogo unificado** (SPEC-050) — una sola fuente de verdad (`lib/catalog-unified.ts`) con un modelo `CatalogItem` y flag `installable`, y **un solo motor de búsqueda** (`scoreCatalog`). Fusiona el catálogo instalable (skills/profiles/templates) con el curado (frameworks/MCP servers/tools/resources). Los profiles de forge se representan una vez, instalables, enriquecidos con la metadata curada. `forge aitmpl-search` ahora busca el catálogo completo.
- **Marcador North Star** (#109) — forge estampa `# generated-by: forge vX.Y.Z` como primera línea de todo `project.yaml` que genera (comentario YAML, idempotente). Permite medir adopción **sin telemetría** vía GitHub code search. Ver `docs/north-star.md`.

### Cambiado
- **`forge migrate`** (#108) — el backup es ahora el **default** (`project.yaml.bak`; `--no-backup` para optar a no); `schema_version` se escribe como **campo YAML real** (machine-readable), no como comentario. `detectVersion()` lo lee primero.

---

## [3.3.1] — 2026-06-06

### Cambiado
- **README por defecto en inglés.** `README.md` (la portada que ven GitHub y npm) pasa a inglés; la versión en español vive en `README.es.md`, accesible desde el selector de idioma. Links a docs intactos por idioma (EN → `docs/en/*`, ES → `docs/*`). Sin cambios de código.

---

## [3.3.0] — 2026-06-06

> Multi-idioma (ES/EN) en el CLI + documentación y README bilingües (SPEC-049).

### Agregado
- **i18n del CLI (español / inglés)** (SPEC-049) — nuevo `lib/i18n.ts` con `resolveLang()` (precedencia `--lang <es|en>` > `FORGE_LANG` > locale del sistema `es*`→es > `en` por defecto), `t(key, vars)` con interpolación `{var}` y catálogo `MESSAGES` con paridad de claves ES/EN verificada por test. Superficies traducidas: el `--help` completo, el tagline del header y el chrome del panel (título, secciones de navegación y footer).
- **Flag `--lang` y variable `FORGE_LANG`** — `forge --lang es` fuerza español, `forge --lang en` inglés; sin flag, se infiere del locale. El idioma se propaga vía `FORGE_LANG` para que el relaunch del TUI bajo Bun lo herede.
- **Documentación bilingüe** — `README.en.md` + `docs/en/*` (guide, skills, tiers, wiki, runtimes/*) traducidos al inglés, con selector de idioma en cada par ES/EN.

### Cambiado
- El `--help`, el header y el panel dejan de tener strings hardcodeados y leen de `t()`, habilitando la migración incremental del resto de la salida de comandos a i18n.

---

## [3.2.1] — 2026-06-06

### Corregido
- **Panel (`forge panel`): se quitó el buscador en vivo de la sección Skills.** El input de búsqueda robaba el foco y rompía la navegación; la sección ahora lista todos los skills sin input. El buscador de la sección Catálogo (para instalar) no cambia.

---

## [3.2.0] — 2026-06-06

> Ecosistema Laravel 13 + dos features nuevas (registro abierto y servidor MCP), refuerzo de seguridad, resiliencia de versiones e identidad visual ember.

### Agregado
- **`forge add <owner/repo[@ref]>`** (SPEC-045) — instala skills desde una fuente externa detrás de una pipeline de seguridad en capas (higiene Unicode, scan de riesgo offline por severidad, degradación en banda, capability-scoping). La red es **opt-in y vive solo en este comando**; pin a sha inmutable + provenance en `.forge/externals.json`. Los guardrail hooks son el backstop en runtime.
- **`forge mcp`** (SPEC-047 / RFC-003) — servidor MCP **stdio-only, opt-in**, con 2 tools dinámicos read-only: `guardrail_status` (veredicto vivo de los hooks) y `wiki_search` (búsqueda confinada a `wiki/`). El SDK de MCP es lazy y **no es dependencia** (cold-start de `npx` intacto). Regla de oro: MCP es aditivo, nada del conocimiento vive solo ahí (enforced por test de allowlist).
- **Skills + agentes de Laravel 13** (SPEC-044) — 5 skills (`laravel-eloquent`, `laravel-pest`, `laravel-security`, `laravel-verify`, `laravel-mcp`) + 2 agentes Tier 2 (`laravel-specialist`, `laravel-test-engineer`).

### Cambiado
- **Paleta ember del CLI** (SPEC-048) — el terminal (banner, header y TUI wizard/dashboard/panel) ahora usa el acento ember `#ff8a1c` sobre near-black, unificado con el landing. Nuevo `ui/theme.ts` compartido + gradiente por fila del banner.

### Seguridad
- **Refuerzo de la capa Guardrail** (SPEC-046) — `pre-bash-check.js` bloquea **incondicionalmente** (no solo en prod) exfiltración de secretos (`.env`/`id_rsa`/`~/.ssh`/`~/.aws` por red), ofuscación (`base64 -d | sh`) y reverse shells, sin falsos positivos en instaladores `curl|sh`. `pre-edit-check.js` advierte sobre escalada de privilegios en `.claude/settings.json`.

### Resiliencia de versiones (RFC-002)
- El guard anti-staleness de `assets.test.mjs` era un no-op (solo cazaba el major con coma); ahora caza el major pelado de 12 frameworks y su scope cubre skills/commands. Se purgaron las 74 aserciones de versión mayor en assets forge-owned y se propagó la **directiva operativa de detección de versión a tiempo-de-uso** a los 24/25 profile agents (lee el manifiesto y contrasta contra el código instalado).

### Documentación
- **RFC-001/002/003** en `docs/proposals/` (qué tomar de Laravel 13/Boost, resiliencia de versiones, servidor MCP recortado). README: logo = banner FORGE en SVG + imágenes por URL absoluta (renderizan en GitHub y npm).

---

## [3.1.0] — 2026-06-05

> Cierre de los 5 follow-ups acumulados tras la migración a CLI TS (SPEC-043).

### Agregado
- **Comando `forge update [--dry-run] [--force]`** (#75). Re-sincroniza los archivos gestionados por forge (agentes, hooks, slash commands) con el catálogo bundleado **respetando tus ediciones locales**. Lee `.forge/manifest.json`, compara para cada archivo el hash en disco vs. el de instalación (¿lo editaste?) y vs. la fuente actual del catálogo: actualiza los no modificados, **preserva** los editados por el usuario (salvo `--force`), restaura los que falten y refresca el manifest. `--dry-run` imprime el plan sin escribir; es idempotente. Mapea `.claude/hooks/* → core/hooks/*`, `.claude/commands/* → adapters/claude-code/commands/*`, `.claude/agents/* → core/agents/*` (o el `agents/` de un profile); los archivos generados (CLAUDE.md, settings.json, architecture.rules) nunca se tocan.
- **Detección de debug para Java/Kotlin, Rust y Dart** en `core/hooks/pre-edit-check.js` (#72). Nuevos patrones: `System.out.print(ln)?` / `printStackTrace(` (Java/Kotlin), `println!` / `eprintln!` / `dbg!` (Rust), `debugPrint(` (Dart/Flutter). Se agregaron `.kt` y `.dart` a la lista de extensiones de código para que el hook los clasifique como tales.
- **Automatización de publicación de la extensión VS Code** (#73, References). `.github/workflows/publish-vscode.yml` (`workflow_dispatch` + tag `vscode-v*`) empaqueta y publica con `@vscode/vsce` usando el secret `VSCE_PAT`; documentado en `vscode-extension/README.md`. La primera publicación al Marketplace requiere que el maintainer cargue el PAT.
- **Checklist de validación en Windows** (#74, References). `docs/windows-validation.md` con los pasos para validar el render OpenTUI en Windows real (Bun + Windows Terminal, conhost legacy, fallback `FORGE_ASCII` y Node).

### Corregido
- **`forge validate` ya no rechaza profiles válidos por drift del enum** (#71). La validación de `agents.profiles` ahora se resuelve **dinámicamente** desde el directorio `profiles/` del forge root: acepta cualquier profile que exista como directorio y solo marca los inexistentes. Además se agregaron `laravel` y `wordpress` al enum de `core/schemas/project.schema.json` (que pasa a ser documentación de referencia, ya que la validación es dinámica).

---

## [3.0.1] — 2026-06-05

### Eliminado
- **Limpieza de restos de Python tras el sunset** (#78). Se removió `hooks/pre-commit` (git hook bash que invocaba el ya-inexistente `token-stats.py` y mencionaba `.agentic/`; se bundleaba) junto con su entrada en `manifest.json` (`hooks: []`) y se sacó `hooks/` del copiado de assets; y las copias `.py` de los hooks (`core/hooks/pre-bash-check.py`, `pre-edit-check.py`) — las versiones `.js` son las que se usan. Se actualizaron las referencias instructivas restantes al CLI legacy en docs y config. **El bundle publicado ya no contiene ningún archivo Python.** (Python como lenguaje de stack se mantiene.)

---

## [3.0.0] — 2026-06-05

> **Release mayor / breaking.** Sunset de la CLI Python legacy (Epic #76).

### Removido
- **CLI Python legacy eliminada (breaking).** Se removieron `forge.py`, los 11
  `scripts/*.py` (aitmpl-search, forge-add-opportunities, forge-audit,
  forge-generate-all, forge-init, forge-migrate-project-yaml, forge-scaffold-profile,
  forge-teardown, forge-validate-project-yaml, forge-wizard, token-stats), los 19
  `tests/*.py` (suite pytest legacy), `requirements.txt`, `scripts/team-install.sh`
  (helper del flujo legacy por submódulo) y el workflow CI `tests-legacy.yml`. La
  CLI es 100% TypeScript desde la v2.8.0 y `npx @cristiancorreau/forge` es ahora la
  **única** forma soportada de usar forge. La documentación (README, guía, runtimes,
  team-install, RELEASE-CHECKLIST y MIGRATION) se actualizó para quitar el flujo
  `python3 .agentic/...` y las notas de deprecación.

  **Migración:** quien todavía invoque `python3 .agentic/forge.py` o cualquier
  `scripts/*.py` debe migrar a `npx @cristiancorreau/forge` (ver
  [MIGRATION.md](MIGRATION.md) para el mapeo de comandos). No requiere submódulo,
  ni Python, ni `pip install`.

  **Se mantiene `Python` como lenguaje de stack:** los profiles FastAPI / Flask /
  Django y sus agentes Tier 2, la detección de `requirements.txt`/`pyproject.toml`
  y la allowlist `Bash(python3 *)` para proyectos Python siguen intactos. Lo
  removido es la *CLI* Python, no el soporte de Python como stack.

### Cambiado
- **Sync de versión en 4 fuentes** (ya no 5): `packages/cli/package.json`,
  `packages/cli/src/version.ts`, `manifest.json` y `.forge/manifest.json`
  (`forge.py` dejó de existir). `tests.yml` (Node 20/22 en ubuntu + windows-latest)
  es el único gate de tests.

---

## [2.19.0] — 2026-06-04

### Agregado
- **Profiles Tier 2 para Spring Boot, Flutter, Rust y Flask.** Agentes especializados por stack (siguiendo `docs/agent-standard.md`): `springboot` → `api-engineer` (Spring Boot 3 + Spring Data JPA + Maven/Gradle), `flutter` → `mobile-engineer` (Flutter 3 + Dart + Riverpod/Bloc + go_router), `rust` → `api-engineer` (Axum + Tokio + sqlx/SeaORM + cargo), `flask` → `api-engineer` (Flask 3 + blueprints + SQLAlchemy + pytest). Cableados en `PROFILE_MAP` (springboot/flutter/flask + axum/actix/rocket→rust), el `manifest.json`, el enum `agents.profiles` del schema y las docs. `forge adopt`/`forge init` activan el profile correcto al detectar/elegir estos frameworks.

---

## [2.18.0] — 2026-06-04

### Agregado
- **Más tecnologías reconocidas** en detección, wizard y generadores: **FastAPI** y **Flask** (Python), **Spring Boot** (Java/Kotlin), **Rust** web (Axum/Actix/Rocket), **Flutter** (Dart) y **React Native/Expo**. Se suman los lenguajes `java`, `kotlin`, `dart` y `rust`, y un nuevo tipo de proyecto **mobile**. `forge adopt`/`forge init` detectan estas stacks y generan el `project.yaml` + entity pages del wiki correspondientes (p. ej. "Spring Boot (Java)", "Flutter (Dart)", "Axum (Rust)", "React Native (TypeScript)"). Cambios de schema **aditivos** (enums de lenguaje/tipo + `stack.mobile`/`stack.mobile_language`), backward-compatible. (Todavía sin profiles Tier 2 dedicados para estas stacks — es un paso siguiente.)

---

## [2.17.0] — 2026-06-04

### Agregado
- **`forge adopt [path]` — onboarding de forge en un repo existente (brownfield).** Lee y analiza un codebase ya existente (sin LLM), genera el `project.yaml` desde lo que detecta (stack vía `detect.ts` con lenguaje por lado, `project.type`, ORM, testing, monorepo, docker), instala la config de forge reusando los installers de `forge init` (agentes por modo, hooks, slash commands, CLAUDE.md, settings.json, architecture.rules, manifest `.forge`) sin pisar archivos existentes salvo `--force`, y **auto-genera el wiki del proyecto** con HECHOS determinísticos: `concepts/arquitectura.md` y `concepts/stack.md` (del mapa de directorios + stack), `entities/` (proyecto + cada framework/herramienta detectada), `sources/` (resumen de README + manifest), `synthesis/overview.md` (resumen factual + nota "Pendiente: compilación semántica con /wiki-ingest") y `raw/` con copias inmutables del README + manifest. El wiki generado pasa `forge wiki lint` (sin links rotos ni huérfanos). La capa SEMÁNTICA (lógica de negocio, decisiones) sigue siendo trabajo del skill `/wiki-ingest`, que `adopt` apunta como próximo paso. Flags: `--yes` (no-interactivo por defecto), `--no-wiki`, `--runtime`, `--mode`, `--force`, `--dry-run`. Módulos puros y testeados: `lib/project-analysis.ts` y `lib/wiki-autogen.ts` (SPEC-038).

---

## [2.16.0] — 2026-06-04

### Agregado
- **El wizard pregunta el tipo de proyecto y el lenguaje/framework por lado.** `forge init` ahora pregunta primero si el proyecto es **solo Frontend · solo Backend · Fullstack**, y luego el **lenguaje y framework por separado** para cada lado (el listado de frameworks se filtra por el lenguaje), preguntando DB/ORM solo cuando hay backend. Esto permite stacks con lenguajes distintos (ej.: backend Python + frontend TypeScript). `project.yaml` suma `project.type` y `stack.backend_language`/`stack.frontend_language` (aditivo, backward-compatible); `project.language` se deriva (`mixed` cuando los lados difieren). Aplica a ambos wizards (OpenTUI + `@clack`) y a los generadores (CLAUDE.md/AGENTS.md muestran p. ej. "FastAPI (Python)" / "Next.js (TypeScript)").

---

## [2.15.0] — 2026-06-04

### Agregado
- **Paridad de UI en Windows / sin Bun.** Relanzamiento bajo Bun robusto y gateado mediante un helper compartido (`shouldRelaunchUnderBun`/`relaunchUnderBun`): en Windows solo auto-relanza al panel OpenTUI con una terminal capaz (Windows Terminal / `TERM_PROGRAM`); `FORGE_FORCE_BUN=1` fuerza y `FORGE_NO_BUN=1` desactiva; propaga el exit code y trae guard anti-reentrada. Cuando cae al fallback por falta de Bun, muestra un hint a https://bun.sh. Además, el **fallback de Node (`@clack`)** del wizard `forge init` y del `forge panel` quedó más rico (banner FORGE, pasos agrupados, caja de resumen) para una experiencia uniforme sin Bun.

---

## [2.14.0] — 2026-06-04

### Agregado
- **Compatibilidad con Windows / PowerShell.** Resolver de Bun cross-platform (detecta `%USERPROFILE%\.bun\bin\bun.exe` + `where bun`); fallback **ASCII** de cajas/banners (`FORGE_ASCII=1`, o auto en Windows sin Windows Terminal) para consolas legacy; los hooks `post-turn-check` y `session-start` reescritos como Node `.js` (sin bash ni Python); paths y line-endings cross-platform (`.gitattributes` con `eol=lf`); y **CI en `windows-latest`** (Node 20/22) sumado a la matriz. La suite (127 tests) pasa en Windows real.

---

## [2.13.0] — 2026-06-04

### Agregado
- **Buscador + instalador del catálogo en `forge panel`.** Nueva sección "Catálogo": busca skills, profiles y templates en una sola búsqueda (con flag "ya instalado") e **instala desde el panel** — skills (→ `project.yaml.skills` + slash command), profiles (→ `agents.profiles` + agentes en `.claude/agents/`), templates (wiki/spec/architecture). La edición de `project.yaml` es **quirúrgica** (preserva comentarios) e **idempotente**, y el resultado siempre pasa `forge validate`. Disponible en OpenTUI (Bun) y en el fallback de Node.

---

## [2.12.0] — 2026-06-04

### Agregado
- **`forge panel` — panel interactivo de configuración, monitoreo, skills, hooks y templates.** `forge` sin subcomando abre el panel cuando hay `project.yaml`. Cinco secciones: Configuración (resumen de `project.yaml`), Monitoreo (`audit` + `doctor`), Skills (catálogo con búsqueda), Hooks (instalados + registry), Templates. Full-screen OpenTUI en Bun, fallback de menú en Node y snapshot en no-TTY. `audit`/`doctor` ahora exponen funciones de datos reutilizables (`runAudit`/`runDoctor`).

### Cambiado
- **Extensión de VS Code migrada al CLI TypeScript** (v0.6.0). De `python3 scripts/*.py` + submódulo `.agentic/` → `npx @cristiancorreau/forge` (setting `forge.cliCommand`), detección por `project.yaml`, comandos alineados con el CLI actual. Se removió el `.vsix` 0.5.0 obsoleto del repo (los `.vsix` pasan a ser artefactos gitignored).

---

## [2.11.0] — 2026-06-04

### Agregado
- **`forge wiki init` + estructura de wiki templada por defecto.** `ensureWikiStructure` ahora copia las plantillas de `templates/wiki/` (index, log, y un `_template.md` por subdir) en vez de stubs mínimos; nuevo subcomando `forge wiki init [--force]` (idempotente); `forge init` scaffoldea el wiki cuando hay un skill `wiki-*` activo (no lo fuerza en otros proyectos). Se agregó la plantilla faltante `synthesis/_template.md`.
- **Tipo `integrations.obsidian`** (`vault_path`, `map`) en la interfaz `ProjectYaml`, alineado con el schema (`obsidian-sync` sigue siendo un skill, no un comando del CLI).

### Documentación
- README: sección **Instalación** con `npm` / `pnpm` / `bun` / `npx` y el comando global `forge`, con notas de PATH por gestor.
- `docs/wiki.md`: estructura del wiki, comandos del CLI con ejemplos, relación CLI↔skills `/wiki-*`, y prerequisitos de `obsidian-sync`.

### CI
- Nuevo smoke test de release que hace `npm install -g` y corre el comando `forge` pelado (el anterior usaba `node node_modules/.bin/forge`, que enmascaraba problemas de shebang/PATH).

---

## [2.10.1] — 2026-06-04

### Corregido
- **`forge init` preserva un `.claude/settings.json` existente** al regenerarlo: hace merge de `env` y de `permissions.allow` en vez de sobrescribir el archivo (antes perdía claves como `env`).
- **`.forge/manifest.json` rastrea los agentes Tier 3 (`agents.specialized`)** además de `active`/`compliance`, junto con los hooks y slash commands instalados (antes los omitía).
- **`CLAUDE.md` renderiza los agentes Tier 3 (`agents.specialized`)** en la tabla "Agentes y su scope"; un proyecto con equipo solo Tier 3 ya no queda sin tabla.
- El schema de `project.yaml` acepta `node-test` en `stack.testing`.

### Documentación
- README y docs sincronizados con v2.10.0 (14 skills, tabla de comandos completa, hooks ejecutables multi-runtime, runtimes actualizados).

### Interno
- Dogfooding: el repo de forge se auto-aplica (hooks, slash commands, `architecture.rules`, `settings.json` con la registry de hooks); `forge audit` queda en 0 warnings.

---

## [2.10.0] — 2026-06-04

### Agregado
- **Skills `session-start` / `session-close` centralizados** (#29). Definidos en `core/skills/`, registrados en el catálogo y expuestos por el CLI (`forge session-start` / `forge session-close`); los templates de Claude Code, OpenCode y Codex referencian el skill central en vez de duplicar la lógica.
- **Flujo de agentes Tier 3 (dominio)** (#31). El schema acepta `agents.specialized`; `forge scaffold --tier 3 --name <agente>` genera un agente Tier 3 conforme a `docs/agent-standard.md`; `forge validate` y `forge audit` verifican su existencia y el wizard de `forge init` los autodetecta.
- **Hooks de guardrail ejecutables en todos los runtimes** (#32). Kiro suma hooks JSON `pre-bash-check` y `post-turn-check` (además del branch-guard); OpenCode y Codex obtienen un `.githooks/pre-commit` POSIX compartido (sin Python) con branch-guard y detección de debug.
- **Barrera spec-first opt-in** (#28). Los hooks `pre-edit-check` exigen una spec `APPROVED` en `docs/specs/` (advierten por defecto; bloquean solo en `mode=enterprise`). Se agregan plantilla de PR, `CONTRIBUTING.md`, `docs/spec-gate-flow.md` y el workflow informativo `spec-gate.yml`.
- **Dogfooding: forge se auto-hostea** (#27). `project.yaml`, `CLAUDE.md`, `.forge/manifest.json` y scaffold de `docs/specs/` en la raíz, validados por el propio CLI.

### Cambiado
- **CI principal migrado a la suite Node del CLI** (#24). `tests.yml` corre los tests del paquete publicado (Node 20/22 + Bun) en cada push/PR a `main`; el pytest legacy se movió a `tests-legacy.yml` (manual).

### Corregido
- **`hooks-registry.yaml` apuntaba a hooks `.py` inexistentes** (#23). Ahora referencia solo los hooks `.js/.sh` que el CLI instala, restaurando el contrato "sin Python".
- **Versiones desincronizadas** (#25). `forge.py`, `manifest.json` y `packages/cli/package.json` quedan coherentes.

### Documentación
- README: `migrate`, `scaffold` y `teardown` marcados como disponibles (#26).
- Deprecación de la CLI legacy de Python con `MIGRATION.md` y sunset en v3.0.0 (#30).

---

## [2.9.13] — 2026-06-04

### Cambiado (UI)
- **Selects del wizard/dashboard: colores invertidos y más altos.** El item bajo el cursor ahora usa el fondo resaltado (`#1e3a5f`) con texto amarillo; las opciones no seleccionadas quedan sobre el fondo del panel (antes estaba al revés: el cursor se veía oscuro y el resto azul). Se agregó `itemSpacing: 1`, `showScrollIndicator` y mayor altura (`options × 3 + 1`, acotada a `BODY_H − 4`) para que cada opción tenga aire. Aplicado en `askSelect`, el welcome y el nav del dashboard. Verificado en PTY reconstruyendo el grid.

### Deprecado
- **`forge.py` y `scripts/*.py` (CLI legacy de Python).** La CLI es 100% TypeScript desde la v2.8.0; la implementación Python queda deprecada y será **removida en v3.0.0**. Usá `npx @cristiancorreau/forge` (Node/Bun, sin dependencias de Python) para todos los comandos. Timeline y guía de migración en [MIGRATION.md](MIGRATION.md).

---

## [2.9.12] — 2026-06-04

### Agregado
- **Banner ASCII de FORGE en los headers.** Nuevo módulo `src/ui/banner.ts` con el banner de 6 líneas, reutilizado en los tres headers: el estático (chalk/boxen del scrollback) y los de OpenTUI (wizard y dashboard). Los paneles OpenTUI crecieron a `HEADER_H = 9` para acomodar el banner + una línea (tagline/versión en el wizard; estado de instalación en el dashboard); el resto del layout se reposiciona solo. Verificado en PTY: banner alineado y navegación intacta.

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
