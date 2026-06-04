# SPEC-035 Compatibilidad Windows / PowerShell para la CLI y los panels

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

La CLI de forge — y en especial los panels interactivos (wizard de `forge init`,
dashboard post-install y `forge panel`) — funcionan bien en macOS/Linux pero se
ven y se comportan mal en Windows / PowerShell:

1. **Bun no se detecta.** Los panels OpenTUI sólo renderizan bajo Bun. La lógica
   de relanzamiento (`tryReLaunchWithBun`) sólo busca rutas POSIX
   (`~/.bun`, `/opt/homebrew`, `which bun`). En Windows Bun vive en
   `%USERPROFILE%\.bun\bin\bun.exe` y se descubre con `where`, no `which`. Sin
   detección, Windows nunca relanza bajo Bun y cae al fallback siempre.
2. **Box-drawing roto.** La UI usa glifos Unicode (`│ ┌ └ ─ ┐ ┘`) en `ui/box.ts`,
   `banner.ts`, `header.ts` y el snapshot estático de `panel.ts`. Las consolas
   legacy de Windows (conhost, PowerShell 5, code page no-UTF8) las renderizan
   como mojibake.
3. **Rutas y line endings POSIX-only.** `new URL(...).pathname` devuelve
   `/C:/...` en Windows (ruta inválida para `spawn`). Hay asunciones de `'/'` y
   splits por `\n`.
4. **Hooks `.sh`.** `settings.json` registra `bash .claude/hooks/post-turn-check.sh`
   y `session-start.sh`; bash no está disponible en PowerShell por defecto.
5. **Sin verificación real en Windows.** El CI sólo corre en ubuntu.

## Decisión

### A. Resolver de Bun cross-platform (`lib/bun.ts`)

Un módulo compartido usado por `init.ts` y `panel.ts`:

- `findBun(platform?, env?)` — en `win32`: candidato
  `process.env.USERPROFILE\.bun\bin\bun.exe` + probe con `where bun`. En POSIX:
  comportamiento actual (`which`/`bun`/`~/.bun`/homebrew). Respeta `FORGE_NO_BUN=1`.
- `bunRelaunchEnabled(...)` — encapsula los gates (no-Bun, TTY, `FORGE_NO_BUN`).
- `resolveCliEntry(metaUrl)` — usa `fileURLToPath` (no `.pathname`) para que la
  ruta del entrypoint sea válida en Windows.

### B. Render ASCII-safe + color robusto (`ui/ascii.ts`)

- `useAscii(platform?, env?)` — `true` si `FORGE_ASCII=1`, o si es `win32` sin
  terminal moderna (sin `WT_SESSION`). `FORGE_ASCII=0` fuerza Unicode.
- `BORDERS` — charset que conmuta entre Unicode (`│ ┌ └ ─ ┐ ┘`) y ASCII (`| + + -`).
- Aplicado en `ui/box.ts`, `banner.ts`, `header.ts` y `panel.ts`
  `printStaticSnapshot` (boxen `borderStyle` pasa a `'classic'` en modo ASCII; el
  banner cae a un texto ASCII `=== FORGE ===`).
- Color: se delega en chalk (respeta `NO_COLOR`/`FORCE_COLOR`, detecta soporte;
  Node habilita VT en Win10+). No se deshabilita color en Windows.

### C. Rutas + line endings

- `resolveCliEntry` con `fileURLToPath`.
- Auditar `'/'` hardcodeado y splits por `\n`; normalizar a `path.join`/`path.sep`
  y splits tolerantes a `\r\n` donde sea relevante.

### D. Hooks cross-platform

- `post-turn-check` y `session-start` se reescriben como `.js` (Node, sin
  dependencia de Python para parsear YAML) y `settings.json` los registra con
  `node .claude/hooks/post-turn-check.js`. Funciona en PowerShell, macOS y Linux
  por igual. Los `.sh` se mantienen en el bundle como referencia para usuarios
  que prefieran bash, pero el comando instalado es `node`.

### E. CI en Windows

- Se agrega `windows-latest` a la matriz de `.github/workflows/tests.yml`
  (manteniendo ubuntu). setup-bun + setup-node, `bun install --frozen-lockfile`,
  `bun run build:all && bun run test`.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Mantener `.sh` + emitir `.ps1`/`.cmd` y elegir por plataforma | Conserva bash | Duplica lógica en 3 lenguajes; YAML parsing en PS es frágil | Un único `.js` es más simple y ya hay runtime Node garantizado |
| Forzar UTF-8 + chcp 65001 desde la CLI | No cambia glifos | No persiste, afecta la consola del usuario, no cubre conhost viejo | ASCII fallback es determinístico y no muta el entorno |
| Deshabilitar color en Windows | Simple | Pierde color en terminales modernas (Win Terminal) | chalk ya detecta soporte |

## Criterios de aceptación

- [x] `findBun('win32', { USERPROFILE: 'C:\\Users\\x' })` devuelve el candidato
      `C:\Users\x\.bun\bin\bun.exe`.
- [x] `useAscii()` honra `FORGE_ASCII=1` (true) y `FORGE_ASCII=0` (false) y
      devuelve true en `win32` sin `WT_SESSION`.
- [x] `box()` emite bordes ASCII (`+ - |`) cuando el modo ASCII está activo y
      Unicode cuando no.
- [x] `settings.json` registra los hooks vía `node` (post-turn-check.js).
- [x] macOS por defecto sigue usando Unicode; `FORGE_ASCII=1 forge panel` (piped)
      usa ASCII.
- [x] El CI corre en `windows-latest` además de ubuntu.
- [x] `npm run build:all && npm test` verde localmente.

## Impacto de compliance

No aplica.

## Dependencias

- Ninguna spec previa bloquea esta.

## Notas de implementación

- El render OpenTUI interactivo en una ventana real de PowerShell NO pudo
  verificarse desde macOS. El verificador real es el job `windows-latest` del CI
  (corre el suite de tests Node, que cubre la lógica de plataforma, rutas, hooks
  y el snapshot no-interactivo; NO cubre el render TUI interactivo).
