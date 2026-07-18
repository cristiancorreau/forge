// SPEC-083 P5 — política MCP escaneable + forge audit --mcp.
//
// Fija el contrato del artefacto `.forge/mcp-policy.json` que un orquestador
// (mingako) consume para sandboxing/approval gates sin re-derivarlo:
//   - `forge generate` lo emite (default-deny, determinista, sin timestamps),
//     incluso sin mcp.servers declarados (política vacía).
//   - Valida contra mcp-policy.schema.json (forge-schemas,
//     $id forge://schemas/v4/mcp-policy); la copia inlineada en la CLI es
//     idéntica byte a byte a la fuente.
//   - `forge audit --mcp` escanea: caso limpio, drift (edición manual),
//     autoApprove demasiado amplio ("*") y archivo ausente con servers
//     declarados. Contrato --json con schemaVersion "1" y exit codes de audit.
//
// Corre la CLI compilada (dist/cli.js) en directorios temporales, como
// spec-083-conformance.test.mjs. Requiere build previo (npm run build:all).
//
//     node --test test/spec-083-mcp-policy.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
// Import ESTÁTICO del módulo compilado, NO dinámico dentro de before(async):
// bajo `node --test --test-force-exit` cualquier gap asíncrono a nivel raíz
// (before async o top-level await) hacía que el runner recortara tests en
// silencio (corrían 5-6 de 13 con exit 0 y el describe de audit --mcp nunca
// ejecutaba). Si dist no existe, el archivo falla al cargar (fail visible).
import { MCP_POLICY_SCHEMA, buildMcpPolicy } from '../dist/lib/mcp-policy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const CLI = join(DIST, 'cli.js');
const POLICY_FILE = '.forge/mcp-policy.json';
const SCHEMA_PATH = join(
  __dirname, '..', '..', 'schemas', 'schemas', 'mcp-policy.schema.json',
);

assert.ok(existsSync(CLI), 'dist/cli.js no existe — correr npm run build:all primero');
assert.ok(existsSync(SCHEMA_PATH), 'packages/schemas/schemas/mcp-policy.schema.json no existe');

/**
 * Corre la CLI compilada. Devuelve Promise<{ status, stdout, stderr }>.
 *
 * ASYNC a propósito (spawn, no spawnSync): bajo `node --test
 * --test-force-exit` (el comando de test del repo) los cuerpos de test que
 * bloquean el event loop con spawnSync hacen que el runner recorte tests en
 * silencio con exit 0 (corrían 5-6 de los 13 y el describe de audit --mcp
 * nunca ejecutaba). Con spawn asíncrono los 13 corren deterministas. El hijo
 * se espera hasta 'close' (streams cerrados): no quedan procesos vivos.
 */
function runForge(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: opts.cwd ?? process.cwd(),
      env: { ...process.env, FORGE_HOME: '', FORGE_NO_BUN: '1', FORGE_NO_DASHBOARD: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ status: code ?? 1, stdout, stderr }));
  });
}

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-083p5-'));
  // EBUSY-safe en Windows: reintentos con backoff.
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
}

/** Fixture: proyecto con MCP servers declarados en project.yaml. */
function makeProjectWithServers(t, { broad = false } = {}) {
  const dir = makeTmpDir(t);
  writeFileSync(join(dir, 'project.yaml'), `project:
  name: "demo-p5"
  mode: standard
runtimes:
  active:
    - claude-code
mcp:
  servers:
    - name: postgres
      auto_approve:
        - query
        - list_tables
    - name: github
${broad ? `    - name: wild
      auto_approve:
        - "*"
` : ''}`);
  return dir;
}

/** Fixture: proyecto sin mcp.servers. */
function makeProjectWithoutServers(t) {
  const dir = makeTmpDir(t);
  writeFileSync(join(dir, 'project.yaml'), `project:
  name: "demo-p5-sin-mcp"
  mode: standard
runtimes:
  active:
    - claude-code
`);
  return dir;
}

function readPolicy(dir) {
  return JSON.parse(readFileSync(join(dir, POLICY_FILE), 'utf-8'));
}

describe('SPEC-083 P5 — schema mcp-policy', () => {
  test('la copia inlineada en la CLI es idéntica a forge-schemas (fuente de verdad)', () => {
    const source = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.deepEqual(JSON.parse(JSON.stringify(MCP_POLICY_SCHEMA)), source);
  });

  test('el schema es draft-07, $id forge://schemas/v4/mcp-policy, default-deny por const', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
    assert.equal(schema.$id, 'forge://schemas/v4/mcp-policy');
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.defaultPolicy.const, 'deny');
    assert.equal(schema.properties.schemaVersion.const, '1');
  });
});

