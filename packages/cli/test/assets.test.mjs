// Asset-integrity tests — assert the bundled forge assets (agents, skills,
// hooks) are internally consistent. These read the packaged files under
// assets/ (produced by `npm run build:assets`) rather than running the CLI.
//
//     node --test test/assets.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'assets');

/** Recursively collect files matching a predicate under `dir`. */
function walk(dir, pred, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

before(() => {
  assert.ok(
    existsSync(ASSETS),
    `assets/ not found at ${ASSETS}. Run "npm run build:assets" first.`
  );
});

describe('forge assets — integrity', () => {
  test('no agent references a Python hook (.py) — hooks are JavaScript', () => {
    const agents = walk(join(ASSETS, 'core', 'agents'), f => f.endsWith('.md'))
      .concat(walk(join(ASSETS, 'profiles'), f => f.endsWith('.md') && f.includes('/agents/')));
    assert.ok(agents.length > 0, 'expected to find agent .md files in assets');
    const offenders = [];
    for (const f of agents) {
      const content = readFileSync(f, 'utf-8');
      if (/pre-edit-check\.py|pre-bash-check\.py/.test(content)) {
        offenders.push(f.replace(ASSETS + '/', ''));
      }
    }
    assert.deepEqual(offenders, [], `agents still reference Python hooks: ${offenders.join(', ')}`);
  });

  test('the bundled hooks are JavaScript, not Python', () => {
    const hooksDir = join(ASSETS, 'core', 'hooks');
    assert.ok(existsSync(join(hooksDir, 'pre-edit-check.js')), 'pre-edit-check.js missing');
    assert.ok(existsSync(join(hooksDir, 'pre-bash-check.js')), 'pre-bash-check.js missing');
  });

  test('every agent has valid frontmatter (name, description, model, tier)', () => {
    const agents = walk(join(ASSETS, 'core', 'agents'), f => f.endsWith('.md'))
      .concat(walk(join(ASSETS, 'profiles'), f => f.endsWith('.md') && f.includes('/agents/')));
    const bad = [];
    for (const f of agents) {
      const content = readFileSync(f, 'utf-8');
      const fm = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fm) { bad.push(`${f}: no frontmatter`); continue; }
      for (const field of ['name', 'description', 'model', 'tier']) {
        if (!new RegExp(`^${field}:`, 'm').test(fm[1])) {
          bad.push(`${f.replace(ASSETS + '/', '')}: missing ${field}`);
        }
      }
    }
    assert.deepEqual(bad, [], `agents with bad frontmatter:\n${bad.join('\n')}`);
  });

  test('every Tier 2 (profile) agent declares last_verified', () => {
    const profileAgents = walk(join(ASSETS, 'profiles'), f => f.endsWith('.md') && f.includes('/agents/'));
    const missing = [];
    for (const f of profileAgents) {
      const content = readFileSync(f, 'utf-8');
      if (!/last_verified:/.test(content)) missing.push(f.replace(ASSETS + '/', ''));
    }
    assert.deepEqual(missing, [], `Tier 2 agents without last_verified: ${missing.join(', ')}`);
  });

  test('no skill or slash command references Python scripts or .agentic/', () => {
    const files = walk(join(ASSETS, 'core', 'skills'), f => f.endsWith('.md'))
      .concat(walk(join(ASSETS, 'adapters', 'claude-code', 'commands'), f => f.endsWith('.md')));
    assert.ok(files.length > 0, 'expected skills/commands files in assets');
    const offenders = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf-8');
      // Python invocations, the legacy .agentic/ submodule path, or .py hooks.
      if (/python3 \.agentic|\.agentic\/scripts|forge-init\.py|forge-audit\.py|aitmpl-search\.py|pre-edit-check\.py|pre-bash-check\.py/.test(content)) {
        offenders.push(f.replace(ASSETS + '/', ''));
      }
    }
    assert.deepEqual(offenders, [], `skills/commands still reference Python/.agentic: ${offenders.join(', ')}`);
  });

  test('wiki skills point at wiki/ (not docs/wiki/) to match the CLI', () => {
    const files = walk(join(ASSETS, 'core', 'skills'), f => f.endsWith('.md'))
      .concat(walk(join(ASSETS, 'adapters', 'claude-code', 'commands'), f => f.endsWith('.md')));
    const offenders = [];
    for (const f of files) {
      if (/docs\/wiki\//.test(readFileSync(f, 'utf-8'))) offenders.push(f.replace(ASSETS + '/', ''));
    }
    assert.deepEqual(offenders, [], `files still use docs/wiki/ (CLI uses wiki/): ${offenders.join(', ')}`);
  });

  test('no agent embeds a hardcoded major framework version in prose', () => {
    // Migration guides legitimately reference specific versions; skip them.
    const agents = walk(join(ASSETS, 'core', 'agents'), f => f.endsWith('.md'))
      .concat(walk(join(ASSETS, 'profiles'), f => f.endsWith('.md') && f.includes('/agents/')))
      .filter(f => !f.includes('migration-specialist'));
    // Patterns that go stale: "Next.js 15", "Astro 4.x", "Nuxt 3 ", "Laravel 10,", etc.
    const stale = /Next\.js 1[0-9]\b|Astro [0-9]\.x|Nuxt [0-9] \(|Laravel 1[0-9],|NestJS 1[0-9]\+|Rails [0-9]\.x o/;
    const offenders = [];
    for (const f of agents) {
      const content = readFileSync(f, 'utf-8');
      if (stale.test(content)) offenders.push(f.replace(ASSETS + '/', ''));
    }
    assert.deepEqual(offenders, [], `agents with stale hardcoded versions: ${offenders.join(', ')}`);
  });
});
