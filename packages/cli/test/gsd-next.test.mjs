// Tier "next/later" del análisis vs Open GSD:
//   SPEC-066 guard de consistencia de gestor de paquetes (pre-bash-check.js)
//   SPEC-067 catálogo gsd-browser/gsd-test-runner + recommend
//   SPEC-068 hook PreCompact (precompact-headroom.js) re-ancla a .forge/state/
//
//   node --test test/gsd-next.test.mjs
//
// Build first: npm run build:all.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const DIST = join(__dirname, '..', 'dist');
const BASH_HOOK = join(REPO_ROOT, 'core', 'hooks', 'pre-bash-check.js');
const PRECOMPACT_HOOK = join(REPO_ROOT, 'core', 'hooks', 'precompact-headroom.js');

function runHook(hook, payload, cwd) {
  const res = spawnSync(process.execPath, [hook], {
    cwd, input: JSON.stringify(payload), encoding: 'utf-8',
    env: { ...process.env, DEBUG: '' },
  });
  return { status: res.status ?? 0, out: (res.stdout ?? '') + (res.stderr ?? '') };
}

describe('SPEC-066 — package-manager consistency guard', () => {
  function withProject(pm) {
    const dir = mkdtempSync(join(tmpdir(), 'forge-pm-'));
    writeFileSync(join(dir, 'project.yaml'),
      `project:\n  name: t\n  mode: standard\nstack:\n  package_manager: ${pm}\n`);
    return dir;
  }
  const bash = (cmd, cwd) => runHook(BASH_HOOK, { tool_name: 'Bash', tool_input: { command: cmd } }, cwd);

  test('warns when command uses a different package manager (declared pnpm, runs npm install)', () => {
    const dir = withProject('pnpm');
    try {
      const { status, out } = bash('npm install lodash', dir);
      assert.equal(status, 0, 'advisory only, never blocks');
      assert.match(out, /inconsistencia de gestor de paquetes/);
      assert.match(out, /declara "pnpm".*usa "npm"/s);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('no warning when command matches the declared package manager', () => {
    const dir = withProject('pnpm');
    try {
      const { status, out } = bash('pnpm install', dir);
      assert.equal(status, 0);
      assert.doesNotMatch(out, /inconsistencia de gestor/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('no warning when stack.package_manager is not declared', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-pm-'));
    writeFileSync(join(dir, 'project.yaml'), 'project:\n  name: t\n');
    try {
      const { status, out } = bash('npm install', dir);
      assert.equal(status, 0);
      assert.doesNotMatch(out, /inconsistencia de gestor/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('SPEC-068 — precompact-headroom hook', () => {
  test('reminds to re-anchor when .forge/state/STATE.md exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-pc-'));
    mkdirSync(join(dir, '.forge', 'state'), { recursive: true });
    writeFileSync(join(dir, '.forge', 'state', 'STATE.md'), '# Estado\n\nSprint actual: Sprint 1\n');
    try {
      const { status, out } = runHook(PRECOMPACT_HOOK, {}, dir);
      assert.equal(status, 0);
      assert.match(out, /\.forge\/state\/STATE\.md/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('exits 0 quietly when no STATE.md is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-pc-'));
    try {
      const { status, out } = runHook(PRECOMPACT_HOOK, {}, dir);
      assert.equal(status, 0);
      assert.equal(out.trim(), '');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('SPEC-067 — gsd ecosystem in catalog + recommend', () => {
  let catalog, recommendLib;
  before(async () => {
    catalog = await import(pathToFileURL(join(DIST, 'lib', 'catalog-unified.js')).href);
    recommendLib = await import(pathToFileURL(join(DIST, 'lib', 'recommend.js')).href);
  });

  test('catalog includes gsd-browser (mcp-server) and gsd-test-runner (tool)', () => {
    const items = catalog.getCuratedItems();
    const browser = items.find(i => i.id === 'gsd-browser');
    assert.ok(browser, 'gsd-browser present');
    assert.equal(browser.type, 'mcp-server');
    assert.ok(browser.tags.includes('cdp'));
    assert.ok(items.some(i => /gsd-test-runner/.test(i.id) && i.type === 'tool'), 'gsd-test-runner present as tool');
  });

  test('recommend suggests gsd-browser for frontend + E2E (playwright)', () => {
    const stack = {
      backend: null, frontend: 'nextjs', mobile: null, language: 'typescript',
      orm: null, database: null, hasDocker: false, testing: ['playwright'],
    };
    const signals = recommendLib.collectSignals(stack, mkdtempSync(join(tmpdir(), 'forge-rec-')));
    assert.ok(signals.some(s => s.targetId === 'gsd-browser'), `expected gsd-browser signal, got ${signals.map(s => s.targetId).join(',')}`);
  });
});
