import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// launch.js es CommonJS (module.exports) para testearlo en Node sin Electron.
const require = createRequire(import.meta.url);
const launch = require('../src/launch.js');

test('editorOpenSpec abre la carpeta con el launcher', () => {
  assert.deepEqual(launch.editorOpenSpec('code', '/proj'), { command: 'code', args: ['/proj'] });
});

test('runtimeCli mapea el runtime de forge a su CLI', () => {
  assert.equal(launch.runtimeCli('claude-code').cmd, 'claude');
  assert.equal(launch.runtimeCli('opencode').cmd, 'opencode');
  assert.equal(launch.runtimeCli('codex').cmd, 'codex');
  assert.equal(launch.runtimeCli('desconocido'), null);
});

test('editorById encuentra/ignora', () => {
  assert.equal(launch.editorById('vscode').cmd, 'code');
  assert.equal(launch.editorById('nope'), null);
});

test('terminalOpenSpec darwin usa osascript con cd al proyecto', () => {
  const s = launch.terminalOpenSpec('claude', '/proj', 'darwin');
  assert.equal(s.command, 'osascript');
  assert.equal(s.args[0], '-e');
  assert.match(s.args[1], /Terminal/);
  assert.match(s.args[1], /cd \\?"\/proj\\?"/); // el cd al proyecto va citado
  assert.match(s.args[1], /claude/);
});

test('terminalOpenSpec win32 usa cmd /k', () => {
  const s = launch.terminalOpenSpec('claude', 'C:/proj', 'win32');
  assert.equal(s.command, 'cmd');
  assert.deepEqual(s.args.slice(0, 4), ['/c', 'start', 'cmd', '/k']);
  assert.match(s.args[4], /claude/);
});

test('terminalOpenSpec linux usa x-terminal-emulator', () => {
  const s = launch.terminalOpenSpec('opencode', '/p', 'linux');
  assert.equal(s.command, 'x-terminal-emulator');
  assert.match(s.args.join(' '), /opencode/);
});

test('detectInstalled filtra por el probe inyectado', () => {
  const installed = new Set(['code', 'cursor']);
  const got = launch.detectInstalled(launch.EDITORS, (cmd) => installed.has(cmd));
  assert.deepEqual(got.map((e) => e.id).sort(), ['cursor', 'vscode']);
});

test('shQuote escapa comillas y backslashes', () => {
  assert.equal(launch.shQuote('/a b'), '"/a b"');
  assert.match(launch.shQuote('a"b'), /a\\"b/);
});
