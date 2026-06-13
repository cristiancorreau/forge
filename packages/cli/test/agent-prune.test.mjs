// Orphan-agent pruning on reconfigure.
//
// Bug: `forge init` ADDED the selected profile's agents but never REMOVED the
// previous profile's agents. Reconfiguring a project's stack (e.g. laravel →
// express+nextjs) left the laravel agents (api-engineer, fullstack-engineer,
// laravel-specialist, laravel-test-engineer, migration-specialist) lingering in
// .claude/agents/ — so laravel agents appeared in projects that aren't laravel.
//
// Fix: installCoreAgents() prunes forge-bundled agents that the current config
// no longer selects, while preserving hand-authored agents and registered
// Tier-3 specialized agents.
//
//   node --test test/agent-prune.test.mjs
//
// The CLI must be built first (npm run build:all).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

function runInit(cwd) {
  const r = spawnSync('node', [CLI, 'init', '--force'], { cwd, encoding: 'utf8', env: { ...process.env, FORGE_NO_BUN: '1' } });
  assert.equal(r.status, 0, `forge init failed: ${r.stderr || r.stdout}`);
}

function agents(dir) {
  return readdirSync(join(dir, '.claude', 'agents')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')).sort();
}

const LARAVEL_YAML = `project: {name: T, slug: t, language: php, mode: standard, status: active}
stack: {backend: laravel}
agents: {active: [orchestrator, backend-engineer], compliance: [], profiles: [laravel]}
runtimes: {active: [claude-code]}
`;

const NEXTJS_YAML = `project: {name: T, slug: t, language: typescript, mode: standard, status: active}
stack: {backend: express, frontend: nextjs}
agents: {active: [orchestrator, backend-engineer, frontend-engineer], compliance: [], specialized: [my-custom-agent], profiles: [nextjs-admin]}
runtimes: {active: [claude-code]}
`;

describe('orphan agent pruning on reconfigure', () => {
  test('laravel agents are pruned after switching to a non-laravel stack', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-prune-'));
    try {
      writeFileSync(join(dir, 'project.yaml'), LARAVEL_YAML);
      runInit(dir);
      const afterLaravel = agents(dir);
      assert.ok(afterLaravel.includes('laravel-specialist'), 'laravel profile should install its agents first');
      assert.ok(afterLaravel.includes('migration-specialist'));

      // A hand-authored Tier-3 agent registered in agents.specialized.
      writeFileSync(join(dir, '.claude', 'agents', 'my-custom-agent.md'), '---\nname: my-custom-agent\ntier: 3\n---\ncustom\n');

      writeFileSync(join(dir, 'project.yaml'), NEXTJS_YAML);
      runInit(dir);
      const after = agents(dir);

      // Laravel orphans removed.
      for (const orphan of ['api-engineer', 'fullstack-engineer', 'laravel-specialist', 'laravel-test-engineer', 'migration-specialist']) {
        assert.ok(!after.includes(orphan), `orphan ${orphan} should be pruned, got: ${after.join(', ')}`);
      }
      // New profile + core agents present.
      assert.ok(after.includes('admin-engineer'), 'nextjs-admin profile agent installed');
      assert.ok(after.includes('orchestrator') && after.includes('backend-engineer') && after.includes('frontend-engineer'));
      // Hand-authored / specialized agent preserved.
      assert.ok(after.includes('my-custom-agent'), 'registered Tier-3 specialized agent must be preserved');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a clean non-laravel init never contains laravel agents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-prune-'));
    try {
      writeFileSync(join(dir, 'project.yaml'), NEXTJS_YAML.replace('specialized: [my-custom-agent], ', ''));
      runInit(dir);
      const after = agents(dir);
      for (const lar of ['laravel-specialist', 'laravel-test-engineer', 'migration-specialist', 'fullstack-engineer']) {
        assert.ok(!after.includes(lar), `${lar} must not appear in a nextjs project`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
