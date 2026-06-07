// Registry unit tests (SPEC-056).
//
// Verifies that the runtime registry is internally consistent and that each
// descriptor produces valid surfaces. Does NOT run the CLI binary — it imports
// the compiled registry module directly from dist/.
//
//     node --test test/registry.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

/** Minimal ProjectYaml config used to call surfaces(). */
const MINIMAL_CONFIG = {
  project: {
    name: 'Test Project',
    slug: 'test-project',
    description: 'A test project',
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
};

let RUNTIMES;
let getRuntime;
let runtimeIds;

before(async () => {
  assert.ok(
    existsSync(DIST),
    `dist/ not found at ${DIST}. Run "npm run build:all" first.`
  );
  const mod = await import(pathToFileURL(join(DIST, 'lib', 'generators', 'registry.js')).href);
  RUNTIMES = mod.RUNTIMES;
  getRuntime = mod.getRuntime;
  runtimeIds = mod.runtimeIds;
});

describe('forge runtime registry — SPEC-056', () => {
  test('registry exports RUNTIMES array with at least 15 entries', () => {
    assert.ok(Array.isArray(RUNTIMES), 'RUNTIMES must be an array');
    assert.ok(RUNTIMES.length >= 15, `Expected >=15 runtimes, got ${RUNTIMES.length}`);
  });

  test('runtimeIds() returns all IDs matching RUNTIMES', () => {
    const ids = runtimeIds();
    assert.ok(Array.isArray(ids));
    assert.strictEqual(ids.length, RUNTIMES.length);
    for (const r of RUNTIMES) {
      assert.ok(ids.includes(r.id), `runtimeIds() missing '${r.id}'`);
    }
  });

  test('getRuntime() finds every registered runtime by id', () => {
    for (const r of RUNTIMES) {
      const found = getRuntime(r.id);
      assert.ok(found, `getRuntime('${r.id}') returned undefined`);
      assert.strictEqual(found.id, r.id);
    }
  });

  test('getRuntime() returns undefined for unknown id', () => {
    assert.strictEqual(getRuntime('nonexistent-runtime-xyz'), undefined);
  });

  test('every descriptor has id, label, kind, and surfaces function', () => {
    for (const r of RUNTIMES) {
      assert.ok(typeof r.id === 'string' && r.id.length > 0, `${r.id}: id must be a non-empty string`);
      assert.ok(typeof r.label === 'string' && r.label.length > 0, `${r.id}: label must be a non-empty string`);
      assert.ok(r.kind === 'native' || r.kind === 'rules', `${r.id}: kind must be 'native' or 'rules'`);
      assert.ok(typeof r.surfaces === 'function', `${r.id}: surfaces must be a function`);
    }
  });

  test('every runtime produces >=1 surface with non-empty path and content', () => {
    for (const r of RUNTIMES) {
      const surfaces = r.surfaces(MINIMAL_CONFIG);
      assert.ok(Array.isArray(surfaces) && surfaces.length >= 1,
        `${r.id}: surfaces() must return >=1 surface`);
      for (const s of surfaces) {
        assert.ok(typeof s.path === 'string' && s.path.length > 0,
          `${r.id}: surface path must be a non-empty string (got '${s.path}')`);
        assert.ok(typeof s.content === 'string' && s.content.length > 0,
          `${r.id}: surface content must be non-empty`);
      }
    }
  });

  test('no two runtimes share the same id', () => {
    const ids = RUNTIMES.map(r => r.id);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length, `Duplicate runtime IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
  });

  // (b) The 4 existing runtimes generate their key surfaces.
  describe('existing runtimes — key surfaces', () => {
    test('claude-code generates CLAUDE.md', () => {
      const r = getRuntime('claude-code');
      assert.ok(r, 'claude-code not in registry');
      const surfaces = r.surfaces(MINIMAL_CONFIG);
      const claudeMd = surfaces.find(s => s.path === 'CLAUDE.md');
      assert.ok(claudeMd, 'claude-code must produce a CLAUDE.md surface');
      assert.ok(claudeMd.content.includes('CLAUDE.md'), 'CLAUDE.md content should reference itself');
      assert.ok(claudeMd.content.includes('Test Project'), 'CLAUDE.md should include project name');
    });

    test('opencode generates AGENTS.md', () => {
      const r = getRuntime('opencode');
      assert.ok(r, 'opencode not in registry');
      const surfaces = r.surfaces(MINIMAL_CONFIG);
      const agentsMd = surfaces.find(s => s.path === 'AGENTS.md');
      assert.ok(agentsMd, 'opencode must produce an AGENTS.md surface');
      assert.ok(agentsMd.content.includes('AGENTS.md'), 'AGENTS.md content should reference itself');
    });

    test('codex generates AGENTS.md', () => {
      const r = getRuntime('codex');
      assert.ok(r, 'codex not in registry');
      const surfaces = r.surfaces(MINIMAL_CONFIG);
      const agentsMd = surfaces.find(s => s.path === 'AGENTS.md');
      assert.ok(agentsMd, 'codex must produce an AGENTS.md surface');
    });

    test('kiro generates .kiro/steering/product.md', () => {
      const r = getRuntime('kiro');
      assert.ok(r, 'kiro not in registry');
      const surfaces = r.surfaces(MINIMAL_CONFIG);
      const product = surfaces.find(s => s.path === '.kiro/steering/product.md');
      assert.ok(product, 'kiro must produce a .kiro/steering/product.md surface');
      assert.ok(product.content.includes('Test Project'), 'kiro product.md should include project name');
    });
  });

  // (c) Rules-based runtimes generate Markdown with expected content.
  describe('rules-based runtimes — content validation', () => {
    const RULES_RUNTIMES = [
      { id: 'cursor',   path: '.cursor/rules/forge.md' },
      { id: 'windsurf', path: '.windsurf/rules/forge.md' },
      { id: 'copilot',  path: '.github/copilot-instructions.md' },
      { id: 'gemini',   path: 'GEMINI.md' },
      { id: 'zed',      path: '.zed/rules.md' },
      { id: 'cline',    path: '.clinerules' },
      { id: 'aider',    path: 'CONVENTIONS.md' },
      { id: 'continue', path: '.continue/rules/forge.md' },
      { id: 'roo',      path: '.roo/rules/forge.md' },
      { id: 'amp',      path: 'AGENTS.md' },
      { id: 'augment',  path: '.augment/rules/forge.md' },
    ];

    for (const { id, path } of RULES_RUNTIMES) {
      test(`${id} generates '${path}' with project name and guardrails`, () => {
        const r = getRuntime(id);
        assert.ok(r, `${id} not found in registry`);
        assert.strictEqual(r.kind, 'rules', `${id} must be kind:'rules'`);
        const surfaces = r.surfaces(MINIMAL_CONFIG);
        assert.strictEqual(surfaces.length, 1, `${id} must produce exactly 1 surface`);
        assert.strictEqual(surfaces[0].path, path, `${id} path mismatch`);
        const content = surfaces[0].content;
        assert.ok(content.includes('Test Project'), `${id}: content must include project name`);
        assert.ok(
          content.includes('Branch guard') || content.includes('branch') || content.includes('main'),
          `${id}: content must include branch guardrail guidance`
        );
      });
    }
  });

  // (c) schema enum synchronization check — runtimeIds() IDs should be the
  // canonical set. We verify all 4 original runtimes are still in the registry.
  test('the 4 original runtimes are still registered', () => {
    const ids = runtimeIds();
    for (const id of ['claude-code', 'opencode', 'codex', 'kiro']) {
      assert.ok(ids.includes(id), `Original runtime '${id}' must still be in registry`);
    }
  });

  // Verify all 11 new rules-based runtimes are present.
  test('all 11 new rules-based runtimes are registered', () => {
    const ids = runtimeIds();
    const expected = [
      'cursor', 'windsurf', 'copilot', 'gemini', 'zed',
      'cline', 'aider', 'continue', 'roo', 'amp', 'augment',
    ];
    for (const id of expected) {
      assert.ok(ids.includes(id), `Rules-based runtime '${id}' must be in registry`);
    }
  });
});
