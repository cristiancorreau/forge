// forge analyze + /onboard skill (SPEC-061).
//
// Covers:
//   1. analyzeCode() is deterministic and reports languages, busiest dirs,
//      largest files, TODO/FIXME markers, test presence and suggested agents.
//   2. forge analyze CLI: --json shape, --write artifact.
//   3. The /onboard skill passes its own forge eval quality gate (dogfooding
//      the resilience category from SPEC-060).
//
//   node --test test/analyze.test.mjs
//
// Build first: npm run build:all.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const CLI = join(DIST, 'cli.js');
const ASSETS = join(__dirname, '..', 'assets');

let CA; // code-analysis module
let E;  // skill-eval module
before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'code-analysis.js')), 'dist not built — run npm run build:all');
  CA = await import(pathToFileURL(join(DIST, 'lib', 'code-analysis.js')).href);
  E = await import(pathToFileURL(join(DIST, 'lib', 'skill-eval.js')).href);
});

/** Build a small fixture repo with code, tests, markers and a manifest. */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'forge-analyze-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'demo-app', description: 'A demo', dependencies: { express: '^4' }, scripts: { test: 'node --test' },
  }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'index.ts'), 'export const x = 1;\n// TODO: refactor this\n// FIXME: handle errors\n');
  writeFileSync(join(dir, 'src', 'big.ts'), Array.from({ length: 120 }, (_, i) => `const v${i} = ${i};`).join('\n') + '\n');
  mkdirSync(join(dir, 'test'), { recursive: true });
  writeFileSync(join(dir, 'test', 'index.test.ts'), 'import "node:test";\n// HACK: flaky\n');
  return dir;
}

describe('analyzeCode — pure, deterministic (SPEC-061)', () => {
  test('reports languages, markers, tests and suggested agents', () => {
    const dir = makeRepo();
    try {
      const a = CA.analyzeCode(dir);
      assert.ok(a.languages.find(l => l.ext === 'ts'), 'detects .ts files');
      assert.equal(a.markers.total, 3, `3 markers (TODO/FIXME/HACK), got ${a.markers.total}`);
      assert.equal(a.markers.byKind.TODO, 1);
      assert.equal(a.markers.byKind.FIXME, 1);
      assert.equal(a.markers.byKind.HACK, 1);
      assert.equal(a.tests.present, true, 'detects test files');
      assert.ok(a.suggestedAgents.includes('docs-writer'), 'suggests docs-writer');
      assert.ok(a.suggestedAgents.includes('security-auditor'), 'suggests security-auditor');
      assert.ok(a.largestFiles[0].path.endsWith('big.ts'), 'big.ts is the largest file');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('same repo → identical output (deterministic)', () => {
    const dir = makeRepo();
    try {
      const a = JSON.stringify(CA.analyzeCode(dir));
      const b = JSON.stringify(CA.analyzeCode(dir));
      assert.equal(a, b, 'analyzeCode must be deterministic');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('ignores node_modules and build dirs', () => {
    const dir = makeRepo();
    try {
      mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', 'pkg', 'huge.ts'), Array.from({ length: 999 }, () => 'x').join('\n'));
      const a = CA.analyzeCode(dir);
      assert.ok(!a.largestFiles.some(f => f.path.includes('node_modules')), 'node_modules excluded');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('forge analyze — CLI', () => {
  test('--json exits 0 with a stable shape', () => {
    const dir = makeRepo();
    try {
      const r = spawnSync('node', [CLI, 'analyze', dir, '--json'], { encoding: 'utf8' });
      assert.equal(r.status, 0, `exit 0; stderr: ${r.stderr}`);
      const parsed = JSON.parse(r.stdout);
      assert.ok(parsed.project && Array.isArray(parsed.languages), 'has project + languages');
      assert.ok(Array.isArray(parsed.suggestedAgents), 'has suggestedAgents');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('--write saves docs/analysis/<date>-analysis.md', () => {
    const dir = makeRepo();
    try {
      const r = spawnSync('node', [CLI, 'analyze', dir, '--write'], { encoding: 'utf8' });
      assert.equal(r.status, 0, `exit 0; stderr: ${r.stderr}`);
      const outDir = join(dir, 'docs', 'analysis');
      const files = readdirSync(outDir).filter(f => f.endsWith('-analysis.md'));
      assert.equal(files.length, 1, 'one analysis artifact written');
      const md = readFileSync(join(outDir, files[0]), 'utf8');
      assert.ok(/Análisis del proyecto/.test(md), 'artifact has the heading');
      assert.ok(/\/onboard/.test(md), 'artifact points to /onboard');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('/onboard skill — dogfoods the quality gate', () => {
  test('onboard SKILL.md passes forge eval (>=75 / min >=6, incl. resilience)', () => {
    const md = readFileSync(join(ASSETS, 'core', 'skills', 'onboard', 'SKILL.md'), 'utf8');
    const ev = E.evalSkill(md);
    const gate = E.checkQualityGate(ev);
    assert.equal(gate.pass, true, `onboard must pass its gate; overall=${ev.overallScore}, reason=${gate.reason}`);
    const resilience = ev.categories.find(c => c.id === 'resilience');
    assert.ok(resilience.score >= 6, `onboard resilience ${resilience.score} >= 6`);
  });
});
