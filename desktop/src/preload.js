'use strict';

const { contextBridge, ipcRenderer } = require('electron');

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
});
