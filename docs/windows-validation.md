# Validación manual del render OpenTUI en Windows

> Estado: pendiente de ejecución por un humano en Windows real (issue #74).
> El CI `windows-latest` cubre la suite no-interactiva; el render TUI con TTY+Bun
> **no** se puede automatizar desde macOS/CI. Este documento es el checklist que
> debe seguir alguien con una máquina Windows.

## Qué se valida

Los paneles interactivos OpenTUI corren bajo **Bun** y nunca se probaron
visualmente en una ventana real de Windows:

- `forge init` → wizard OpenTUI (se relanza bajo Bun) + dashboard post-install.
- `forge panel` → navegación + secciones.
- Fallback ASCII (`FORGE_ASCII=1`) y fallback a Node cuando Bun no aplica.

## Requisitos

- Windows 10/11.
- **Windows Terminal** (recomendado) y, para el caso legacy, **conhost / PowerShell 5**.
- **Bun ≥ 1.3** instalado (`irm bun.sh/install.ps1 | iex`). OpenTUI requiere Bun.
- **Node ≥ 20** (para el fallback).
- forge instalado: `npm i -g @cristiancorreau/forge` (o `npx @cristiancorreau/forge`).

## Comportamiento esperado (referencia de implementación)

- En `win32`, forge solo se **auto-relanza bajo Bun** cuando la consola es
  "capaz": Windows Terminal (`WT_SESSION`) o un host con `TERM_PROGRAM` (terminal
  integrada de VS Code). En conhost/PowerShell 5 legacy (que no setean ninguno)
  **prefiere el fallback Node** para no romper el render alt-screen.
  (`packages/cli/src/lib/bun.ts` → `shouldRelaunchUnderBun` / `win32TerminalIsCapable`).
- `FORGE_FORCE_BUN=1` fuerza el relanzamiento bajo Bun saltando el gate de terminal.
- `FORGE_NO_BUN=1` desactiva el relanzamiento (siempre fallback Node).
- `FORGE_ASCII=1` fuerza bordes/íconos ASCII; `FORGE_ASCII=0` fuerza Unicode.
  (`packages/cli/src/ui/ascii.ts`).
- `FORGE_NO_DASHBOARD=1` salta el dashboard post-install.

## Checklist

Marcá cada caso y adjuntá una captura. Para cada uno anotá: terminal, versión de
Bun (`bun --version`), versión de Node (`node --version`), versión de forge
(`forge --version`).

### A. Windows Terminal + Bun (camino feliz)

Abrí **Windows Terminal**. En un directorio vacío de prueba:

- [ ] `forge init`
  - [ ] El wizard se relanza bajo Bun y renderiza el panel OpenTUI a pantalla completa.
  - [ ] Banner FORGE legible; cajas/bordes Unicode bien dibujados (sin caracteres rotos).
  - [ ] Navegación con flechas + Enter funciona; el ítem seleccionado se resalta.
  - [ ] Colores correctos (no códigos de escape crudos como `\x1b[...`).
  - [ ] Al terminar, la terminal vuelve a su estado normal (sin alt-screen pegado, cursor visible).
- [ ] Dashboard post-install
  - [ ] Aparece tras la instalación; navegación entre secciones (proyecto, agentes, SDD, skills, runtimes) ok.
  - [ ] Al salir, el resumen estático persiste en el scrollback.
- [ ] `forge panel`
  - [ ] Abre el panel; navegación + secciones (config, monitor, skills, hooks, templates) ok.
  - [ ] Salir restaura la terminal correctamente.

### B. conhost legacy / PowerShell 5

Abrí **conhost** (consola clásica de Windows, no Windows Terminal):

- [ ] `forge init`
  - [ ] **No** intenta el render OpenTUI roto: cae al **fallback Node** (`@clack/prompts`).
  - [ ] Se muestra el tip "instalá Bun para el panel completo" (si Bun no aplica).
  - [ ] El wizard de fallback es usable y completa la instalación.
- [ ] `FORGE_FORCE_BUN=1 forge init` (forzando Bun en conhost)
  - [ ] Documentá cómo se ve: ¿render aceptable o glitches? (esperable: peor que en WT).

### C. Fallback ASCII

En Windows Terminal:

- [ ] `set FORGE_ASCII=1` (cmd) o `$env:FORGE_ASCII=1` (PowerShell), luego `forge init` / `forge panel`
  - [ ] Bordes e íconos en ASCII (`+ - |` en vez de cajas Unicode); todo legible.
  - [ ] Útil como workaround si en alguna consola los caracteres Unicode se rompen.

### D. Fallback Node explícito

- [ ] `set FORGE_NO_BUN=1` + `forge init`
  - [ ] Usa siempre el wizard Node, sin intentar Bun. Instalación correcta.

## Cómo reportar

1. Completá los checkboxes en una copia de este doc o directamente en el issue #74.
2. Adjuntá **capturas** de A (Windows Terminal feliz), B (conhost) y C (ASCII).
3. Pegá las versiones (`bun`, `node`, `forge`) y el `$env:WT_SESSION` / `TERM_PROGRAM`
   de cada terminal probada.
4. Si hay glitches (caracteres rotos, alt-screen pegado, colores mal), abrí un
   issue de fix puntual enlazando #74 con la captura y los pasos para reproducir.

> Hasta que un humano ejecute este checklist en Windows real y adjunte capturas,
> el issue #74 permanece **abierto**.
