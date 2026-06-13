# SPEC-071 App de escritorio (Electron) de configuración — esfuerzo separado

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

Además del webview de la extensión (SPEC-070), se quiere una **app de escritorio
independiente** para usuarios que no tienen ni quieren VS Code. Es un esfuerzo
**separado** y más pesado (segunda codebase, empaquetado de binarios), por lo que
arranca como un MVP scaffold que reusa el **mismo contrato IPC** y el **mismo
motor CLI** (spawn) que el webview — sin reimplementar lógica.

## Decisión

1. **Nuevo paquete `desktop/`** (Electron) en el monorepo, aislado de la CLI y la
   extensión. Main process + renderer con formularios.
2. **Reusar el contrato acción→args** (mismo diseño que `ipc.ts` de la extensión):
   el main process hace `spawn` de la CLI de forge (resuelta vía `npx`/global/
   binario empaquetado) con los args que produce un `toArgs()` compartido en concepto.
3. **MVP**: ventana con (a) "Proyecto nuevo" (init via `--from`), (b) "Adoptar"
   (adopt), (c) diagnóstico (doctor/audit). Preview `--dry-run` antes de aplicar.
4. **Distribución**: documentar el empaquetado (electron-builder) como tarea, sin
   pipeline CI de firma aún (queda como deuda explícita; no se publica firmado en el MVP).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Tauri en vez de Electron | Binario chico | Toolchain Rust; menos familiar | Electron es más directo para el MVP; revisable |
| No hacer app standalone | Menos mantenimiento | Excluye a quien no usa VS Code | El usuario lo pidió explícitamente |

## Criterios de aceptación

- [ ] `desktop/` arranca una ventana Electron con los 3 flujos (init/adopt/diagnóstico).
- [ ] La app **spawnea la misma CLI** (no reimplementa generación de config).
- [ ] El mapeo acción→args es testeable en Node (puro), igual que el del webview.
- [ ] Documentado el empaquetado y la deuda de firma/CI.

## Impacto de compliance

Ninguno. La app corre local y solo invoca la CLI sobre el repo del usuario.
