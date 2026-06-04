# SPEC-036 Paridad de UI en Windows: relanzamiento robusto bajo Bun + fallback Node enriquecido

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

La UI interactiva de forge tiene dos caminos:

1. Un panel full-screen **OpenTUI** que requiere el runtime **Bun** (forge se
   relanza a sí mismo bajo Bun para renderizarlo).
2. Un fallback **@clack/prompts** sobre Node cuando Bun no está disponible.

SPEC-035 dejó las superficies estáticas (banner/boxes) funcionando cross-platform
(Unicode + fallback `FORGE_ASCII`). Pero la experiencia interactiva sigue
divergiendo según la plataforma:

- **Windows/PowerShell** casi nunca relanza bajo Bun. La lógica de relanzamiento
  estaba duplicada en `init.ts` y `panel.ts`, no era testeable de forma aislada, y
  no contemplaba que en una consola legacy de Windows el render OpenTUI puede salir
  roto (mojibake / control sequences no soportadas). El usuario veía el fallback
  Node siempre.
- El **fallback Node** (@clack wizard + menú de panel) era funcional pero pobre:
  sin banner, sin intro/outro claros, sin caja de resumen. La experiencia "sin Bun"
  se sentía de segunda categoría y no era uniforme con el resto de la CLI.

Si no lo arreglamos, los usuarios de Windows (y cualquiera sin Bun) tienen una
experiencia inferior e inconsistente.

## Decisión

### Parte 1 — Relanzamiento bajo Bun robusto y testeable (`lib/bun.ts`)

Se factoriza la decisión + el spawn en helpers puros y testeables, usados por
`init.ts` y `panel.ts` (se elimina la lógica duplicada):

- `shouldRelaunchUnderBun({ platform, bunPath, env, isTTY, alreadyBun })` →
  decisión booleana pura. Reglas:
  - `false` si ya corremos bajo Bun (`alreadyBun`), si `FORGE_BUN_RELAUNCH=1`
    (ya relanzado), si `FORGE_NO_BUN=1`, si no hay TTY, o si no hay `bunPath`.
  - `FORGE_FORCE_BUN=1` fuerza el relanzamiento (salta el gate de terminal en
    Windows) siempre que haya `bunPath` y TTY.
  - En `win32`, sólo auto-relanza a OpenTUI si se detecta una terminal capaz:
    `WT_SESSION` (Windows Terminal) o `TERM_PROGRAM`. Si no, prefiere el fallback
    Node (ahora mejorado) para evitar un render OpenTUI roto en consolas legacy.
  - En macOS/Linux mantiene el comportamiento actual: relanza si hay Bun + TTY.
- `relaunchUnderBun(bunPath, cliEntry, argv, env?)` → spawnea el `bun(.exe)`
  resuelto (ruta absoluta) con `[cliEntry, ...argv]`, `stdio: 'inherit'`, setea
  el guard `FORGE_BUN_RELAUNCH=1` y devuelve el exit code del hijo para propagarlo.
- `cliEntry` se obtiene vía `resolveCliEntry` (`fileURLToPath`, no `URL.pathname`,
  válido en Windows).
- `bunFallbackHint({ env, isTTY, alreadyBun })` → texto del hint amistoso ("Tip:
  instalá Bun para el panel completo — https://bun.sh") o `null`. Sólo se muestra
  una vez, sólo en TTY, no si ya corremos bajo Bun.

### Parte 2 — Fallback Node enriquecido (uniforme, bueno sin Bun)

- `lib/wizard.ts` (wizard @clack de `forge init`): banner FORGE + intro clara,
  pasos agrupados/etiquetados, caja de resumen ordenada antes de confirmar y outro
  limpio. **Mismas preguntas y salidas** — el `project.yaml` + install resultante
  son idénticos, sólo mejora la presentación.
- `panel.ts` fallback Node: banner/header en el menú y secciones (Config / Monitor
  / Skills / Hooks / Templates + Catálogo) consistentes y legibles usando los
  helpers `box()`/`header()`/`ascii`. El snapshot no-interactivo (sin TTY) sigue
  funcionando sin crashear.
- Se respeta `FORGE_ASCII` en las superficies estáticas.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Relanzar siempre bajo Bun en Windows | Paridad OpenTUI máxima | Render roto en consolas legacy (conhost/PS5) | Gate por terminal capaz + `FORGE_FORCE_BUN` como escape |
| Reescribir el panel OpenTUI para que funcione sin Bun | Un solo camino | OpenTUI depende de Bun; reescritura enorme | Fuera de alcance; el fallback Node mejorado alcanza |
| Dejar la lógica de relanzamiento duplicada | Cero refactor | No testeable, drift entre init/panel | Helper compartido testeable |

## Criterios de aceptación

- [x] `shouldRelaunchUnderBun` devuelve `true` en `darwin` + bun + TTY.
- [x] `false` cuando `FORGE_NO_BUN=1`, sin TTY, sin bun, o ya bajo Bun/relanzado.
- [x] En `win32`: `true` con `WT_SESSION` (o `TERM_PROGRAM`) + bun + TTY; `false`
      sin terminal capaz; `true` con `FORGE_FORCE_BUN=1`; `false` con `FORGE_NO_BUN=1`.
- [x] `relaunchUnderBun` setea `FORGE_BUN_RELAUNCH=1` y propaga el exit code.
- [x] `bunFallbackHint` devuelve el texto sólo en TTY, no bajo Bun, no si gateado.
- [x] El wizard @clack muestra banner + pasos agrupados + caja de resumen, con
      `project.yaml`/install idénticos al previo.
- [x] El menú de `forge panel` (Node) y el snapshot no-interactivo siguen
      funcionando y respetan `FORGE_ASCII`.
- [x] macOS por defecto sigue relanzando a OpenTUI con Bun presente; el hint NO
      aparece cuando se usa OpenTUI.
- [x] `npm run build:all && npm test` verde (incluye windows-compat + panel).

## Impacto de compliance

No aplica.

## Dependencias

- Construye sobre SPEC-035 (resolver de Bun cross-platform + render ASCII-safe).

## Notas de implementación

- El render OpenTUI interactivo en una ventana real de PowerShell NO pudo
  verificarse end-to-end desde macOS. El verificador real es el job
  `windows-latest` del CI, que corre el suite Node (cubre la lógica de
  relanzamiento, rutas, hooks y el snapshot no-interactivo) pero NO el render TUI
  interactivo.
