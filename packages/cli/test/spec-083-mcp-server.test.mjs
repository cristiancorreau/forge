// SPEC-083 P4 — server MCP de forge (`forge mcp serve`, stdio).
//
// Lanza la CLI compilada (dist/cli.js) contra un proyecto fixture y, con el
// client del propio SDK, fija el contrato:
//   - handshake MCP (initialize) correcto;
//   - resources con uris estables (forge://specs/<ID>, forge://project/export,
//     forge://project/audit) y contenido JSON/markdown válido;
//   - prompts para agentes y comandos (con argumento `arguments` si el
//     template usa $ARGUMENTS);
//   - tools forge_audit / forge_recommend / forge_generate cuyo contenido
//     parsea como JSON con schemaVersion "1" (mismo contrato que la CLI --json);
//   - stdout limpio: nada fuera del protocolo JSON-RPC.
//
// Requiere build previo (npm run build:all).
//
//     node --test test/spec-083-mcp-server.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

before(() => {
  assert.ok(existsSync(CLI), 'dist/cli.js no existe — correr npm run build:all primero');
});

// Timeout duro por test: en Windows un cuelgue del server/transport dejaba el
// job de CI colgado ~6h; con esto el test falla en vez de colgar la suite.
const TEST_TIMEOUT = { timeout: 60_000 };

/** Mata (SIGKILL) y espera el exit de un hijo spawneado a mano, con deadline. */
async function reapChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return; // ya salió
  const exited = once(child, 'exit').catch(() => {});
  try { child.kill('SIGKILL'); } catch { /* ya salió */ }
  let timer;
  await Promise.race([
    exited,
    new Promise((resolve) => { timer = setTimeout(resolve, 5000); }),
  ]);
  clearTimeout(timer);
}

/** Espera (hasta 5s) a que un pid muera; SIGKILL como fallback si sigue vivo. */
async function reapPid(pid) {
  const alive = () => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  };
  if (!alive()) return;
  try { process.kill(pid, 'SIGKILL'); } catch { /* ya salió */ }
  for (let i = 0; i < 50 && alive(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-083-mcp-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Fixture: proyecto forge mínimo con agente, comando, spec y MCP server. */
function makeFixtureProject(t) {
  const dir = makeTmpDir(t);
  writeFileSync(join(dir, 'project.yaml'), `project:
  name: "demo"
  mode: standard
runtimes:
  active:
    - claude-code
skills:
  - audit
mcp:
  servers:
    - name: postgres
      auto_approve:
        - query
`);
  mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'agents', 'demo-agent.md'), `---
name: demo-agent
description: Agente de prueba
model: sonnet
tools: Read, Edit
tier: 3
---

# demo-agent

## Reglas

## No hagas
`);
  mkdirSync(join(dir, '.claude', 'commands'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'commands', 'plan.md'), '# plan\n\nPlanifica: $ARGUMENTS\n');
  mkdirSync(join(dir, 'docs', 'specs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'specs', 'SPEC-001-demo.md'), '# SPEC-001 Demo\n\nContenido de la spec.\n');
  return dir;
}

/** Conecta un client MCP del SDK al server `forge mcp serve` sobre `dir`. */
async function connectClient(t, dir, extraArgs = []) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI, 'mcp', 'serve', ...extraArgs],
    cwd: dir,
    env: { ...process.env, FORGE_HOME: '' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'spec-083-test', version: '1.0.0' });

  // connect() arranca el transport (spawn síncrono), así que tras esta llamada
  // transport.stderr ya existe. Con stderr:'pipe' NADIE lo lee por defecto: si
  // el server escribe suficiente, el pipe se llena y el hijo se bloquea
  // (visto como hang de CI en Windows). Drenarlo siempre, desde el inicio.
  const connectPromise = client.connect(transport);
  let serverStderr = '';
  transport.stderr?.on('data', (d) => { serverStderr += d.toString(); });

  let connectTimer;
  try {
    await Promise.race([
      connectPromise,
      new Promise((_, reject) => {
        connectTimer = setTimeout(() => {
          transport.close().catch(() => {});
          reject(new Error(`timeout (20s) conectando a \`forge mcp serve\` — stderr del server:\n${serverStderr || '(vacío)'}`));
        }, 20_000);
      }),
    ]);
  } finally {
    clearTimeout(connectTimer);
  }

  t.after(async () => {
    const pid = transport.pid; // capturar antes de close(): después es null
    await client.close().catch(() => {});
    // close() aborta el spawn (SIGTERM); si el hijo sobrevive (Windows),
    // SIGKILL de fallback y espera acotada a que muera de verdad.
    if (pid) await reapPid(pid);
  });
  return client;
}

