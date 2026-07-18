// SPEC-083 P2+P3 — contrato JSON estable + exit codes de la CLI.
//
// Fija el contrato machine-readable que un orquestador (mingako) consume:
//   - `forge export --json` valida contra export.schema.json (forge-schemas).
//   - audit / recommend / doctor / port emiten --json con schemaVersion "1"
//     y claves estables; los exit codes son deterministas.
//
// Corre la CLI compilada (dist/cli.js) via child_process, como commands.test.mjs.
// Requiere build previo (npm run build:all).
//
//     node --test test/spec-083-json-contract.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');
const EXPORT_SCHEMA_PATH = join(
  __dirname, '..', '..', 'schemas', 'schemas', 'export.schema.json',
);

before(() => {
  assert.ok(existsSync(CLI), 'dist/cli.js no existe — correr npm run build:all primero');
  assert.ok(existsSync(EXPORT_SCHEMA_PATH), 'packages/schemas/schemas/export.schema.json no existe');
});

/** Run the compiled CLI. Returns { status, stdout, stderr }. */
function runForge(args, opts = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, FORGE_HOME: '' },
  });
  return { status: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-083-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Fixture: proyecto forge mínimo con agente, comando, skills y MCP server. */
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
  - /plan
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
  writeFileSync(join(dir, '.claude', 'commands', 'plan.md'), '# plan\n');
  return dir;
}

