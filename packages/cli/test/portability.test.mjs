// `forge port <runtime>` — portability matrix + report (SPEC-073).
//
//   node --test test/portability.test.mjs
//
// The CLI must be built first (npm run build:all).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

const NEXTJS = `project: {name: T, slug: t, language: typescript, mode: standard, status: active}
stack: {frontend: nextjs}
agents: {active: [orchestrator, backend-engineer], compliance: [], profiles: [nextjs-admin]}
compliance: {frameworks: [GDPR]}
mcp: {servers: [{name: context7}]}
runtimes: {active: [claude-code]}
`;

function projectDir(yaml = NEXTJS) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-port-'));
  writeFileSync(join(dir, 'project.yaml'), yaml);
  return dir;
}

function run(dir, args) {
  return spawnSync('node', [CLI, 'port', ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, FORGE_NO_BUN: '1' },
  });
}

describe('forge port — portability matrix', () => {
  test('--json emits a well-formed matrix; counts sum to total', () => {
    const dir = projectDir();
    try {
      const r = run(dir, ['codex', '--json']);
      assert.equal(r.status, 0, r.stderr);
      const m = JSON.parse(r.stdout);
      assert.equal(m.target, 'codex');
      assert.ok(Array.isArray(m.dimensions) && m.dimensions.length > 0);
      const { portable, adapted, vendor, total } = m.summary;
      assert.equal(portable + adapted + vendor, total);
      assert.equal(total, m.dimensions.length);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('project.yaml and MCP are portable; runtime config is vendor', () => {
    const dir = projectDir();
    try {
      const m = JSON.parse(run(dir, ['codex', '--json']).stdout);
      const by = Object.fromEntries(m.dimensions.map(d => [d.id, d.portability]));
      assert.equal(by['source-config'], 'portable');
      assert.equal(by['mcp'], 'portable');
      assert.equal(by['specs'], 'portable');
      assert.equal(by['runtime-config'], 'vendor');
      assert.equal(by['agents'], 'adapted');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('hooks are adapted for a native target (codex) but vendor for a rules target (cursor)', () => {
    const dir = projectDir();
    try {
      const codex = JSON.parse(run(dir, ['codex', '--json']).stdout);
      const cursor = JSON.parse(run(dir, ['cursor', '--json']).stdout);
      const hook = (m) => m.dimensions.find(d => d.id === 'hooks').portability;
      assert.equal(hook(codex), 'adapted', 'codex gets the .githooks fallback');
      assert.equal(hook(cursor), 'vendor', 'cursor has no hook mechanism');
      // rules-based runtimes also lose automatic context ingestion
      const ctx = (m) => m.dimensions.find(d => d.id === 'context').portability;
      assert.equal(ctx(cursor), 'vendor');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('compliance dimension only appears when frameworks are declared', () => {
    const withC = projectDir();
    const noC = projectDir(`project: {name: T, slug: t, language: typescript, mode: standard, status: active}
stack: {frontend: nextjs}
agents: {active: [orchestrator], compliance: [], profiles: []}
runtimes: {active: [claude-code]}
`);
    try {
      const a = JSON.parse(run(withC, ['codex', '--json']).stdout);
      const b = JSON.parse(run(noC, ['codex', '--json']).stdout);
      assert.ok(a.dimensions.some(d => d.id === 'compliance'));
      assert.ok(!b.dimensions.some(d => d.id === 'compliance'));
    } finally {
      rmSync(withC, { recursive: true, force: true });
      rmSync(noC, { recursive: true, force: true });
    }
  });
});

describe('forge port — file generation', () => {
  test('--report writes the report but NOT the native config', () => {
    const dir = projectDir();
    try {
      const r = run(dir, ['codex', '--report']);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(existsSync(join(dir, '.forge', 'port', 'codex-report.md')), 'report written');
      assert.ok(!existsSync(join(dir, 'AGENTS.md')), 'native config NOT written in report mode');
      const md = readFileSync(join(dir, '.forge', 'port', 'codex-report.md'), 'utf8');
      assert.match(md, /Portabilidad: project\.yaml → Codex CLI/);
      assert.match(md, /## Resumen/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('default mode generates the native config AND the report', () => {
    const dir = projectDir();
    try {
      const r = run(dir, ['codex']);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(existsSync(join(dir, 'AGENTS.md')), 'codex native config written');
      assert.ok(existsSync(join(dir, '.forge', 'port', 'codex-report.md')), 'report written');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('--dry-run writes nothing', () => {
    const dir = projectDir();
    try {
      const r = run(dir, ['codex', '--dry-run']);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(!existsSync(join(dir, 'AGENTS.md')));
      assert.ok(!existsSync(join(dir, '.forge', 'port', 'codex-report.md')));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('unknown runtime exits 1', () => {
    const dir = projectDir();
    try {
      const r = run(dir, ['nope']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /runtime desconocido/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('missing project.yaml exits 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-port-empty-'));
    try {
      const r = run(dir, ['codex']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /no se encontró project\.yaml/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
