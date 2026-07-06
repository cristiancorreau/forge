'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { toArgs } = require('./args');
const {
  EDITORS, RUNTIME_CLI, editorById, runtimeCli, editorOpenSpec, terminalOpenSpec, detectInstalled,
  augmentedPath,
} = require('./launch');

// Lanzada desde Finder/Dock la app hereda un PATH minimo: sin esto, `npx`
// (la CLI de forge) y la deteccion de editores/runtimes fallarian con ENOENT.
// Se aplica una sola vez, antes de cualquier spawn/deteccion.
process.env.PATH = augmentedPath(process.env.PATH, os.homedir(), process.platform, path.delimiter);

/** True when `cmd` resolves on PATH (cross-platform: `where` on Windows). */
function isInstalled(cmd) {
  try {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    const r = spawnSync(probe, [cmd], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

/** Launch a detached GUI/terminal process and return whether it started. */
function launchDetached(command, args) {
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

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
      // Con sandbox:true el preload no puede hacer require() de package.json:
      // la version viaja por argv y el preload la lee de process.argv.
      additionalArguments: ['--forge-desktop-version=' + app.getVersion()],
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

// IPC: carpeta de trabajo por defecto para el renderer. Lanzada desde Finder,
// process.cwd() es '/' (o la raiz del volumen): en ese caso se cae al home,
// nunca se ofrece escribir un proyecto en la raiz del sistema.
ipcMain.handle('forge:defaultDir', async () => {
  const cwd = process.cwd();
  const isRoot = cwd === path.parse(cwd).root;
  return { dir: isRoot ? app.getPath('home') : cwd };
});

// IPC: selector nativo de carpeta del proyecto (unico acceso del renderer al
// filesystem para elegir donde correr init/adopt/doctor/audit).
ipcMain.handle('forge:pickDir', async (_event, message) => {
  const current = (message && message.current) || undefined;
  const r = await dialog.showOpenDialog({
    title: 'Elegir carpeta del proyecto',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths || !r.filePaths.length) return { ok: false, dir: '' };
  return { ok: true, dir: r.filePaths[0] };
});

// IPC: detectar editores instalados + disponibilidad de cada runtime CLI, para
// que el renderer muestre solo botones que van a funcionar.
ipcMain.handle('forge:detect', async () => {
  const editors = detectInstalled(EDITORS, isInstalled).map((e) => ({ id: e.id, label: e.label }));
  const runtimes = {};
  for (const [key, info] of Object.entries(RUNTIME_CLI)) runtimes[key] = isInstalled(info.cmd);
  return { editors, runtimes, platform: process.platform };
});

// IPC: abrir la carpeta del proyecto en el editor elegido.
ipcMain.handle('forge:openEditor', async (_event, message) => {
  const { editorId, dir } = message || {};
  const ed = editorById(editorId);
  if (!ed) return { ok: false, error: 'editor desconocido' };
  const target = dir || process.cwd();
  const spec = editorOpenSpec(ed.cmd, target);
  const r = launchDetached(spec.command, spec.args);
  return r === true ? { ok: true } : { ok: false, error: r.error };
});

// IPC: abrir una terminal en el proyecto ejecutando el runtime configurado.
ipcMain.handle('forge:openTerminal', async (_event, message) => {
  const { runtime, dir } = message || {};
  const cli = runtimeCli(runtime);
  const inner = cli ? cli.cmd : 'echo "forge listo — ejecuta tu agente en esta terminal"';
  const target = dir || process.cwd();
  const spec = terminalOpenSpec(inner, target, process.platform);
  const r = launchDetached(spec.command, spec.args);
  return r === true ? { ok: true } : { ok: false, error: r.error };
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
