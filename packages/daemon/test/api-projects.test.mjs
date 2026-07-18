// API HTTP /api/v1/projects en puerto efímero: auth, CRUD, contrato de error
// (SPEC-077 § 5, reglas de SPEC-082). DB temporal vía FORGE_HOME.
// Se salta si node:sqlite no está disponible (Node < 22.5).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let sqliteAvailable = true;
try {
  await import('node:sqlite');
} catch {
  sqliteAvailable = false;
}
const SKIP = !sqliteAvailable && 'node:sqlite no disponible (Node < 22.5)';

const YAML = `project:
  name: "demo-api"
  language: "typescript"
  mode: "standard"
runtimes:
  active:
    - claude-code
paths:
  specs: "docs/specs"
`;

let forgeHome;
let projectDir;
let emptyDir;
let server;
let baseUrl;

const api = (path, init = {}) => fetch(`${baseUrl}${path}`, {
  ...init,
  headers: { authorization: `Bearer ${server.token}`, ...(init.headers ?? {}) },
});

before(async () => {
  if (!sqliteAvailable) return;
  forgeHome = mkdtempSync(join(tmpdir(), 'forge-api-'));
  process.env.FORGE_HOME = forgeHome;
  projectDir = join(forgeHome, 'repos', 'demo-api');
  emptyDir = join(forgeHome, 'repos', 'empty');
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(emptyDir, { recursive: true });
  writeFileSync(join(projectDir, 'project.yaml'), YAML);

  const { startServer } = await import('@cristiancorreau/forge-daemon');
  server = await startServer({ port: 0 }); // puerto efímero
  baseUrl = `http://127.0.0.1:${server.port}`;
});

after(async () => {
  await server?.close();
  if (forgeHome) rmSync(forgeHome, { recursive: true, force: true });
  delete process.env.FORGE_HOME;
});

describe('forged serve — arranque y descubrimiento', { skip: SKIP }, () => {
  test('escribe daemon.json (0600) con pid, port, token y startedAt', () => {
    const file = join(forgeHome, 'daemon.json');
    assert.ok(existsSync(file), 'falta daemon.json en FORGE_HOME');
    const mode = statSync(file).mode & 0o777;
    assert.equal(mode, 0o600, `modo ${mode.toString(8)} ≠ 600`);
    const info = JSON.parse(readFileSync(file, 'utf-8'));
    assert.equal(info.pid, process.pid);
    assert.equal(info.port, server.port);
    assert.equal(info.token, server.token);
    assert.match(info.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('auth bearer', { skip: SKIP }, () => {
  test('sin header → 401 con contrato de error sin stack', async () => {
    const res = await fetch(`${baseUrl}/api/v1/projects`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.deepEqual(Object.keys(body), ['error']);
    assert.equal(body.error.code, 'unauthorized');
    assert.equal(typeof body.error.message, 'string');
    assert.equal('stack' in body.error, false);
  });

  test('token incorrecto → 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/projects`, {
      headers: { authorization: 'Bearer nope' },
    });
    assert.equal(res.status, 401);
  });
});

describe('CRUD /api/v1/projects', { skip: SKIP }, () => {
  let projectId;

  test('GET inicial → { projects: [] }', async () => {
    const res = await api('/api/v1/projects');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { projects: [] });
  });

  test('POST con manifest válido → 201 con Project completo', async () => {
    const res = await api('/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: projectDir }),
    });
    assert.equal(res.status, 201);
    const project = await res.json();
    assert.match(project.id, /^prj_[0-9A-HJKMNP-TV-Z]{26}$/, 'forgeId con ULID Crockford');
    assert.equal(project.name, 'demo-api');
    assert.equal(project.status, 'active');
    assert.equal(project.metadata.language, 'typescript');
    assert.deepEqual(project.metadata.runtimes, ['claude-code']);
    projectId = project.id;
  });

  test('POST repetido → 201 idempotente (mismo id, sin duplicar)', async () => {
    const res = await api('/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: projectDir }),
    });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).id, projectId);
    const list = await (await api('/api/v1/projects')).json();
    assert.equal(list.projects.length, 1);
  });

  test('POST sin project.yaml → 422 unprocessable', async () => {
    const res = await api('/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: emptyDir }),
    });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error.code, 'unprocessable');
  });

  test('POST con project.yaml inválido → 422', async () => {
    const brokenDir = join(forgeHome, 'repos', 'broken');
    mkdirSync(brokenDir, { recursive: true });
    writeFileSync(join(brokenDir, 'project.yaml'), 'project:\n  name: [broken\n');
    const res = await api('/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: brokenDir }),
    });
    assert.equal(res.status, 422);
  });

  test('POST sin body.path → 422 validation_failed', async () => {
    const res = await api('/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error.code, 'validation_failed');
  });

  test('GET /:id → 200; inexistente → 404 not_found', async () => {
    const ok = await api(`/api/v1/projects/${projectId}`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).id, projectId);

    const missing = await api('/api/v1/projects/prj_00000000000000000000000000');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'not_found');
  });

  test('criterio Fase 1: 3 proyectos registrados y visibles vía API', async () => {
    for (const name of ['beta', 'gamma']) {
      const dir = join(forgeHome, 'repos', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'project.yaml'), `project:\n  name: "${name}"\n`);
      const res = await api('/api/v1/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: dir }),
      });
      assert.equal(res.status, 201);
    }
    const list = await (await api('/api/v1/projects')).json();
    assert.equal(list.projects.length, 3);
    assert.deepEqual(list.projects.map((p) => p.name).sort(), ['beta', 'demo-api', 'gamma']);
  });

  test('DELETE /:id → 204; repetido → 404', async () => {
    const res = await api(`/api/v1/projects/${projectId}`, { method: 'DELETE' });
    assert.equal(res.status, 204);
    const again = await api(`/api/v1/projects/${projectId}`, { method: 'DELETE' });
    assert.equal(again.status, 404);
  });

  test('ruta desconocida → 404; JSON malformado → 400', async () => {
    const notFound = await api('/api/v1/nope');
    assert.equal(notFound.status, 404);
    const badJson = await api('/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(badJson.status, 400);
    assert.equal((await badJson.json()).error.code, 'validation_failed');
  });
});

describe('watcher de project.yaml (SPEC-077, criterio < 2 s)', { skip: SKIP }, () => {
  test('editar el name actualiza name y last_seen_at en la DB', async () => {
    const dir = join(forgeHome, 'repos', 'beta');
    // beta quedó registrado por el test del criterio de Fase 1
    const before = await (await api('/api/v1/projects')).json();
    const beta = before.projects.find((p) => p.name === 'beta');
    assert.ok(beta, 'precondición: beta registrado');

    writeFileSync(join(dir, 'project.yaml'), 'project:\n  name: "beta-renamed"\n');

    // debounce 300 ms + margen: reintenta hasta 2 s
    const deadline = Date.now() + 2000;
    let renamed = null;
    while (Date.now() < deadline) {
      const list = await (await api('/api/v1/projects')).json();
      renamed = list.projects.find((p) => p.id === beta.id);
      if (renamed.name === 'beta-renamed') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(renamed.name, 'beta-renamed', 'el watcher no refrescó en < 2 s');
    assert.ok(renamed.lastSeenAt >= beta.lastSeenAt, 'lastSeenAt debe avanzar');
  });
});
