// SPEC-069 — forge init --from <answers.json> (non-interactive init; GUI/CI enabler).
//
//   node --test test/init-from.test.mjs
//
// Build first: npm run build:all.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const CLI = join(DIST, 'cli.js');

let A; // init-answers module
before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'init-answers.js')), 'dist not built — run npm run build:all');
  A = await import(pathToFileURL(join(DIST, 'lib', 'init-answers.js')).href);
});

describe('loadAnswers — pure defaults (SPEC-069)', () => {
  test('derives slug from name and fills defaults', () => {
    const r = A.loadAnswers({ name: 'My Cool App' });
    assert.equal(r.slug, 'my-cool-app');
    assert.equal(r.mode, 'standard');
    assert.equal(r.runtime, 'claude-code');
    assert.equal(r.language, 'typescript');
    assert.deepEqual(r.testing, []);
    assert.deepEqual(r.skills, []);
    assert.deepEqual(r.profiles, []);
  });

  test('derives profiles from frameworks when not provided', () => {
    const r = A.loadAnswers({ name: 'x', frontend: 'nextjs', backend: 'laravel' });
    assert.ok(r.profiles.includes('nextjs-admin'), 'nextjs → nextjs-admin');
    assert.ok(r.profiles.includes('laravel'), 'laravel → laravel');
  });

  test('respects explicit profiles and slug', () => {
    const r = A.loadAnswers({ name: 'x', slug: 'custom', profiles: ['rust'] });
    assert.equal(r.slug, 'custom');
    assert.deepEqual(r.profiles, ['rust']);
  });

  test('invalid mode falls back to standard', () => {
    assert.equal(A.loadAnswers({ name: 'x', mode: 'bogus' }).mode, 'standard');
  });
});

describe('forge init --from — CLI', () => {
  function run(args, cwd) {
    return spawnSync('node', [CLI, 'init', ...args], { cwd, encoding: 'utf8', env: { ...process.env, FORGE_NO_BUN: '1' } });
  }

  test('creates project.yaml + .claude from an answers file (no prompts)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-from-'));
    try {
      writeFileSync(join(dir, 'answers.json'), JSON.stringify({
        name: 'Demo App', type: 'fullstack', backend: 'express', backendLanguage: 'typescript',
        frontend: 'nextjs', frontendLanguage: 'typescript', mode: 'standard', runtime: 'claude-code',
        testing: ['vitest'], skills: ['spec'],
      }));
      const r = run(['--from', 'answers.json'], dir);
      assert.equal(r.status, 0, `exit 0; ${r.stderr || r.stdout}`);
      assert.ok(existsSync(join(dir, 'project.yaml')), 'project.yaml written');
      const yaml = readFileSync(join(dir, 'project.yaml'), 'utf8');
      assert.match(yaml, /slug: "demo-app"/);
      assert.match(yaml, /nextjs-admin/);
      const agents = readdirSync(join(dir, '.claude', 'agents'));
      assert.ok(agents.includes('admin-engineer.md'), 'nextjs-admin profile agent installed');
      assert.ok(agents.includes('orchestrator.md'));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('--from --dry-run does not write project.yaml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-from-'));
    try {
      writeFileSync(join(dir, 'answers.json'), JSON.stringify({ name: 'Demo' }));
      const r = run(['--from', 'answers.json', '--dry-run'], dir);
      assert.equal(r.status, 0);
      assert.equal(existsSync(join(dir, 'project.yaml')), false, 'dry-run must not write');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('missing answers file → exit 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-from-'));
    try {
      const r = run(['--from', 'nope.json'], dir);
      assert.equal(r.status, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
