'use strict';

/**
 * Pure helpers to open the configured project after `forge init`/`adopt`:
 *  - open the project folder in an installed editor (VS Code, Cursor, …)
 *  - open a terminal running the configured agent runtime (Claude Code, …)
 *
 * No I/O here: the command/args are built as plain data and executed by main.js.
 * Detection takes an injected `isInstalled` so it stays testable in Node.
 */

// GUI editors that open a folder via their CLI launcher. `cmd` is the launcher
// expected on PATH; `args(dir)` builds the argv to open the project.
const EDITORS = [
  { id: 'vscode', label: 'VS Code', cmd: 'code' },
  { id: 'cursor', label: 'Cursor', cmd: 'cursor' },
  { id: 'windsurf', label: 'Windsurf', cmd: 'windsurf' },
  { id: 'antigravity', label: 'Antigravity', cmd: 'antigravity' },
  { id: 'zed', label: 'Zed', cmd: 'zed' },
  { id: 'kiro', label: 'Kiro', cmd: 'kiro' },
  { id: 'sublime', label: 'Sublime Text', cmd: 'subl' },
];

// Agent runtimes that run in a terminal. Keyed by the forge `runtime` value.
const RUNTIME_CLI = {
  'claude-code': { label: 'Claude Code', cmd: 'claude' },
  opencode: { label: 'OpenCode', cmd: 'opencode' },
  codex: { label: 'Codex', cmd: 'codex' },
  gemini: { label: 'Gemini CLI', cmd: 'gemini' },
};

function editorById(id) {
  return EDITORS.find((e) => e.id === id) || null;
}

function runtimeCli(runtime) {
  return RUNTIME_CLI[runtime] || null;
}

/** Spec to open `dir` in the given editor launcher. */
function editorOpenSpec(launcher, dir) {
  return { command: launcher, args: [dir] };
}

/** Quote a path for embedding inside a shell `do script` / -c string. */
function shQuote(p) {
  return '"' + String(p).replace(/(["\\$`])/g, '\\$1') + '"';
}

/**
 * Spec to open a terminal at `dir` running `innerCmd`, per platform.
 * platform: 'darwin' | 'linux' | 'win32'.
 */
function terminalOpenSpec(innerCmd, dir, platform) {
  const cd = 'cd ' + shQuote(dir) + ' && ' + innerCmd;
  if (platform === 'darwin') {
    const script = 'tell application "Terminal" to activate\n' +
      'tell application "Terminal" to do script ' + JSON.stringify(cd);
    return { command: 'osascript', args: ['-e', script] };
  }
  if (platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', 'cmd', '/k', cd] };
  }
  // linux / others: best-effort via x-terminal-emulator, keep the shell open.
  return { command: 'x-terminal-emulator', args: ['-e', 'bash', '-lc', cd + '; exec bash'] };
}

/**
 * Filter a candidate list to those whose `cmd` is installed.
 * @param {Array<{cmd:string}>} candidates
 * @param {(cmd:string)=>boolean} isInstalled
 */
function detectInstalled(candidates, isInstalled) {
  return candidates.filter((c) => isInstalled(c.cmd));
}

module.exports = {
  EDITORS,
  RUNTIME_CLI,
  editorById,
  runtimeCli,
  editorOpenSpec,
  terminalOpenSpec,
  detectInstalled,
  shQuote,
};
