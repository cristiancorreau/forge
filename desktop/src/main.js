'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { toArgs } = require('./args');

/**
 * Resolucion de la CLI de forge.
 *
 * Por default invoca `npx -y @cristiancorreau/forge`, lo que funciona sin
 * instalacion previa. Es configurable via la variable de entorno
 * FORGE_DESKTOP_CLI (p.ej. una ruta a un binario empaquetado o un `forge`
 * global), que se interpreta como linea de comando separada por espacios.
 *
 * @returns {{ command: string, baseArgs: string[] }}
 */
function resolveForgeCli() {
  const override = process.env.FORGE_DESKTOP_CLI;
  if (override && override.trim() !== '') {
    const parts = override.trim().split(/\s+/);
    return { command: parts[0], baseArgs: parts.slice(1) };
  }
  return { command: 'npx', baseArgs: ['-y', '@cristiancorreau/forge'] };
}

/**
 * Spawnea la CLI de forge con los args dados en `cwd` y captura su salida.
 *
 * @param {string[]} subArgs
 * @param {string} cwd
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
function runForge(subArgs, cwd) {
  return new Promise((resolve) => {
    const { command, baseArgs } = resolveForgeCli();
    const child = spawn(command, [...baseArgs, ...subArgs], {
      cwd: cwd || process.cwd(),
      shell: false,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      resolve({ exitCode: -1, stdout, stderr: stderr + String(err.message) });
    });
    child.on('close', (code) => {
      resolve({ exitCode: code == null ? -1 : code, stdout, stderr });
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'forge desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
}

// IPC: el renderer envia {action, payload}; el main arma los args con el
// modulo puro args.js y spawnea la CLI. Nunca se reimplementa logica de forge.
ipcMain.handle('forge:run', async (_event, message) => {
  const { action, payload } = message || {};
  let subArgs;
  try {
    subArgs = toArgs(action, payload);
  } catch (err) {
    return { ok: false, exitCode: -1, stdout: '', stderr: String(err.message), args: [] };
  }

  const cwd = (payload && payload.cwd) || process.cwd();
  const result = await runForge(subArgs, cwd);
  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    args: subArgs,
  };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { resolveForgeCli, runForge };
