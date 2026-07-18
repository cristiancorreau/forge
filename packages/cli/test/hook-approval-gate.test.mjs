// SPEC-083 P6 / SPEC-081 (mitad forge) — hook pre-approval-gate.js aislado.
//
// Contrato FAIL-OPEN: sin ~/.forge/daemon.json, con archivo corrupto, daemon
// caído o daemon colgado, el hook sale 0 rápido y jamás bloquea. Solo un
// `deny` explícito del circuito externo (mingako) bloquea (exit 2, protocolo
// de hooks PreToolUse). El bearer token nunca se escribe en stdout/stderr.
//
//     node --test test/hook-approval-gate.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const GATE_HOOK = join(REPO_ROOT, 'core', 'hooks', 'pre-approval-gate.js');

const TOKEN = 'tok-secret-approval-gate';
const PAYLOAD = { tool_name: 'Bash', tool_input: { command: 'ls -la' }, session_id: 'ses_1' };

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-approval-gate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  return dir;
}

/**
 * Corre el hook con FORGE_HOME=forgeHome (ahí busca daemon.json). Usa spawn
 * async (NO spawnSync): el daemon fake corre en este mismo proceso y spawnSync
 * bloquearía el event loop, impidiendo que el server responda. Se espera el
 * exit del hijo (sin hijos vivos) con kill de seguridad a los 5s.
 */
function runGate(forgeHome, payload = PAYLOAD, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [GATE_HOOK], {
      env: {
        ...process.env,
        FORGE_HOME: forgeHome,
        FORGE_DAEMON_URL: '',
        FORGE_DAEMON_TOKEN: '',
        DEBUG: '',
        ...extraEnv,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8').on('data', c => { stdout += c; });
    child.stderr.setEncoding('utf-8').on('data', c => { stderr += c; });
    const killer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.on('error', e => { clearTimeout(killer); reject(e); });
    child.on('close', status => {
      clearTimeout(killer);
      resolve({ status, stdout, stderr, elapsedMs: Date.now() - started });
    });
    child.stdin.end(payload === null ? undefined : JSON.stringify(payload));
  });
}

/** Levanta un daemon fake en 127.0.0.1:0 (puerto efímero) y escribe daemon.json. */
async function withFakeDaemon(t, handler, fn) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    server.close();
  });
  const port = server.address().port;
  const home = makeTmpDir(t);
  writeFileSync(join(home, 'daemon.json'), JSON.stringify({
    pid: 4321, port, token: TOKEN, startedAt: new Date().toISOString(),
  }));
  await fn(home, port);
}

describe('pre-approval-gate — fail-open sin daemon (SPEC-083 P6)', () => {
  test('sin daemon.json: exit 0 rápido y silencioso', async (t) => {
    const home = makeTmpDir(t);
    const { status, stdout, elapsedMs } = await runGate(home);
    assert.equal(status, 0, 'debe permitir (fail-open)');
    assert.equal(stdout, '', 'sin output hacia el runtime');
    assert.ok(elapsedMs < 3000, `debe ser rápido: ${elapsedMs}ms`);
  });

  test('daemon.json corrupto (JSON inválido): exit 0', async (t) => {
    const home = makeTmpDir(t);
    writeFileSync(join(home, 'daemon.json'), '{ no es json');
    const { status, stdout } = await runGate(home);
    assert.equal(status, 0);
    assert.equal(stdout, '');
  });

  test('daemon.json con shape inválido (port fuera de rango): exit 0', async (t) => {
    const home = makeTmpDir(t);
    writeFileSync(join(home, 'daemon.json'), JSON.stringify({ pid: 1, port: 0, token: 'x', startedAt: 'hoy' }));
    const { status } = await runGate(home);
    assert.equal(status, 0);
  });

  test('daemon caído (puerto cerrado): exit 0', async (t) => {
    const home = makeTmpDir(t);
    writeFileSync(join(home, 'daemon.json'), JSON.stringify({
      pid: 1, port: 1, token: TOKEN, startedAt: new Date().toISOString(),
    }));
    const { status, stdout } = await runGate(home);
    assert.equal(status, 0);
    assert.equal(stdout, '');
  });

  test('stdin vacío: exit 0', async (t) => {
    const home = makeTmpDir(t);
    const { status } = await runGate(home, null);
    assert.equal(status, 0);
  });
});

describe('pre-approval-gate — resoluciones del daemon fake (SPEC-083 P6)', () => {
  test('deny → bloquea con exit 2 y motivo en stdout', async (t) => {
    let sawAuth = null;
    let sawBody = '';
    await withFakeDaemon(t, (req, res) => {
      sawAuth = req.headers.authorization;
      req.on('data', c => { sawBody += c; });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ decision: 'deny', reason: 'rm en produccion', resolvedBy: 'user' }));
      });
    }, async (home) => {
      const { status, stdout } = await runGate(home);
      assert.equal(status, 2, 'deny debe bloquear (exit 2 del protocolo de hooks)');
      assert.match(stdout, /BLOQUEADO/);
      assert.match(stdout, /rm en produccion/);
      assert.equal(sawAuth, `Bearer ${TOKEN}`, 'el POST debe llevar el bearer token');
      const body = JSON.parse(sawBody);
      assert.equal(body.kind, 'tool_use');
      assert.equal(body.tool, 'Bash');
      assert.deepEqual(body.payload, { command: 'ls -la' });
    });
  });

  test('allow → permite con exit 0', async (t) => {
    await withFakeDaemon(t, (req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ decision: 'allow', resolvedBy: 'user' }));
      });
    }, async (home) => {
      const { status, stdout } = await runGate(home);
      assert.equal(status, 0);
      assert.equal(stdout, '');
    });
  });

  test('timeout del circuito (decision: timeout) → permite (fail-open)', async (t) => {
    await withFakeDaemon(t, (req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ decision: 'timeout', resolvedBy: 'timeout' }));
      });
    }, async (home) => {
      const { status } = await runGate(home);
      assert.equal(status, 0);
    });
  });

  test('daemon colgado (no responde) → fail-open por timeout en <3s', async (t) => {
    await withFakeDaemon(t, (req) => {
      req.resume(); // nunca responde
    }, async (home) => {
      const { status, stdout, elapsedMs } = await runGate(home);
      assert.equal(status, 0, 'daemon colgado no debe bloquear');
      assert.equal(stdout, '');
      assert.ok(elapsedMs < 3000, `fail-open lento: ${elapsedMs}ms`);
    });
  });

  test('respuesta 500 → permite (fail-open)', async (t) => {
    await withFakeDaemon(t, (req, res) => {
      req.resume();
      req.on('end', () => { res.writeHead(500); res.end('boom'); });
    }, async (home) => {
      const { status } = await runGate(home);
      assert.equal(status, 0);
    });
  });

  test('el token jamás aparece en stdout/stderr (ni con DEBUG)', async (t) => {
    await withFakeDaemon(t, (req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ decision: 'deny', reason: 'no' }));
      });
    }, async (home) => {
      const { stdout, stderr } = await runGate(home, PAYLOAD, { DEBUG: '1' });
      assert.ok(!stdout.includes(TOKEN), 'token filtrado en stdout');
      assert.ok(!stderr.includes(TOKEN), 'token filtrado en stderr');
    });
  });
});
