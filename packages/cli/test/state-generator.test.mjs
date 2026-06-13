// State artifact generator tests (SPEC-062).
//
// Verifies that generateState() is pure/deterministic and emits the expected
// content for STATE.md / PLAN.md / CONTEXT.md. Imports the compiled module
// directly from dist/ — does not run the CLI binary.
//
//     node --test test/state-generator.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

const CONFIG = {
  project: {
    name: 'Test Project',
    slug: 'test-project',
    description: 'Una misión de prueba.',
    language: 'typescript',
    mode: 'standard',
    status: 'active',
  },
  stack: {
    backend: 'express',
    frontend: 'react',
    database: 'postgres',
    testing: ['vitest'],
  },
  agents: {
    active: ['orchestrator', 'backend-engineer', 'frontend-engineer'],
    compliance: [],
    specialized: [],
    profiles: [],
  },
  runtimes: { active: ['claude-code'] },
  sprint: { current: 2 },
};

const SPECS = [
  { id: 'SPEC-062-forge-state-artifact', title: 'SPEC-062 Estado', status: 'APPROVED' },
  { id: 'SPEC-010-something', title: 'SPEC-010 Otra cosa', status: 'DRAFT' },
  { id: 'SPEC-005-done', title: 'SPEC-005 Hecha', status: 'IMPLEMENTED' },
];

let generateState;
let readSpecSummaries;
let STATE_FILES;

before(async () => {
  assert.ok(existsSync(DIST), `dist/ not found at ${DIST}. Run "npm run build:all" first.`);
  const mod = await import(pathToFileURL(join(DIST, 'lib', 'generators', 'state.js')).href);
  generateState = mod.generateState;
  readSpecSummaries = mod.readSpecSummaries;
  STATE_FILES = mod.STATE_FILES;
});

describe('generateState — SPEC-062', () => {
  test('returns the three artifact files as strings', () => {
    const out = generateState(CONFIG, SPECS);
    for (const key of ['STATE.md', 'PLAN.md', 'CONTEXT.md']) {
      assert.ok(typeof out[key] === 'string' && out[key].length > 0, `${key} must be a non-empty string`);
    }
  });

  test('STATE_FILES lists the three artifact paths', () => {
    assert.deepStrictEqual([...STATE_FILES], [
      '.forge/state/STATE.md',
      '.forge/state/PLAN.md',
      '.forge/state/CONTEXT.md',
    ]);
  });

  test('is pure: same input → identical output', () => {
    const a = generateState(CONFIG, SPECS);
    const b = generateState(CONFIG, SPECS);
    assert.deepStrictEqual(a, b);
  });

  test('is deterministic regardless of spec input order', () => {
    const a = generateState(CONFIG, SPECS);
    const reversed = generateState(CONFIG, [...SPECS].reverse());
    assert.deepStrictEqual(a, reversed, 'spec ordering must not change the output');
  });

  test('does not mutate the input specs array', () => {
    const input = [...SPECS];
    const snapshot = JSON.stringify(input);
    generateState(CONFIG, input);
    assert.strictEqual(JSON.stringify(input), snapshot, 'input specs must not be mutated');
  });

  test('every file carries the generated-by-forge header (no editar a mano)', () => {
    const out = generateState(CONFIG, SPECS);
    for (const key of ['STATE.md', 'PLAN.md', 'CONTEXT.md']) {
      assert.ok(out[key].includes('generado por forge'), `${key} must declare it is forge-generated`);
      assert.ok(out[key].includes('no editar a mano'), `${key} must warn against hand-editing`);
    }
  });

  test('STATE.md includes mode, runtime, sprint and agents', () => {
    const { 'STATE.md': state } = generateState(CONFIG, SPECS);
    assert.ok(state.includes('Test Project'));
    assert.ok(state.includes('standard'), 'mode');
    assert.ok(state.includes('claude-code'), 'runtime');
    assert.ok(state.includes('Sprint 2'), 'sprint');
    assert.ok(state.includes('orchestrator'), 'agent');
    assert.ok(state.includes('backend-engineer'), 'agent');
  });

  test('PLAN.md groups specs by status in a deterministic order', () => {
    const { 'PLAN.md': plan } = generateState(CONFIG, SPECS);
    assert.ok(plan.includes('### APPROVED'));
    assert.ok(plan.includes('### DRAFT'));
    assert.ok(plan.includes('### IMPLEMENTED'));
    assert.ok(plan.includes('SPEC-062-forge-state-artifact'));
    // APPROVED group must come before DRAFT, which comes before IMPLEMENTED.
    const iApproved = plan.indexOf('### APPROVED');
    const iDraft = plan.indexOf('### DRAFT');
    const iImpl = plan.indexOf('### IMPLEMENTED');
    assert.ok(iApproved < iDraft && iDraft < iImpl, 'status groups must be ordered APPROVED < DRAFT < IMPLEMENTED');
  });

  test('CONTEXT.md includes mission, stack and commands', () => {
    const { 'CONTEXT.md': ctx } = generateState(CONFIG, SPECS);
    assert.ok(ctx.includes('Una misión de prueba.'), 'mission');
    assert.ok(ctx.includes('express'), 'backend');
    assert.ok(ctx.includes('react'), 'frontend');
    assert.ok(ctx.includes('postgres'), 'database');
    assert.ok(ctx.includes('pnpm test'), 'commands');
  });

  test('handles empty specs gracefully', () => {
    const out = generateState(CONFIG, []);
    assert.ok(out['PLAN.md'].includes('Sin specs'), 'PLAN.md must note the absence of specs');
  });

  test('handles missing optional config fields', () => {
    const minimal = { project: { name: 'Bare', mode: 'startup' } };
    const out = generateState(minimal, []);
    assert.ok(out['STATE.md'].includes('Bare'));
    assert.ok(out['STATE.md'].includes('startup'));
    assert.ok(out['CONTEXT.md'].includes('Sin misión'), 'CONTEXT.md must fall back when no description');
  });
});

