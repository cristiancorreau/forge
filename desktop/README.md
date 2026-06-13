# forge desktop

App de escritorio (Electron) de configuracion para forge. Es una **GUI fina**:
toda la logica vive en la CLI de forge, que la app invoca por `spawn`. La app
**no reimplementa** la generacion de config.

Implementa SPEC-071. Es un esfuerzo separado del webview de la extension
(SPEC-070), pero reusa el **mismo contrato conceptual** accion -> args y el
**mismo motor** (la CLI de forge).

## Vistas (MVP)

1. **Proyecto nuevo** — `forge init --from <archivo>`, con *Previsualizar*
   (`--dry-run`) antes de aplicar.
2. **Adoptar** — `forge adopt --yes` sobre el repositorio actual, con
   *Previsualizar* (`--dry-run`).
3. **Diagnostico** — `forge doctor` y `forge audit --json`.

## Arquitectura

```
desktop/
├── src/
│   ├── args.js      ← modulo PURO toArgs(action, payload) — testeable en Node
│   ├── main.js      ← proceso principal Electron: BrowserWindow + ipcMain + spawn
│   └── preload.js   ← contextBridge: expone forge.runAction(action, payload)
├── renderer/
│   ├── index.html   ← 3 vistas
│   ├── style.css
│   └── renderer.js  ← vanilla, sin acceso a Node
└── test/
    └── args.test.mjs ← node --test, corre SIN Electron
```

El mapeo accion -> args vive solo en `src/args.js` y se testea de forma aislada.

## Como correr

```bash
cd desktop
npm install
npm start        # electron .
```

## Resolucion de la CLI de forge

Por default la app ejecuta `npx -y @cristiancorreau/forge`, lo que funciona sin
instalacion previa. Es configurable con la variable de entorno
`FORGE_DESKTOP_CLI` (linea de comando separada por espacios), por ejemplo:

```bash
FORGE_DESKTOP_CLI="forge" npm start
# o apuntando a un binario empaquetado:
FORGE_DESKTOP_CLI="/ruta/al/forge" npm start
```

## Tests

```bash
cd desktop
npm test         # node --test test/ — NO requiere Electron ni display
```

El test cubre el contrato accion -> args (`args.test.mjs`), con el mismo criterio
que el del webview.

## Empaquetado

```bash
cd desktop
npm install
npm run dist     # electron-builder
```

## Deuda explicita (fuera del MVP)

- **Firma de binarios**: el MVP NO firma los artefactos (sin notarizacion en
  macOS, sin Authenticode en Windows). Los binarios generados no se distribuyen
  firmados.
- **Pipeline CI cross-compile**: no hay workflow de CI para compilar y publicar
  los instaladores multiplataforma. El empaquetado es manual por ahora.
