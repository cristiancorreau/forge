# SPEC-057 Panel UX: category filters, badges, catalog detail view

> Estado: IMPLEMENTED
> Responsable: forge-cli-engineer
> Creada: 2026-06-07 | Actualizada: 2026-06-07

## Contexto

El panel (`forge panel`) muestra skills y catálogo sin filtro por categoría ni indicadores
visuales claros del estado de cada ítem. El resultado es una lista plana difícil de
navegar cuando el catálogo crece (hoy 19 skills + N items de catálogo). Tres mejoras
incrementales (sin reescritura a Ink, solo sobre la base `@clack/prompts` + `panel-data.ts`
existente) solucionan esto:

1. **Filtro por categoría en Skills**: permite acotar la lista antes de buscar por texto.
2. **Badges `[active]` y categoría en filas de Skills**: contexto visual en cada fila.
3. **Tipo con color y línea de detalle en Catálogo**: diferenciar skill/profile/template/mcp
   y mostrar la descripción completa del ítem elegido antes de confirmar la instalación.

## Decisión

### panel-data.ts
- Agregar `getSkillCategories(root): string[]` — retorna las categorías únicas de `SKILLS`
  ordenadas alfabéticamente. No depende de `root` pero lo acepta para consistencia futura.
- Ampliar `searchSkills(query, root, category?)` — tercer parámetro opcional; cuando se
  pasa, filtra adicionalmente por `s.category === category`. Retrocompatible: `undefined`
  conserva comportamiento actual (sin filtro de categoría).
- `SkillRow` ya hereda `category` de `SkillInfo`; ya tiene `active`. No hay cambio de tipo.

### commands/panel.ts (@clack fallback — modo testeable)
- `skillsSearchSection`: pre-filtro con `p.select` por categoría (opciones de
  `getSkillCategories` + "Todas"); luego `p.text` de búsqueda. Pasa `category` a
  `searchSkills`.
- `printSkillRows`: cada fila muestra badge `[active]` (verde) cuando la skill está
  activa, y la categoría entre corchetes (gris) antes del purpose.
- `printCatalogRows`: el tipo del ítem con color (`cyan`=skill, `yellow`=profile,
  `green`=template, `gray`=mcp-server/otros).
- `catalogSearchInstallSection`: antes del `p.confirm` de instalación, imprime la
  descripción completa del ítem elegido en un bloque resaltado (1 línea de detalle).
- Snapshot no-TTY (`printStaticSnapshot`): sigue funcional, sin cambios de comportamiento.

### tui/panel.ts (OpenTUI)
- `rowsSkills` / `renderSkillsSection`: badge `[active]` en verde y categoría en la fila
  de cada skill. Sin live search (ya removido; no reactivar).
- Catálogo: descripción completa en `description` del `SelectRenderable` (ya usa
  `it.description.slice(0, 60)` — ampliar a 80 chars o descripción completa sin truncar
  si cabe).
- No se agrega filtro de categoría en el TUI OpenTUI (sería live input; riesgo alto).

### Tests
- `getSkillCategories` retorna un array de strings no vacío con `'Wiki'`, `'Sesión'`, etc.
- `searchSkills('', dir, 'Wiki')` retorna solo skills de categoría Wiki.
- `searchSkills('wiki', dir, 'Sesión')` retorna vacío (texto match ≠ categoría match).
- `SkillRow` expone `category` (string) y `active` (boolean).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Reescritura a Ink | mejor DX interactivo | alto riesgo, dependencia nueva | fuera de scope (instrucción explícita) |
| Filtro categoría en TUI OpenTUI | paridad | requiere InputRenderable extra, riesgo navegación | bajo riesgo preferido; se hace en @clack solamente |
| Truncar descripción catálogo en Select hint | ya existe | pierde info en el confirm | se agrega la línea completa ANTES del p.confirm |

## Criterios de aceptación

- [x] `getSkillCategories(root)` exportado desde `panel-data.ts`, retorna categorías únicas ordenadas.
- [x] `searchSkills(q, root, category)` con `category` definido restringe por categoría exacta.
- [x] `searchSkills(q, root)` sin `category` mantiene comportamiento previo.
- [x] `printSkillRows` muestra badge `[active]` (verde) en filas activas.
- [x] `skillsSearchSection` ofrece pre-filtro de categoría antes de la búsqueda libre.
- [x] `printCatalogRows` muestra el tipo con color diferenciado.
- [x] `catalogSearchInstallSection` imprime la descripción completa del ítem antes del confirm.
- [x] `printStaticSnapshot` (no-TTY) sigue funcionando; tests existentes pasan sin cambios.
- [x] Tests nuevos en `panel.test.mjs` cubren `getSkillCategories` y `searchSkills` con categoría.

## Impacto de compliance

No aplica.

## Dependencias

- `panel-data.ts` (SPEC-033) — base de datos; no cambia la interfaz pública, solo extiende.
- `catalog-install.ts` (SPEC-034) — sin cambios.
- Tests existentes en `panel.test.mjs` — deben seguir pasando.

## Notas de implementación

- `getSkillCategories` deriva las categorías del array estático `SKILLS` en `catalog.ts`,
  por lo que no requiere I/O y es puro salvo el parámetro `root` decorativo.
- El badge `[active]` usa `green(icons.ok)` existente del theme para no introducir nuevos
  colores no aprobados.
- La línea de detalle en el catálogo usa `p.note` de `@clack/prompts` para mostrar el
  ítem elegido en un bloque visualmente separado antes del `p.confirm`.
