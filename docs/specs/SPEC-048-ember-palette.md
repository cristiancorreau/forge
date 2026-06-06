# SPEC-048 Paleta ember del CLI (matchear el landing)

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-06 | Actualizada: 2026-06-06

## Contexto

El CLI usaba un acento cyan (`#00e5ff`) sobre fondo `#0d1117`, distinto del look
ember-sobre-negro del landing y del banner `FORGE`. Se unifica la identidad: el
terminal debe parecerse al landing.

## Decisión

- Nuevo `src/ui/theme.ts` con la paleta ember compartida (`THEME`) + el gradiente
  por fila del banner (`BANNER_GRADIENT` / `bannerRowColor`). Acento ember
  `#ff8a1c`, brillo `#ffb454`, verde `#56d364`, fondo `#0a0a0b`, muted `#8b949e`.
- Los 3 TUI (`tui/wizard.ts`, `tui/dashboard.ts`, `tui/panel.ts`) reemplazan su
  paleta inline por `const C = THEME` (la key `cyan` se conserva por compatibilidad
  pero ahora vale ember), y colorean el banner con el gradiente por fila.
- `ui/header.ts` (header estático con chalk): banner con gradiente ember, borde y
  acentos ember.
- `ui/colors.ts` (salida ANSI de los comandos): agrega truecolor `ember`/`amber`
  y remapea el acento `cyan` a ember en un solo lugar → todos los comandos quedan
  ember.

## No-objetivos
- No se reescriben los mensajes ni la estructura del TUI; solo colores.
- Se respeta `NO_COLOR` / no-TTY (sin cambios en el gating).

## Criterios de aceptación
- [ ] El banner del header emite el gradiente ember en sus 6 filas (sin el cyan viejo).
- [ ] Acentos/borde del header y del TUI en ember; verde de éxito y muted como el landing.
- [ ] `tsc` + `npm test` verdes (299).

## Impacto de compliance
No aplica.
