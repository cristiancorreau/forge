'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The app's own version, read once at preload time (Node access is available
// here but not in the renderer). Exposed so the UI badge never drifts.
let appVersion = '';
try { appVersion = require('../package.json').version; } catch { /* ignore */ }

/**
 * API segura expuesta al renderer via contextBridge.
 *
 * El renderer NO tiene acceso a Node ni a child_process; solo puede pedir
 * acciones acotadas que el main process valida (toArgs) y ejecuta (spawn).
 */
contextBridge.exposeInMainWorld('forge', {
  /**
   * @param {string} action  'init' | 'adopt' | 'audit' | 'doctor' | 'generate'
   * @param {object} [payload]
   * @returns {Promise<{ok:boolean, exitCode:number, stdout:string, stderr:string, args:string[]}>}
   */
  runAction(action, payload) {
    return ipcRenderer.invoke('forge:run', { action, payload });
  },

  /**
   * Serializa el objeto de respuestas del wizard a un archivo JSON temporal
   * (en el main process) y devuelve su ruta. El renderer luego la usa como
   * `--from` para `init`.
   *
   * @param {object} answers  WizardResult armado en el renderer
   * @returns {Promise<{ok:boolean, file:string, error?:string}>}
   */
  writeAnswers(answers) {
    return ipcRenderer.invoke('forge:writeAnswers', answers);
  },

  /** Editores instalados + disponibilidad de cada runtime CLI. */
  detectTools() {
    return ipcRenderer.invoke('forge:detect');
  },

  /** Abrir la carpeta del proyecto en un editor instalado. */
  openEditor(editorId, dir) {
    return ipcRenderer.invoke('forge:openEditor', { editorId, dir });
  },

  /** Abrir una terminal en el proyecto con el runtime configurado. */
  openTerminal(runtime, dir) {
    return ipcRenderer.invoke('forge:openTerminal', { runtime, dir });
  },

  /** The desktop app version (from its package.json). */
  appVersion,
});
