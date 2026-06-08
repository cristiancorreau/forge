# SPEC-059 `forge panel` cockpit — de visor read-only a launcher de comandos

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-08 | Actualizada: 2026-06-08
> Diseño: equipo UI (3 lentes) + validación de ingeniería · Mockups: `docs/design/panel-v2-mockups/`

## Contexto

El TUI `forge panel` (OpenTUI, Bun; fallback `@clack` en Node) es hoy un **visor
read-only** de 6 secciones; la única acción real es instalar del catálogo. De los
**23 comandos** del CLI, **18 no tienen superficie** en el TUI. El usuario tiene
que salir al shell para casi todo (init, adopt, generate, recommend, eval, add,
migrate, update, validate, wiki, mcp, scaffold, teardown, session).

Objetivo: convertir el panel de **visor** en **cockpit** — un launcher que expone
los comandos con sus interacciones, manteniendo la arquitectura existente
(datos puros en `lib/panel-data.ts`, render en `tui/panel.ts`, paridad con el
fallback `@clack` que es la superficie testeable, SPEC-033).

## Decisión

Seis piezas, ordenadas por la validación de ingeniería (ver §Fases). Los mockups
de referencia están en `docs/design/panel-v2-mockups/` (home, palette, runner,
list-actions, help).

### 1. Máquina de modos + KEYMAP único (la base)
Reemplazar el `keypress` handler ad-hoc (flags `typingSkills/typingCatalog/
inCatalogList`) por una **state machine** explícita:
`mode ∈ { NAV, FILTER, PALETTE, CONFIRM, LOG }`. **NAV es el reposo**; toda acción
vuelve a NAV. Un objeto `KEYMAP` declarativo es la fuente única que consumen (a)
el dispatcher, (b) el footer contextual, (c) el overlay de ayuda `?`. Aislar la
API privada `_internalKeyInput` en un módulo adaptador. Esto **arregla de raíz**
la clase de bug de foco ("el live-search robaba foco", `panel.ts:303`).

### 2. Command palette `:`
Overlay (Box `position:absolute`) con Input + Select (mismos widgets del catálogo)
que corre cualquier comando por nombre con fuzzy match. El modo `PALETTE` **apaga
el foco del fondo** (sin eso, fuga de foco — OpenTUI no tiene modal real). Ejecuta
en el log pane (§5). Comandos que son otro TUI (init, migrate) **salen del panel**
(`renderer.destroy()` + exit), nunca se embeben (conflicto alt-screen).

### 3. Home contextual
7ª sección, default. Deriva `getProjectState(root)` de señales que ya se computan
(`cfg.found` + audit + doctor) + `detectBrownfield(root)` (único dato nuevo):
`empty → init`, `brownfield → adopt`, `configured → recommend`, `healthy → audit/
recommend`, `needs-attention → doctor`. Render-then-hydrate (audit/doctor diferidos
para no penalizar el startup). Muestra siguiente-acción + acciones rápidas + pulse.

### 4. Runner / log pane
Modo `LOG`: split con el output del comando, **buffer-ventana** (últimas N líneas;
repintado O(n)). Estado **honesto**: "ejecutando…" estático (el data layer es
síncrono → no hay spinner animado real sin workers) → `✓/✗`. Comandos que escriben
FS (generate/update/migrate/adopt/add) corren **dry-run primero** y muestran el
plan; solo aplican tras revisión (`[Enter] aplicar`). Usa `ScrollBoxRenderable`.

### 5. Filtro inline `/` + acciones inline
`/` abre filtro en modo `FILTER` (no roba foco, porque es un modo explícito).
Acciones por tecla sobre el ítem: `i` install (ya existe), `e` eval, `u` uninstall
(modo `CONFIRM`). Multi-select (`Space`) es v2 (OpenTUI no tiene multi-select).

### 6. Footer contextual + overlay de ayuda `?`
El footer cambia por modo/sección; `?` abre el cheatsheet. Ambos leen el KEYMAP.

### Taxonomía comando → interacción (resumen)
- **In-panel / puro** (capa pura ya existe): audit, doctor, validate, recommend, eval, skills, catalog.
- **Runner dry-run→apply** (escribe FS): generate, update, migrate, adopt, add, scaffold, teardown.
- **Salir y delegar** (otro TUI / proceso): init, migrate, session-start/close, mcp (read-only).

## Fases (cada una = PR con su issue; ver Epic)

- **PR0** — esta spec (APPROVED).
- **PR1** — modos + KEYMAP + footer contextual + overlay `?` (sin features; el panel se ve igual). *Desbloquea todo.*
- **PR2** — `panel-data`: `uninstallItem/enableSkill/disableSkill/installHook` + tests, expuestos también en el fallback `@clack`. *Paridad y cobertura.*
- **PR3** — runner / log pane in-process (comandos puros, estado honesto).
- **PR4** — command palette `:` recortado (puros + delega TUIs saliendo).
- **PR5** — filtro `/` + acción `i` (no destructiva).
- **PR6** — Home contextual (render-then-hydrate).
- **v2 (backlog)** — nav 2-niveles + breadcrumb, dry-run→apply para los que escriben FS, acciones destructivas con CONFIRM, multi-select, zen header.

## Riesgos (de la validación) y mitigación
- **Spinner mentiroso**: data layer síncrono bloquea el render → v1 usa estado estático, no spinner animado.
- **Modal sin foco**: OpenTUI no atrapa foco → el modo PALETTE/CONFIRM debe `.blur()` el fondo.
- **Log O(n)**: buffer-ventana desde el día 1, no salida ilimitada.
- **Paridad @clack**: toda acción nueva vive en `panel-data.ts` (testeable) y el fallback la expone.
- **i18n drift en/es**: test que falla si una clave existe en un idioma y no en el otro.
- **Startup latency del Home**: render-then-hydrate.
- **API privada `_internalKeyInput`**: aislada en un adaptador.

## Criterios de aceptación (de la épica)
- [ ] PR1: máquina de modos + KEYMAP; footer y `?` leen el mismo mapa; panel se ve igual; build+test verdes (incl. Windows). Test guardián de que el dispatcher no usa flags ad-hoc.
- [ ] PR2: 4 funciones nuevas en panel-data puras + testeadas; el `@clack` las expone; test de paridad i18n en/es.
- [ ] PR3: runner corre comandos puros, muestra output con buffer-ventana, estado ✓/✗.
- [ ] PR4: palette fuzzy corre los comandos puros; init/migrate salen y delegan; modo PALETTE apaga el fondo.
- [ ] PR5: filtro `/` funciona sin robar foco; acción `i` instala.
- [ ] PR6: Home detecta estado y sugiere acción; no agrega latencia perceptible al startup.

## Decisiones OpenTUI
- `ScrollBoxRenderable` para el log pane (existe, no se usaba). `TabSelect` NO en v1 (churn).
- El palette/confirm como Box absolute es seguro **solo** si el modo apaga el foco del fondo.

## Impacto de compliance
No aplica. Read-only por default; las acciones que escriben pasan por el camino reversible (installItem/manifest) o por dry-run→apply. Sin red ni telemetría.

## Notas
Mockups de referencia (ember theme, banner ASCII real): `docs/design/panel-v2-mockups/{1-home,2-palette,3-runner,4-list-actions,5-help}.png`.
