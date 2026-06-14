'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
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
  // Pin a floor that supports `init --from` (SPEC-069, forge >= 3.10.0). Without
  // a version spec, npx may serve a stale cached "latest" that ignores --from
  // and launches the interactive wizard, which then hangs on stdin.
  return { command: 'npx', baseArgs: ['-y', '@cristiancorreau/forge@^3.10.0'] };
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
      // stdin closed: the GUI only runs non-interactive commands. If a wrong/old
      // CLI ever launches an interactive wizard, it gets EOF and exits instead of
      // hanging the panel forever on "Ejecutando…".
      stdio: ['ignore', 'pipe', 'pipe'],
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
    title: 'Forge AI — Desktop',
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

// IPC: el renderer envia el WizardResult ya armado; el main lo serializa a un
// archivo JSON temporal y devuelve la ruta. El renderer luego corre
// `init --from <ruta>` reusando el canal forge:run. El renderer nunca toca el
// filesystem: todo pasa por este handler en el main process.
ipcMain.handle('forge:writeAnswers', async (_event, answers) => {
  try {
    const unique = crypto.randomBytes(8).toString('hex');
    const file = path.join(os.tmpdir(), `forge-answers-${unique}.json`);
    const json = JSON.stringify(answers ?? {}, null, 2);
    await fs.promises.writeFile(file, json, 'utf8');
    return { ok: true, file };
  } catch (err) {
    return { ok: false, file: '', error: String(err && err.message ? err.message : err) };
  }
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