describe('SPEC-083 P2 — forge export --json', () => {
  test('emite el modelo resuelto, valida contra export.schema.json y sale 0', (t) => {
    const dir = makeFixtureProject(t);
    const res = runForge(['export', '--json'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr);

    const model = JSON.parse(res.stdout);
    // Claves estables del contrato.
    assert.equal(model.schemaVersion, '1');
    assert.equal(model.project.name, 'demo');
    assert.equal(model.project.mode, 'standard');
    assert.deepEqual(model.project.runtimes, ['claude-code']);
    assert.deepEqual(model.project.profiles, []);
    assert.deepEqual(model.skills, ['audit', 'plan'], 'skills normalizadas sin slash y con orden estable');
    assert.deepEqual(model.mcpServers, [{ name: 'postgres', autoApprove: ['query'] }]);
    assert.deepEqual(model.commands, [{ name: 'plan', sourceFile: '.claude/commands/plan.md' }]);

    // Agente resuelto desde el frontmatter.
    assert.equal(model.agents.length, 1);
    const agent = model.agents[0];
    assert.equal(agent.name, 'demo-agent');
    assert.equal(agent.description, 'Agente de prueba');
    assert.equal(agent.model, 'sonnet');
    assert.deepEqual(agent.tools, ['Read', 'Edit']);
    assert.equal(agent.sourceFile, '.claude/agents/demo-agent.md');

    // Desglose por runtime activo.
    assert.equal(model.perRuntime['claude-code'].kind, 'native');
    assert.ok(model.perRuntime['claude-code'].surfaces.includes('CLAUDE.md'));

    // Validación formal contra el schema publicado en forge-schemas.
    const schema = JSON.parse(readFileSync(EXPORT_SCHEMA_PATH, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    assert.equal(validate(model), true, JSON.stringify(validate.errors, null, 2));
  });

  test('round-trip (SPEC-083 P2): export → generate --force → export emite el mismo JSON', (t) => {
    const dir = makeFixtureProject(t);
    const first = runForge(['export', '--json'], { cwd: dir });
    assert.equal(first.status, 0, first.stderr);

    const gen = runForge(['generate', '--force'], { cwd: dir });
    assert.equal(gen.status, 0, gen.stderr);

    const second = runForge(['export', '--json'], { cwd: dir });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(
      second.stdout, first.stdout,
      'el modelo exportado es estable tras regenerar (project.yaml → export → generate → export)',
    );
  });

  test('project.yaml con name vacío y runtime vacío: fallback y filtrado, valida contra el schema', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'project.yaml'), `project:
  name: ""
runtimes:
  active:
    - ""
    - claude-code
`);
    const res = runForge(['export', '--json'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr);
    const model = JSON.parse(res.stdout);
    assert.equal(model.project.name, '(sin nombre)', 'name vacío cae al placeholder');
    assert.deepEqual(model.project.runtimes, ['claude-code'], 'ids de runtime vacíos filtrados');

    const schema = JSON.parse(readFileSync(EXPORT_SCHEMA_PATH, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    assert.equal(validate(model), true, JSON.stringify(validate.errors, null, 2));
  });

  test('sin project.yaml sale 1 con mensaje en stderr', (t) => {
    const dir = makeTmpDir(t);
    const res = runForge(['export', '--json'], { cwd: dir });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /project\.yaml/);
    assert.equal(res.stdout.trim(), '', 'no emite JSON parcial en error');
  });

  test('sin --json imprime un resumen humano corto y sale 0', (t) => {
    const dir = makeFixtureProject(t);
    const res = runForge(['export'], { cwd: dir });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /forge export/);
    assert.match(res.stdout, /Agentes/);
    assert.doesNotThrow(() => {
      assert.throws(() => JSON.parse(res.stdout));
    }, 'el modo humano no es JSON');
  });
});

describe('SPEC-083 P3 — --json con schemaVersion y exit codes estables', () => {
  test('audit --json: schemaVersion "1", summary + issues, exit consistente con errors', (t) => {
    const dir = makeFixtureProject(t);
    const res = runForge(['audit', '--json'], { cwd: dir });
    const report = JSON.parse(res.stdout);
    assert.equal(report.schemaVersion, '1');
    for (const key of ['errors', 'warnings', 'ok', 'info']) {
      assert.equal(typeof report.summary[key], 'number', `summary.${key} numérico`);
    }
    assert.ok(Array.isArray(report.issues));
    for (const issue of report.issues) {
      assert.ok(['error', 'warn', 'info', 'ok'].includes(issue.level));
      assert.equal(typeof issue.check, 'string');
      assert.equal(typeof issue.message, 'string');
    }
    // Contrato de exit code: 0 sin errores, 1 con errores.
    assert.equal(res.status, report.summary.errors > 0 ? 1 : 0);
  });

  test('doctor --json: schemaVersion "1", claves estables, exit consistente con ok', (t) => {
    const dir = makeTmpDir(t);
    const res = runForge(['doctor', '--json'], { cwd: dir });
    const report = JSON.parse(res.stdout);
    assert.equal(report.schemaVersion, '1');
    assert.equal(typeof report.ok, 'boolean');
    assert.equal(typeof report.nodeVersion, 'string');
    assert.equal(typeof report.forgeRootOk, 'boolean');
    assert.equal(typeof report.assetsOk, 'boolean');
    assert.ok(Array.isArray(report.runtimes));
    for (const rt of report.runtimes) {
      assert.equal(typeof rt.id, 'string');
      assert.equal(typeof rt.installed, 'boolean');
      assert.equal(typeof rt.active, 'boolean');
    }
    // Contrato de exit code: 0 si ok, 1 si no.
    assert.equal(res.status, report.ok ? 0 : 1);
  });

  test('recommend --json: schemaVersion "1", stack + recommendations, exit 0', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '15' } }));
    const res = runForge(['recommend', '--json'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.schemaVersion, '1');
    assert.equal(typeof out.stack, 'object');
    assert.ok(Array.isArray(out.recommendations));
    for (const r of out.recommendations) {
      assert.equal(typeof r.type, 'string');
      assert.equal(typeof r.id, 'string');
      assert.equal(typeof r.installable, 'boolean');
      assert.equal(typeof r.why, 'string');
      assert.equal(typeof r.signal, 'string');
    }
  });

  test('port <runtime> --json: schemaVersion "1", matriz estable, exit 0', (t) => {
    const dir = makeFixtureProject(t);
    const res = runForge(['port', 'codex', '--json'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr);
    const matrix = JSON.parse(res.stdout);
    assert.equal(matrix.schemaVersion, '1');
    assert.equal(matrix.target, 'codex');
    assert.ok(Array.isArray(matrix.dimensions) && matrix.dimensions.length > 0);
    for (const d of matrix.dimensions) {
      assert.equal(typeof d.id, 'string');
      assert.ok(['portable', 'adapted', 'vendor'].includes(d.portability));
    }
    const s = matrix.summary;
    assert.equal(s.portable + s.adapted + s.vendor, s.total);
  });

  test('port sin runtime destino sale 1 (error de ejecución)', (t) => {
    const dir = makeFixtureProject(t);
    const res = runForge(['port', '--json'], { cwd: dir });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /runtime/);
  });
});