describe('SPEC-083 P4 — forge mcp serve (stdio)', () => {
  test('handshake + resources/prompts/tools con nombres y uris estables', TEST_TIMEOUT, async (t) => {
    const dir = makeFixtureProject(t);
    const client = await connectClient(t, dir);

    // Handshake: el server se identifica como forge.
    assert.equal(client.getServerVersion().name, 'forge');

    // Resources: uris estables.
    const { resources } = await client.listResources();
    const uris = resources.map(r => r.uri);
    assert.ok(uris.includes('forge://project/export'), `falta forge://project/export en ${uris}`);
    assert.ok(uris.includes('forge://project/audit'), `falta forge://project/audit en ${uris}`);
    assert.ok(uris.includes('forge://specs/SPEC-001'), `falta forge://specs/SPEC-001 en ${uris}`);

    // Resource export: JSON del contrato de `forge export --json`.
    const exportRes = await client.readResource({ uri: 'forge://project/export' });
    const model = JSON.parse(exportRes.contents[0].text);
    assert.equal(model.schemaVersion, '1');
    assert.equal(model.project.name, 'demo');
    assert.equal(model.agents.length, 1);
    assert.equal(model.agents[0].name, 'demo-agent');

    // Resource audit: JSON del contrato de `forge audit --json`.
    const auditRes = await client.readResource({ uri: 'forge://project/audit' });
    const auditJson = JSON.parse(auditRes.contents[0].text);
    assert.equal(auditJson.schemaVersion, '1');
    assert.ok(Array.isArray(auditJson.issues));

    // Resource spec: markdown de la spec.
    const specRes = await client.readResource({ uri: 'forge://specs/SPEC-001' });
    assert.match(specRes.contents[0].text, /SPEC-001 Demo/);

    // Prompts: agentes y comandos del proyecto como templates.
    const { prompts } = await client.listPrompts();
    const promptNames = prompts.map(p => p.name);
    assert.ok(promptNames.includes('agent-demo-agent'), `falta agent-demo-agent en ${promptNames}`);
    assert.ok(promptNames.includes('command-plan'), `falta command-plan en ${promptNames}`);
    const planPrompt = prompts.find(p => p.name === 'command-plan');
    assert.equal(planPrompt.arguments.length, 1, 'command-plan usa $ARGUMENTS → declara el argumento');
    assert.equal(planPrompt.arguments[0].name, 'arguments');
    const agentPrompt = prompts.find(p => p.name === 'agent-demo-agent');
    assert.equal(agentPrompt.description, 'Agente de prueba', 'description sale del frontmatter');

    // GetPrompt: el contenido markdown viaja como mensaje; $ARGUMENTS se reemplaza.
    const got = await client.getPrompt({ name: 'command-plan', arguments: { arguments: 'la fase 2' } });
    assert.equal(got.messages[0].role, 'user');
    assert.match(got.messages[0].content.text, /Planifica: la fase 2/);

    // Tools: las tres del contrato SPEC-083.
    const { tools } = await client.listTools();
    const toolNames = tools.map(x => x.name).sort();
    assert.deepEqual(toolNames, ['forge_audit', 'forge_generate', 'forge_recommend']);
  });

  test('forge_audit devuelve el contrato JSON (schemaVersion "1")', TEST_TIMEOUT, async (t) => {
    const dir = makeFixtureProject(t);
    const client = await connectClient(t, dir);

    const res = await client.callTool({ name: 'forge_audit', arguments: {} });
    assert.notEqual(res.isError, true, JSON.stringify(res.content));
    const report = JSON.parse(res.content[0].text);
    assert.equal(report.schemaVersion, '1');
    for (const key of ['errors', 'warnings', 'ok', 'info']) {
      assert.equal(typeof report.summary[key], 'number', `summary.${key} numérico`);
    }
    assert.ok(Array.isArray(report.issues));
  });

  test('forge_recommend y forge_generate (dry-run) devuelven JSON del contrato', TEST_TIMEOUT, async (t) => {
    const dir = makeFixtureProject(t);
    const client = await connectClient(t, dir);

    const rec = await client.callTool({ name: 'forge_recommend', arguments: { top: 1 } });
    assert.notEqual(rec.isError, true, JSON.stringify(rec.content));
    const recJson = JSON.parse(rec.content[0].text);
    assert.equal(recJson.schemaVersion, '1');
    assert.ok(Array.isArray(recJson.recommendations));

    const gen = await client.callTool({ name: 'forge_generate', arguments: { dryRun: true } });
    assert.notEqual(gen.isError, true, JSON.stringify(gen.content));
    const genJson = JSON.parse(gen.content[0].text);
    assert.equal(genJson.schemaVersion, '1');
    assert.equal(genJson.ok, true, genJson.output);
    assert.equal(genJson.exitCode, 0);
    // dry-run: los guards no escriben nada.
    assert.ok(!existsSync(join(dir, 'CLAUDE.md')), 'dry-run no escribe CLAUDE.md');
  });

  test('paths.specs fuera del root no expone archivos externos (confinamiento)', TEST_TIMEOUT, async (t) => {
    const parent = makeTmpDir(t);
    const dir = join(parent, 'proyecto');
    mkdirSync(dir, { recursive: true });
    // .md sensible FUERA del proyecto, hermano del root.
    mkdirSync(join(parent, 'outside'), { recursive: true });
    writeFileSync(join(parent, 'outside', 'SPEC-999-privado.md'), '# SPEC-999\n\nSECRETO-FUERA-DEL-ROOT\n');
    // project.yaml malicioso: paths.specs escapa del root con `..`.
    writeFileSync(join(dir, 'project.yaml'), `project:
  name: "demo"
  mode: standard
paths:
  specs: ../outside
`);
    const client = await connectClient(t, dir);
    const { resources } = await client.listResources();
    const uris = resources.map(r => r.uri);
    assert.ok(!uris.some(u => u.startsWith('forge://specs/')), `no debe listar specs externas: ${uris}`);
    await assert.rejects(
      client.readResource({ uri: 'forge://specs/SPEC-999' }),
      /desconocido|no se pudo/,
      'leer una spec fuera del root debe fallar',
    );
  });

  test('cerrar stdin (shutdown MCP estándar) termina el proceso con exit 0', TEST_TIMEOUT, async (t) => {
    const dir = makeFixtureProject(t);
    const child = spawn(process.execPath, [CLI, 'mcp', 'serve'], {
      cwd: dir,
      env: { ...process.env, FORGE_HOME: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    t.after(() => reapChild(child));

    let stdout = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'shutdown-test', version: '1.0.0' },
      },
    }) + '\n');

    // Espera la respuesta al initialize y luego cierra stdin (como hará mingako).
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`timeout — stdout: ${stdout}`)), 15000);
      child.stdout.on('data', () => {
        if (stdout.includes('"id":1')) { clearTimeout(deadline); resolve(); }
      });
    });
    child.stdin.end();

    const code = await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('el server no salió tras cerrar stdin')), 15000);
      child.on('exit', c => { clearTimeout(deadline); resolve(c); });
    });
    assert.equal(code, 0, `exit code tras cerrar stdin debe ser 0, fue ${code}`);
  });

  test('subdir con .forge/manifest.json sin project.yaml: rechaza el arranque (no sirve el ancestro)', TEST_TIMEOUT, async (t) => {
    const dir = makeFixtureProject(t);
    // inner parece un root forge (tiene manifest) pero su project.yaml más
    // cercano es el del ANCESTRO: servirlo expondría/escribiría fuera del root.
    const inner = join(dir, 'inner');
    mkdirSync(join(inner, '.forge'), { recursive: true });
    writeFileSync(join(inner, '.forge', 'manifest.json'), '{}');

    const child = spawn(process.execPath, [CLI, 'mcp', 'serve', '--dir', inner], {
      env: { ...process.env, FORGE_HOME: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    t.after(() => reapChild(child));
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    const code = await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`el server no salió — stderr: ${stderr}`)), 15000);
      child.on('exit', c => { clearTimeout(deadline); resolve(c); });
    });
    assert.equal(code, 1, `debe rechazar el arranque (exit 1), fue ${code}; stderr: ${stderr}`);
    assert.match(stderr, /project\.yaml/, `stderr debe explicar el motivo: ${stderr}`);
    assert.doesNotMatch(stderr, /\n\s+at /, `sin stack trace en stderr: ${stderr}`);
    assert.equal(stdout, '', 'stdout limpio: nada del protocolo antes de rechazar');
  });

  test('root con .forge/manifest.json Y project.yaml sigue sirviendo normal', TEST_TIMEOUT, async (t) => {
    const dir = makeFixtureProject(t);
    mkdirSync(join(dir, '.forge'), { recursive: true });
    writeFileSync(join(dir, '.forge', 'manifest.json'), '{}');
    const client = await connectClient(t, dir);
    const exportRes = await client.readResource({ uri: 'forge://project/export' });
    assert.equal(JSON.parse(exportRes.contents[0].text).project.name, 'demo');
  });

  test('--dir expone un proyecto distinto del cwd', TEST_TIMEOUT, async (t) => {
    const dir = makeFixtureProject(t);
    const elsewhere = makeTmpDir(t);
    const client = await connectClient(t, elsewhere, ['--dir', dir]);
    const exportRes = await client.readResource({ uri: 'forge://project/export' });
    assert.equal(JSON.parse(exportRes.contents[0].text).project.name, 'demo');
  });

  test('stdout queda limpio: cada línea emitida es JSON-RPC válido', TEST_TIMEOUT, async (t) => {
    const dir = makeFixtureProject(t);
    const child = spawn(process.execPath, [CLI, 'mcp', 'serve'], {
      cwd: dir,
      env: { ...process.env, FORGE_HOME: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    t.after(() => reapChild(child));

    let stdout = '';
    child.stdout.on('data', d => { stdout += d.toString(); });

    const send = (msg) => child.stdin.write(JSON.stringify(msg) + '\n');
    send({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'raw-test', version: '1.0.0' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

    // Espera hasta ver la respuesta a tools/list (id 2) o timeout.
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`timeout — stdout: ${stdout}`)), 15000);
      child.stdout.on('data', () => {
        if (stdout.includes('"id":2')) { clearTimeout(deadline); resolve(); }
      });
    });

    const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
    assert.ok(lines.length >= 2, `esperaba ≥2 respuestas JSON-RPC, hubo ${lines.length}`);
    for (const line of lines) {
      let parsed;
      assert.doesNotThrow(() => { parsed = JSON.parse(line); }, `línea no-JSON en stdout: ${line}`);
      assert.equal(parsed.jsonrpc, '2.0', `línea fuera del protocolo en stdout: ${line}`);
    }
  });
});
