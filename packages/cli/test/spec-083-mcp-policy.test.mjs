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

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync, unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const CLI = join(DIST, 'cli.js');
const POLICY_FILE = '.forge/mcp-policy.json';
const SCHEMA_PATH = join(
  __dirname, '..', '..', 'schemas', 'schemas', 'mcp-policy.schema.json',
);

let MCP_POLICY_SCHEMA, buildMcpPolicy;
before(async () => {
  assert.ok(existsSync(CLI), 'dist/cli.js no existe — correr npm run build:all primero');
  assert.ok(existsSync(SCHEMA_PATH), 'packages/schemas/schemas/mcp-policy.schema.json no existe');
  const mod = await import(pathToFileURL(join(DIST, 'lib', 'mcp-policy.js')).href);
  MCP_POLICY_SCHEMA = mod.MCP_POLICY_SCHEMA;
  buildMcpPolicy = mod.buildMcpPolicy;
});

/** Corre la CLI compilada. Devuelve { status, stdout, stderr }. */
function runForge(args, opts = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, FORGE_HOME: '', FORGE_NO_BUN: '1', FORGE_NO_DASHBOARD: '1' },
  });
  return { status: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
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
  test('emite la política derivada de project.yaml y valida contra el schema', (t) => {
    const dir = makeProjectWithServers(t);
    const res = runForge(['generate'], { cwd: dir });
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

  test('determinista: dos corridas producen bytes idénticos (sin timestamps)', (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal(runForge(['generate'], { cwd: dir }).status, 0);
    const first = readFileSync(join(dir, POLICY_FILE));
    assert.equal(runForge(['generate', '--force'], { cwd: dir }).status, 0);
    const second = readFileSync(join(dir, POLICY_FILE));
    assert.ok(first.equals(second), 'las dos corridas difieren byte a byte');
  });

  test('sin mcp.servers declarados emite la política vacía con defaultPolicy deny', (t) => {
    const dir = makeProjectWithoutServers(t);
    const res = runForge(['generate'], { cwd: dir });
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
  test('caso limpio: política al día → exit 0 y contrato JSON schemaVersion "1"', (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal(runForge(['generate'], { cwd: dir }).status, 0);

    const res = runForge(['audit', '--mcp', '--json'], { cwd: dir });
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

  test('drift: archivo editado a mano → error y exit 1', (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal(runForge(['generate'], { cwd: dir }).status, 0);

    // Edición manual: se auto-aprueba una tool que project.yaml no declara.
    const policyPath = join(dir, POLICY_FILE);
    const policy = readPolicy(dir);
    policy.servers[0].autoApprove.push('drop_table');
    writeFileSync(policyPath, JSON.stringify(policy, null, 2) + '\n');

    const res = runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 1, 'drift debe fallar la auditoría');
    const out = JSON.parse(res.stdout);
    assert.ok(out.issues.some(i => i.level === 'error' && /drift/.test(i.message)));
  });

  test('drift: project.yaml cambió después de generar → error y exit 1', (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal(runForge(['generate'], { cwd: dir }).status, 0);

    // La política quedó desactualizada: se agrega un server a project.yaml.
    const yamlPath = join(dir, 'project.yaml');
    writeFileSync(yamlPath, readFileSync(yamlPath, 'utf-8') + `    - name: nuevo-server
      auto_approve:
        - ping
`);

    const res = runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 1);
    const out = JSON.parse(res.stdout);
    assert.ok(out.issues.some(i => i.level === 'error' && /drift/.test(i.message)));
  });

  test('autoApprove "*" → warn (no falla) con mensaje de alcance', (t) => {
    const dir = makeProjectWithServers(t, { broad: true });
    assert.equal(runForge(['generate'], { cwd: dir }).status, 0);

    const res = runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 0, 'warn no cambia el exit code');
    const out = JSON.parse(res.stdout);
    assert.equal(out.summary.errors, 0);
    assert.ok(out.issues.some(i =>
      i.level === 'warn' && /wild/.test(i.message) && /demasiado amplio/.test(i.message),
    ));
  });

  test('archivo ausente con mcp.servers declarados → error y exit 1', (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal(runForge(['generate'], { cwd: dir }).status, 0);
    unlinkSync(join(dir, POLICY_FILE));

    const res = runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 1);
    const out = JSON.parse(res.stdout);
    assert.ok(out.issues.some(i => i.level === 'error' && /ausente/.test(i.message)));
  });

  test('archivo ausente sin mcp.servers → info y exit 0', (t) => {
    const dir = makeProjectWithoutServers(t);
    const res = runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.summary.errors, 0);
    assert.ok(out.issues.some(i => i.level === 'info' && /ausente/.test(i.message)));
  });

  test('archivo inválido contra el schema → error y exit 1', (t) => {
    const dir = makeProjectWithServers(t);
    assert.equal(runForge(['generate'], { cwd: dir }).status, 0);

    const policy = readPolicy(dir);
    policy.defaultPolicy = 'allow'; // viola el const "deny"
    writeFileSync(join(dir, POLICY_FILE), JSON.stringify(policy, null, 2) + '\n');

    const res = runForge(['audit', '--mcp', '--json'], { cwd: dir });
    assert.equal(res.status, 1);
    const out = JSON.parse(res.stdout);
    assert.ok(out.issues.some(i => i.level === 'error' && /no valida contra/.test(i.message)));
  });
});
