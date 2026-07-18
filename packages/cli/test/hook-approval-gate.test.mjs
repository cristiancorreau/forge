// SPEC-083 P6 / SPEC-081 (mitad forge) — hook pre-approval-gate.js aislado.
//
// Protocolo (SPEC-081 §3): POST /api/v1/approvals → 201 {id} y long-poll
// GET /api/v1/approvals/:id/wait → ApprovalResolution. La decisión sale como
// JSON estructurado de PreToolUse (hookSpecificOutput.permissionDecision) con
// exit 0. decision 'deny' y 'timeout' → deny; 'answer' → deny con la
// respuesta humana en permissionDecisionReason; 'allow' → allow.
//
// Contrato FAIL-OPEN: sin ~/.forge/daemon.json, con archivo corrupto, daemon
// caído o colgado ANTES de aceptar la request, el hook sale 0 rápido y jamás
// bloquea. El bearer token nunca se escribe en stdout/stderr. El override
// FORGE_DAEMON_URL solo acepta loopback (anti-exfiltración).
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
const APPROVAL_ID = 'apr_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const PAYLOAD = { tool_name: 'Bash', tool_input: { command: 'ls -la' }, session_id: 'ses_1' };

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-approval-gate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  return dir;
}

/** Parsea el JSON hookSpecificOutput de stdout (SPEC-081 §4.4) o null. */
function parseHookOutput(stdout) {
  if (!stdout.trim()) return null;
  const parsed = JSON.parse(stdout);
  return parsed.hookSpecificOutput ?? null;
}

/**
 * Corre el hook con FORGE_HOME=forgeHome (ahí busca daemon.json). Usa spawn
 * async (NO spawnSync): el daemon fake corre en este mismo proceso y spawnSync
 * bloquearía el event loop, impidiendo que el server responda. Se espera el
 * exit del hijo (sin hijos vivos) con kill de seguridad configurable.
 */
function runGate(forgeHome, payload = PAYLOAD, extraEnv = {}, killAfterMs = 5000) {
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
    const killer = setTimeout(() => child.kill('SIGKILL'), killAfterMs);
    child.on('error', e => { clearTimeout(killer); reject(e); });
    child.on('close', status => {
      clearTimeout(killer);
      resolve({ status, stdout, stderr, elapsedMs: Date.now() - started });
    });
    child.stdin.end(payload === null ? undefined : JSON.stringify(payload));
  });
}

/**
 * Daemon fake conforme a SPEC-081 §3: POST /api/v1/approvals → 201 {id};
 * GET /api/v1/approvals/:id/wait → 200 ApprovalResolution (o cuelga con
 * hangWait). Registra lo observado en `seen`.
 */
function approvalsHandler(resolution, seen = {}, { hangWait = false } = {}) {
  return (req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', c => { body += c; });
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/api/v1/approvals') {
        seen.postAuth = req.headers.authorization;
        seen.postBody = body;
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: APPROVAL_ID }));
        return;
      }
      if (req.method === 'GET' && /^\/api\/v1\/approvals\/[^/]+\/wait\b/.test(req.url ?? '')) {
        seen.waitAuth = req.headers.authorization;
        seen.waitUrl = req.url;
        if (hangWait) return; // nunca responde: el hook debe fail-open
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(resolution));
        return;
      }
      seen.unexpected = `${req.method} ${req.url}`;
      res.writeHead(404);
      res.end();
    });
  };
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

