// forge spec-probe — deterministic completeness gate for specs (SPEC-064).
//
// Covers:
//   1. probeSpec() is pure and deterministic; a well-formed spec (SPEC-061)
//      scores high, a spec with prose-only acceptance criteria scores low.
//   2. forge spec-probe CLI: report exits 0, --json shape, missing-file errors.
//
//   node --test test/spec-probe.test.mjs
//
// Build first: npm run build:all.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const CLI = join(DIST, 'cli.js');
const SPECS = join(__dirname, '..', '..', '..', 'docs', 'specs');

let SP; // spec-probe module
before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'spec-probe.js')), 'dist not built — run npm run build:all');
  SP = await import(pathToFileURL(join(DIST, 'lib', 'spec-probe.js')).href);
});

// A deliberately weak spec: acceptance criteria are prose, status is the raw
// template menu, and the alternatives column is unresolved.
const PROSE_SPEC = `# SPEC-999 prueba — spec mal formada

> Estado: DRAFT|REVIEW|APPROVED|IMPLEMENTED

## Contexto

Algo de contexto para que esta sección no quede vacía.

## Decisión

Una decisión cualquiera.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Hacerlo de otra forma | algo | algo | — |

## Criterios de aceptación

El sistema debería funcionar correctamente y ser razonablemente rápido.
Esperamos que los usuarios queden satisfechos con el resultado final.
`;

describe('probeSpec — pure, deterministic (SPEC-064)', () => {
  test('a well-formed spec (SPEC-061) scores high', () => {
    const md = readFileSync(join(SPECS, 'SPEC-061-analyze-onboard.md'), 'utf8');
    const probe = SP.probeSpec(md);
    assert.ok(probe.score >= 75, `well-formed spec should score >=75, got ${probe.score}`);
    assert.ok(['A', 'B'].includes(probe.grade), `grade should be A/B, got ${probe.grade}`);
    const checklist = probe.checks.find(c => c.id === 'acceptance-checklist');
    assert.equal(checklist.pass, true, 'SPEC-061 has a real "- [ ]" checklist');
    const status = probe.checks.find(c => c.id === 'status-single');
    assert.equal(status.pass, true, 'SPEC-061 has a single resolved status (APPROVED)');
  });

  test('a spec with prose criteria scores low', () => {
    const probe = SP.probeSpec(PROSE_SPEC);
    assert.ok(probe.score <= 60, `prose spec should score low, got ${probe.score}`);
    const checklist = probe.checks.find(c => c.id === 'acceptance-checklist');
    assert.equal(checklist.pass, false, 'prose criteria must fail the checklist check');
    const status = probe.checks.find(c => c.id === 'status-single');
    assert.equal(status.pass, false, 'the template menu must fail the status check');
    const alts = probe.checks.find(c => c.id === 'alternatives-resolved');
    assert.equal(alts.pass, false, 'an unresolved "Descartada por" must fail');
  });

  test('same input → identical output (deterministic)', () => {
    const a = JSON.stringify(SP.probeSpec(PROSE_SPEC));
    const b = JSON.stringify(SP.probeSpec(PROSE_SPEC));
    assert.equal(a, b, 'probeSpec must be deterministic');
  });

  test('score reflects the share of passing checks', () => {
    const md = readFileSync(join(SPECS, 'SPEC-061-analyze-onboard.md'), 'utf8');
    const probe = SP.probeSpec(md);
    const passing = probe.checks.filter(c => c.pass).length;
    assert.equal(probe.score, Math.round((passing / probe.checks.length) * 100));
  });
});

describe('forge spec-probe — CLI', () => {
  test('report exits 0 for a real spec', () => {
    const r = spawnSync('node', [CLI, 'spec-probe', join(SPECS, 'SPEC-061-analyze-onboard.md')], { encoding: 'utf8' });
    assert.equal(r.status, 0, `exit 0; stderr: ${r.stderr}`);
    assert.ok(/spec-probe/.test(r.stdout), 'prints the report header');
    assert.ok(/Grade:/.test(r.stdout), 'prints a grade');
  });

  test('--json exits 0 with a stable shape', () => {
    const r = spawnSync('node', [CLI, 'spec-probe', join(SPECS, 'SPEC-061-analyze-onboard.md'), '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, `exit 0; stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.equal(typeof parsed.score, 'number', 'has numeric score');
    assert.ok(Array.isArray(parsed.checks), 'has checks array');
    assert.ok(parsed.checks.every(c => typeof c.id === 'string' && typeof c.pass === 'boolean'), 'check shape');
  });

  test('a missing file exits non-zero', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-spec-probe-'));
    try {
      const r = spawnSync('node', [CLI, 'spec-probe', join(dir, 'nope.md')], { encoding: 'utf8' });
      assert.notEqual(r.status, 0, 'missing file is an error');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a prose-criteria spec exits 0 but reports failures in --json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-spec-probe-'));
    try {
      const f = join(dir, 'bad.md');
      writeFileSync(f, PROSE_SPEC);
      const r = spawnSync('node', [CLI, 'spec-probe', f, '--json'], { encoding: 'utf8' });
      assert.equal(r.status, 0, `report-only, exit 0; stderr: ${r.stderr}`);
      const parsed = JSON.parse(r.stdout);
      assert.ok(parsed.notes.length > 0, 'reports failing checks as notes');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
