'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The app's own version. With sandbox:true the preload CANNOT require()
// arbitrary files (only 'electron'), so main.js passes it via
// webPreferences.additionalArguments and we read it from process.argv.
let appVersion = '';
const versionFlag = process.argv.find((a) => a.startsWith('--forge-desktop-version='));
if (versionFlag) appVersion = versionFlag.slice('--forge-desktop-version='.length);

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

  /** Carpeta de trabajo inicial (cwd del proceso, o home si es la raiz). */
  defaultDir() {
    return ipcRenderer.invoke('forge:defaultDir');
  },

  /** Selector nativo de carpeta. @returns {Promise<{ok:boolean, dir:string}>} */
  pickDir(current) {
    return ipcRenderer.invoke('forge:pickDir', { current });
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