describe('readSpecSummaries — SPEC-062', () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-specs-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SPEC-100-foo.md'), '# SPEC-100 Foo\n\n> Estado: APPROVED\n\nbody\n');
    writeFileSync(join(dir, 'SPEC-101-bar.md'), '# SPEC-101 Bar\n\n> Status: DRAFT\n\nbody\n');
    writeFileSync(join(dir, 'SPEC-102-baz.md'), '# SPEC-102 Baz\n\nno status line\n');
    // Scaffold files that must be ignored.
    writeFileSync(join(dir, '_template.md'), '# Template\n\n> Estado: TEMPLATE\n');
    writeFileSync(join(dir, 'README.md'), '# Readme\n');
    writeFileSync(join(dir, 'notes.txt'), 'not a spec');
  });

  test('parses title and status, ignoring scaffold/non-md files', () => {
    const specs = readSpecSummaries(dir);
    const ids = specs.map(s => s.id).sort();
    assert.deepStrictEqual(ids, ['SPEC-100-foo', 'SPEC-101-bar', 'SPEC-102-baz']);
    const foo = specs.find(s => s.id === 'SPEC-100-foo');
    assert.strictEqual(foo.title, 'SPEC-100 Foo');
    assert.strictEqual(foo.status, 'APPROVED');
    const bar = specs.find(s => s.id === 'SPEC-101-bar');
    assert.strictEqual(bar.status, 'DRAFT', 'must accept the English "Status:" label');
    const baz = specs.find(s => s.id === 'SPEC-102-baz');
    assert.strictEqual(baz.status, 'SIN ESTADO', 'missing status falls back');
  });

  test('returns [] for a non-existent directory', () => {
    assert.deepStrictEqual(readSpecSummaries(join(dir, 'does-not-exist')), []);
  });

  test('integrates with generateState end-to-end', () => {
    const out = generateState(CONFIG, readSpecSummaries(dir));
    assert.ok(out['PLAN.md'].includes('SPEC-100-foo'));
    assert.ok(out['PLAN.md'].includes('### APPROVED'));
  });
});
