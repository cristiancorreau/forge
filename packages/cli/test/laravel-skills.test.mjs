// Laravel 13 skills + agents (SPEC-044) — assert the new catalog content is
// fully wired: SKILL.md files, manifest registration, the CLI SKILLS catalog,
// adapter command stubs, the two Tier-2 agents, and no Python/.agentic leakage.
//
//     node --test test/laravel-skills.test.mjs
//
// File-existence/registration checks read the repo directly. The SKILLS-catalog
// check imports the compiled dist/lib/catalog.js (run "npm run build:all" first).

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const DIST = join(__dirname, '..', 'dist');

const SKILLS = ['laravel-eloquent', 'laravel-pest', 'laravel-security', 'laravel-verify', 'laravel-mcp'];
const AGENTS = ['laravel-specialist', 'laravel-test-engineer'];

describe('Laravel 13 skills (SPEC-044)', () => {
  test('each skill ships a SKILL.md with the forge header and Triggers', () => {
    for (const id of SKILLS) {
      const p = join(REPO_ROOT, 'core', 'skills', id, 'SKILL.md');
      assert.ok(existsSync(p), `${id}/SKILL.md missing`);
      const c = readFileSync(p, 'utf-8');
      assert.match(c, new RegExp(`^# Skill: ${id}\\b`, 'm'), `${id} must start with "# Skill: ${id}"`);
      assert.match(c, /^Triggers:\s*\/(?:laravel-)/m, `${id} must declare Triggers`);
    }
  });

  test('manifest.json registers all 5 laravel skills', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'manifest.json'), 'utf-8'));
    const ids = new Set((manifest.skills || []).map(s => s.id));
    for (const id of SKILLS) assert.ok(ids.has(id), `manifest.json must register skill ${id}`);
    // each registered dir must exist
    for (const s of manifest.skills) {
      assert.ok(existsSync(join(REPO_ROOT, s.dir, 'SKILL.md')), `${s.dir}/SKILL.md missing for ${s.id}`);
    }
  });

  test('each skill has an adapter command stub', () => {
    for (const id of SKILLS) {
      const p = join(REPO_ROOT, 'adapters', 'claude-code', 'commands', `${id}.md`);
      assert.ok(existsSync(p), `adapter command ${id}.md missing`);
      assert.match(readFileSync(p, 'utf-8'), new RegExp(`${id}`), `${id}.md should reference the skill`);
    }
  });

  test('the CLI SKILLS catalog exposes the laravel skills', async () => {
    const distCatalog = join(DIST, 'lib', 'catalog.js');
    if (!existsSync(distCatalog)) return; // dist not built in this run
    const { SKILLS: CATALOG } = await import(pathToFileURL(distCatalog).href);
    const ids = new Set(CATALOG.map(s => s.id));
    for (const id of SKILLS) assert.ok(ids.has(id), `SKILLS catalog must include ${id}`);
    for (const s of CATALOG.filter(x => SKILLS.includes(x.id))) {
      assert.equal(s.category, 'Laravel', `${s.id} should be in the Laravel category`);
      assert.equal(s.command, `/${s.id}`, `${s.id} command should be /${s.id}`);
    }
  });

  test('skills contain zero Python / .agentic references', () => {
    for (const id of SKILLS) {
      const c = readFileSync(join(REPO_ROOT, 'core', 'skills', id, 'SKILL.md'), 'utf-8');
      assert.doesNotMatch(c, /python3|\.agentic|pytest/, `${id} must not reference Python/.agentic`);
    }
  });
});

describe('Laravel 13 agents (SPEC-044)', () => {
  test('both Tier-2 agents exist with valid frontmatter', () => {
    for (const name of AGENTS) {
      const p = join(REPO_ROOT, 'profiles', 'laravel', 'agents', `${name}.md`);
      assert.ok(existsSync(p), `agent ${name}.md missing`);
      const c = readFileSync(p, 'utf-8');
      const fm = c.match(/^---\n([\s\S]*?)\n---/);
      assert.ok(fm, `${name} must have YAML frontmatter`);
      for (const field of ['name', 'description', 'model', 'tier', 'profile', 'last_verified']) {
        assert.match(fm[1], new RegExp(`^${field}:`, 'm'), `${name} frontmatter must declare ${field}`);
      }
      assert.match(fm[1], /^tier:\s*2\b/m, `${name} must be tier 2`);
      assert.match(fm[1], /^profile:\s*laravel\b/m, `${name} must declare profile: laravel`);
    }
  });

  test('manifest lists the new agents under the laravel profile', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'manifest.json'), 'utf-8'));
    const laravel = (manifest.profiles || []).find(p => p.id === 'laravel');
    assert.ok(laravel, 'laravel profile must exist in manifest');
    for (const name of AGENTS) assert.ok(laravel.agents.includes(name), `laravel profile must list ${name}`);
  });
});