describe('pre-approval-gate — override FORGE_DAEMON_URL solo loopback', () => {
  test('URL no-loopback (0.0.0.0 apuntando al daemon fake): NO conecta y permite', async (t) => {
    const seen = {};
    await withFakeDaemon(t, approvalsHandler({ decision: 'deny' }, seen), async (_home, port) => {
      const emptyHome = makeTmpDir(t); // sin daemon.json: solo cuenta el env
      const { status, stdout } = await runGate(emptyHome, PAYLOAD, {
        FORGE_DAEMON_URL: `http://0.0.0.0:${port}`,
        FORGE_DAEMON_TOKEN: TOKEN,
      });
      assert.equal(status, 0, 'host no-loopback debe ignorarse (fail-open)');
      assert.equal(stdout, '', 'sin output: jamás llegó a preguntar');
      assert.equal(seen.postAuth, undefined, 'no debe haber ningún request al daemon');
    });
  });

  test('URL sin puerto explícito: se ignora (fail-open)', async (t) => {
    const emptyHome = makeTmpDir(t);
    const { status, stdout } = await runGate(emptyHome, PAYLOAD, {
      FORGE_DAEMON_URL: 'http://127.0.0.1',
      FORGE_DAEMON_TOKEN: TOKEN,
    });
    assert.equal(status, 0);
    assert.equal(stdout, '');
  });

  test('URL loopback (localhost) válida: el circuito funciona vía env', async (t) => {
    const seen = {};
    const resolution = { decision: 'deny', reason: 'via env', resolvedBy: 'user', resolvedAt: new Date().toISOString() };
    await withFakeDaemon(t, approvalsHandler(resolution, seen), async (_home, port) => {
      const emptyHome = makeTmpDir(t);
      const { status, stdout } = await runGate(emptyHome, PAYLOAD, {
        FORGE_DAEMON_URL: `http://localhost:${port}`,
        FORGE_DAEMON_TOKEN: TOKEN,
      });
      assert.equal(status, 0);
      const out = parseHookOutput(stdout);
      assert.equal(out.permissionDecision, 'deny');
      assert.equal(seen.postAuth, `Bearer ${TOKEN}`);
    });
  });
});