describe('SPEC-083 P5 — forge generate emite .forge/mcp-policy.json', () => {
  test('emite la política derivada de project.yaml y valida contra el schema', async (t) => {
    const dir = makeProjectWithServers(t);
    const res = await runForge(['generate'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr);
    assert.ok(existsSync(join(dir, POLICY_FILE)), `${POLICY_FILE} no fue emitido`);

    const policy = readPolicy(dir);
    assert.equal(policy.schemaVersion, '1');
    assert.match(policy.generatedBy, /^forge@\d+\.\d+\.\d+/);
    assert.equal(policy.project, 'demo-p5');
    assert.equal(policy.defaultPolicy, 'deny');
    assert.deepEqual(policy.servers, [
      { name: 'postgres', autoApprove: ['query', 'list_tables'] },
      { name: 'github', autoApprove: [] },
    ]);
    // Marcador de archivo generado (convención de forge).
    assert.ok(policy.notes.includes('Generado por forge'), 'notes sin marcador de forge');

    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    assert.ok(validate(policy), JSON.stringify(validate.errors));
  });

  test('determinista: dos corridas producen bytes idénticos (sin timestamps)', async (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal((await runForge(['generate'], { cwd: dir })).status, 0);
    const first = readFileSync(join(dir, POLICY_FILE));
    assert.equal((await runForge(['generate', '--force'], { cwd: dir })).status, 0);
    const second = readFileSync(join(dir, POLICY_FILE));
    assert.ok(first.equals(second), 'las dos corridas difieren byte a byte');
  });

  test('sin mcp.servers declarados emite la política vacía con defaultPolicy deny', async (t) => {
    const dir = makeProjectWithoutServers(t);
    const res = await runForge(['generate'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr);

    const policy = readPolicy(dir);
    assert.equal(policy.defaultPolicy, 'deny');
    assert.deepEqual(policy.servers, []);

    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    assert.ok(ajv.validate(schema, policy), JSON.stringify(ajv.errors));
  });

  test('buildMcpPolicy es pura: misma config → misma política', () => {
    const config = {
      project: { name: 'x' },
      mcp: { servers: [{ name: 's1', auto_approve: ['a'] }] },
    };
    assert.deepEqual(buildMcpPolicy(config), buildMcpPolicy(config));
  });
});

describe('SPEC-083 P5 — forge audit --mcp', () => {
  test('caso limpio: política al día → exit 0 y contrato JSON schemaVersion "1"', async (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal((await runForge(['generate'], { cwd: dir })).status, 0);

    const res = await runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.schemaVersion, '1');
    assert.deepEqual(Object.keys(out.summary).sort(), ['errors', 'info', 'ok', 'warnings']);
    assert.equal(out.summary.errors, 0);
    assert.ok(Array.isArray(out.issues));
    for (const issue of out.issues) {
      assert.deepEqual(Object.keys(issue).sort(), ['check', 'level', 'message']);
      assert.equal(issue.check, 'mcp-policy');
    }
    assert.ok(out.issues.some(i => i.level === 'ok' && /al día con project\.yaml/.test(i.message)));
  });

  test('drift: archivo editado a mano → error y exit 1', async (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal((await runForge(['generate'], { cwd: dir })).status, 0);

    // Edición manual: se auto-aprueba una tool que project.yaml no declara.
    const policyPath = join(dir, POLICY_FILE);
    const policy = readPolicy(dir);
    policy.servers[0].autoApprove.push('drop_table');
    writeFileSync(policyPath, JSON.stringify(policy, null, 2) + '\n');

    const res = await runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 1, 'drift debe fallar la auditoría');
    const out = JSON.parse(res.stdout);
    assert.ok(out.issues.some(i => i.level === 'error' && /drift/.test(i.message)));
  });

  test('drift: project.yaml cambió después de generar → error y exit 1', async (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal((await runForge(['generate'], { cwd: dir })).status, 0);

    // La política quedó desactualizada: se agrega un server a project.yaml.
    const yamlPath = join(dir, 'project.yaml');
    writeFileSync(yamlPath, readFileSync(yamlPath, 'utf-8') + `    - name: nuevo-server
      auto_approve:
        - ping
`);

    const res = await runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 1);
    const out = JSON.parse(res.stdout);
    assert.ok(out.issues.some(i => i.level === 'error' && /drift/.test(i.message)));
  });

  test('autoApprove "*" → warn (no falla) con mensaje de alcance', async (t) => {
    const dir = makeProjectWithServers(t, { broad: true });
    assert.equal((await runForge(['generate'], { cwd: dir })).status, 0);

    const res = await runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 0, 'warn no cambia el exit code');
    const out = JSON.parse(res.stdout);
    assert.equal(out.summary.errors, 0);
    assert.ok(out.issues.some(i =>
      i.level === 'warn' && /wild/.test(i.message) && /demasiado amplio/.test(i.message),
    ));
  });

  test('archivo ausente con mcp.servers declarados → error y exit 1', async (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal((await runForge(['generate'], { cwd: dir })).status, 0);
    unlinkSync(join(dir, POLICY_FILE));

    const res = await runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 1);
    const out = JSON.parse(res.stdout);
    assert.ok(out.issues.some(i => i.level === 'error' && /ausente/.test(i.message)));
  });

  test('archivo ausente sin mcp.servers → info y exit 0', async (t) => {
    const dir = makeProjectWithoutServers(t);
    const res = await runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.summary.errors, 0);
    assert.ok(out.issues.some(i => i.level === 'info' && /ausente/.test(i.message)));
  });

  test('archivo inválido contra el schema → error y exit 1', async (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal((await runForge(['generate'], { cwd: dir })).status, 0);

    const policy = readPolicy(dir);
    policy.defaultPolicy = 'allow'; // viola el const "deny"
    writeFileSync(join(dir, POLICY_FILE), JSON.stringify(policy, null, 2) + '\n');

    const res = await runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 1);
    const out = JSON.parse(res.stdout);
    assert.ok(out.issues.some(i => i.level === 'error' && /no valida contra/.test(i.message)));
  });

  test('desde un subdirectorio audita el archivo junto a project.yaml, no el cwd', async (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal((await runForge(['generate'], { cwd: dir })).status, 0);
    const sub = join(dir, 'src', 'nested');
    mkdirSync(sub, { recursive: true });

    // Caso limpio: encuentra la política real en la raíz del proyecto.
    let res = await runForge(['audit', '--mcp', '--json'], { cwd: sub });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    let out = JSON.parse(res.stdout);
    assert.ok(out.issues.some(i => i.level === 'ok' && /al día con project\.yaml/.test(i.message)));

    // Drift en el archivo REAL de la raíz se detecta igual desde el subdir,
    // aunque haya una copia limpia plantada en <subdir>/.forge/.
    mkdirSync(join(sub, '.forge'), { recursive: true });
    writeFileSync(join(sub, POLICY_FILE), readFileSync(join(dir, POLICY_FILE)));
    const policy = readPolicy(dir);
    policy.servers[0].autoApprove.push('drop_table');
    writeFileSync(join(dir, POLICY_FILE), JSON.stringify(policy, null, 2) + '\n');

    res = await runForge(['audit', '--mcp', '--json'], { cwd: sub });
    assert.equal(res.status, 1, 'drift en la raíz debe detectarse desde un subdirectorio');
    out = JSON.parse(res.stdout);
    assert.ok(out.issues.some(i => i.level === 'error' && /drift/.test(i.message)));
  });

  test('server name malicioso en el archivo no inyecta secuencias ANSI en la salida', async (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal((await runForge(['generate'], { cwd: dir })).status, 0);

    // Archivo adulterado que VALIDA contra el schema: server con secuencias
    // ANSI (cursor arriba + borrar línea) en name y autoApprove "*".
    const policy = readPolicy(dir);
    policy.servers.push({ name: 'evil\u001b[1A\u001b[2K', autoApprove: ['*'] });
    writeFileSync(join(dir, POLICY_FILE), JSON.stringify(policy, null, 2) + '\n');

    const res = await runForge(['audit', '--mcp'], { cwd: dir });
    assert.equal(res.status, 1, 'el drift debe fallar la auditoría');
    // El chequeo de alcance itera project.yaml (no el archivo): el server
    // inyectado no aparece y las secuencias de control no llegan a la salida.
    assert.ok(!res.stdout.includes('\u001b[1A'), 'la salida contiene cursor-up inyectado');
    assert.ok(!res.stdout.includes('\u001b[2K'), 'la salida contiene erase-line inyectado');
    assert.ok(!res.stdout.includes('evil'), 'el server del archivo no debe interpolarse');
  });
});