describe('pre-approval-gate — resoluciones del daemon fake (SPEC-081 §3/§4)', () => {
  test('deny → JSON permissionDecision "deny" con motivo, exit 0', async (t) => {
    const seen = {};
    const resolution = { decision: 'deny', reason: 'rm en produccion', resolvedBy: 'user', resolvedAt: new Date().toISOString() };
    await withFakeDaemon(t, approvalsHandler(resolution, seen), async (home) => {
      const { status, stdout } = await runGate(home);
      assert.equal(status, 0, 'protocolo JSON de PreToolUse: siempre exit 0');
      const out = parseHookOutput(stdout);
      assert.equal(out.hookEventName, 'PreToolUse');
      assert.equal(out.permissionDecision, 'deny');
      assert.match(out.permissionDecisionReason, /rm en produccion/);

      // Wire: POST 201 {id} + GET :id/wait, ambos con bearer token.
      assert.equal(seen.postAuth, `Bearer ${TOKEN}`, 'el POST debe llevar el bearer token');
      assert.equal(seen.waitAuth, `Bearer ${TOKEN}`, 'el wait debe llevar el bearer token');
      assert.match(seen.waitUrl, new RegExp(`^/api/v1/approvals/${APPROVAL_ID}/wait\\?timeoutMs=\\d+$`));
      const body = JSON.parse(seen.postBody);
      assert.equal(body.kind, 'tool_use');
      assert.equal(body.tool, 'Bash');
      assert.deepEqual(body.payload, { command: 'ls -la' });
      assert.equal(body.timeoutMs, 300_000, 'default: 300s (SPEC-081)');
    });
  });

  test('allow → JSON permissionDecision "allow", exit 0', async (t) => {
    const resolution = { decision: 'allow', resolvedBy: 'user', resolvedAt: new Date().toISOString() };
    await withFakeDaemon(t, approvalsHandler(resolution), async (home) => {
      const { status, stdout } = await runGate(home);
      assert.equal(status, 0);
      assert.equal(parseHookOutput(stdout).permissionDecision, 'allow');
    });
  });

  test('decision "timeout" → DENY (SPEC-081 §1: timeout mapea a denegar)', async (t) => {
    const resolution = { decision: 'timeout', resolvedBy: 'timeout', resolvedAt: new Date().toISOString() };
    await withFakeDaemon(t, approvalsHandler(resolution), async (home) => {
      const { status, stdout } = await runGate(home);
      assert.equal(status, 0);
      const out = parseHookOutput(stdout);
      assert.equal(out.permissionDecision, 'deny', 'un humano que no responde NO es un allow');
      assert.match(out.permissionDecisionReason, /timeout/i);
    });
  });

  test('decision "answer" → deny con la respuesta humana en permissionDecisionReason', async (t) => {
    const seen = {};
    const resolution = {
      decision: 'answer', answer: { optionIds: ['pnpm'], text: 'usa pnpm, no npm' },
      resolvedBy: 'user', resolvedAt: new Date().toISOString(),
    };
    await withFakeDaemon(t, approvalsHandler(resolution, seen), async (home) => {
      const payload = {
        tool_name: 'AskUserQuestion',
        tool_input: { question: '¿package manager?' },
        session_id: 'ses_1',
      };
      const { status, stdout } = await runGate(home, payload);
      assert.equal(status, 0);
      const out = parseHookOutput(stdout);
      assert.equal(out.permissionDecision, 'deny');
      assert.match(out.permissionDecisionReason, /usa pnpm, no npm/);
      assert.match(out.permissionDecisionReason, /pnpm/);
      assert.equal(JSON.parse(seen.postBody).kind, 'question', 'AskUserQuestion → kind question');
    });
  });

  test('ExitPlanMode → kind "plan" en el POST', async (t) => {
    const seen = {};
    const resolution = { decision: 'allow', resolvedBy: 'user', resolvedAt: new Date().toISOString() };
    await withFakeDaemon(t, approvalsHandler(resolution, seen), async (home) => {
      const { status } = await runGate(home, {
        tool_name: 'ExitPlanMode', tool_input: { plan: '1. hacer X' }, session_id: 'ses_1',
      });
      assert.equal(status, 0);
      assert.equal(JSON.parse(seen.postBody).kind, 'plan');
    });
  });

  test('approvals.timeout_seconds: 5 llega como timeoutMs: 5000 en el POST (SPEC-081)', async (t) => {
    const seen = {};
    const resolution = { decision: 'allow', resolvedBy: 'user', resolvedAt: new Date().toISOString() };
    await withFakeDaemon(t, approvalsHandler(resolution, seen), async (home) => {
      const project = makeTmpDir(t);
      writeFileSync(join(project, 'project.yaml'), [
        'project:',
        '  name: demo',
        '  mode: standard',
        'approvals:',
        '  enabled: true',
        '  timeout_seconds: 5',
        '',
      ].join('\n'));
      const { status } = await runGate(home, { ...PAYLOAD, cwd: project });
      assert.equal(status, 0);
      assert.equal(JSON.parse(seen.postBody).timeoutMs, 5000);
      assert.match(seen.waitUrl, /timeoutMs=5000$/);
    });
  });

  test('POST que responde la resolución en vez de 201 {id} (daemon no conforme) → permite', async (t) => {
    // Documenta el protocolo: la resolución SOLO llega por /wait; un body sin
    // id no habilita a bloquear (fail-open, nunca inventar un deny).
    await withFakeDaemon(t, (req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ decision: 'deny', reason: 'no conforme' }));
      });
    }, async (home) => {
      const { status, stdout } = await runGate(home);
      assert.equal(status, 0);
      assert.equal(stdout, '', 'fail-open silencioso');
    });
  });

  test('daemon colgado en el POST (no responde) → fail-open por timeout en <3s', async (t) => {
    await withFakeDaemon(t, (req) => {
      req.resume(); // nunca responde
    }, async (home) => {
      const { status, stdout, elapsedMs } = await runGate(home);
      assert.equal(status, 0, 'daemon colgado no debe bloquear');
      assert.equal(stdout, '');
      assert.ok(elapsedMs < 3000, `fail-open lento: ${elapsedMs}ms`);
    });
  });

  test('daemon que acepta (201) pero cuelga el /wait → fail-open al vencer timeoutMs + margen', async (t) => {
    const resolution = null;
    await withFakeDaemon(t, approvalsHandler(resolution, {}, { hangWait: true }), async (home) => {
      const project = makeTmpDir(t);
      writeFileSync(join(project, 'project.yaml'), 'approvals:\n  timeout_seconds: 1\n');
      const { status, stdout, elapsedMs } = await runGate(home, { ...PAYLOAD, cwd: project }, {}, 15_000);
      assert.equal(status, 0, 'wait colgado no debe bloquear (mismo camino fail-open)');
      assert.equal(stdout, '');
      // timeoutMs (1s) + margen duro del cliente (5s) < 10s.
      assert.ok(elapsedMs < 10_000, `fail-open del wait lento: ${elapsedMs}ms`);
      assert.ok(elapsedMs >= 1000, `debió esperar al menos timeoutMs: ${elapsedMs}ms`);
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
    const resolution = { decision: 'deny', reason: 'no', resolvedBy: 'user', resolvedAt: new Date().toISOString() };
    await withFakeDaemon(t, approvalsHandler(resolution), async (home) => {
      const { stdout, stderr } = await runGate(home, PAYLOAD, { DEBUG: '1' });
      assert.ok(!stdout.includes(TOKEN), 'token filtrado en stdout');
      assert.ok(!stderr.includes(TOKEN), 'token filtrado en stderr');
    });
  });
});
