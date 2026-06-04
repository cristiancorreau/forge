// Tests for the install data layer behind `forge panel` (SPEC-034).
//
// Exercises the pure functions in lib/catalog-install.ts: searchCatalog finds
// skills/profiles/templates and marks installed; installSkill / installProfile /
// installTemplate mutate the project idempotently; and after every install the
// project.yaml still parses and passes `forge validate`.
//
// These import the COMPILED modules from dist/, so the CLI must be built first
// (npm run build:all). Run directly with: node --test test/catalog-install.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const CLI = join(DIST, 'cli.js');
const ASSETS = join(__dirname, '..', 'assets');

// Point FORGE_HOME at the bundled assets so profiles/templates/commands resolve.
process.env.FORGE_HOME = ASSETS;

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

let lib, yamlMod;

before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'catalog-install.js')),
    'dist not built — run "npm run build:all" before the tests.');
  lib = await import(join(DIST, 'lib', 'catalog-install.js'));
  yamlMod = await import(join(DIST, 'lib', 'yaml.js'));
});

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-install-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A hand-maintained project.yaml with comments and block-style lists.
const BASE_YAML = `project:
  name: "Install Test"
  mode: standard
  language: typescript

stack:
  backend: hono

agents:
  active:
    - orchestrator
    - backend-engineer
  # comentario hecho a mano que NO debe perderse
  compliance: []

runtimes:
  active:
    - claude-code

# skills hand-listed below
skills:
  - spec
`;

function writeBase(dir, yaml = BASE_YAML) {
  writeFileSync(join(dir, 'project.yaml'), yaml, 'utf-8');
}

/** Run `forge validate` in dir; returns {status, out}. */
function runValidate(dir) {
  const res = spawnSync(process.execPath, [CLI, 'validate'], {
    cwd: dir, encoding: 'utf-8', env: { ...process.env, FORGE_HOME: ASSETS },
  });
  return { status: res.status ?? 1, out: stripAnsi((res.stdout ?? '') + (res.stderr ?? '')) };
}

describe('searchCatalog', () => {
  test('empty query returns skills + profiles + templates', (t) => {
    const dir = makeTmpDir(t);
    const items = lib.searchCatalog(ASSETS, dir, '');
    const types = new Set(items.map(i => i.type));
    assert.ok(types.has('skill'), 'skills present');
    assert.ok(types.has('profile'), 'profiles present');
    assert.ok(types.has('template'), 'templates present');
  });

  test('finds a skill by query and marks installed from project.yaml', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const items = lib.searchCatalog(ASSETS, dir, 'wiki-ingest');
    const skill = items.find(i => i.type === 'skill' && i.id === 'wiki-ingest');
    assert.ok(skill, 'wiki-ingest skill found');
    assert.equal(skill.installed, false, 'wiki-ingest is not in the base yaml');
    const spec = lib.searchCatalog(ASSETS, dir, 'spec').find(i => i.id === 'spec' && i.type === 'skill');
    assert.ok(spec, 'spec skill found');
    assert.equal(spec.installed, true, 'spec is active in the base yaml');
  });

  test('finds a profile by query and marks installed', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir, BASE_YAML.replace('compliance: []', 'compliance: []\n  profiles:\n    - hono-drizzle'));
    const items = lib.searchCatalog(ASSETS, dir, 'hono-drizzle');
    const prof = items.find(i => i.type === 'profile' && i.id === 'hono-drizzle');
    assert.ok(prof, 'hono-drizzle profile found');
    assert.equal(prof.installed, true, 'hono-drizzle is active in agents.profiles');
    // A profile not in the yaml is not installed.
    const other = lib.searchCatalog(ASSETS, dir, 'express').find(i => i.type === 'profile' && i.id === 'express');
    assert.ok(other);
    assert.equal(other.installed, false);
  });

  test('finds a template by query', (t) => {
    const dir = makeTmpDir(t);
    const items = lib.searchCatalog(ASSETS, dir, 'wiki');
    assert.ok(items.some(i => i.type === 'template' && i.id === 'wiki'), 'wiki template found');
    const spec = lib.searchCatalog(ASSETS, dir, 'spec-template').find(i => i.type === 'template');
    assert.ok(spec, 'spec template found');
    assert.equal(spec.id, 'spec:spec-template.md');
  });

  test('with forgeRoot null returns only skills', (t) => {
    const dir = makeTmpDir(t);
    const items = lib.searchCatalog(null, dir, '');
    assert.ok(items.length > 0);
    assert.ok(items.every(i => i.type === 'skill'), 'only skills without a forge root');
  });
});

describe('installSkill', () => {
  test('adds the skill to project.yaml.skills, preserves comments, validates', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.installSkill(dir, ASSETS, 'wiki-ingest');
    assert.equal(res.ok, true);
    assert.equal(res.alreadyInstalled, false);

    const raw = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    // Hand-written comment is preserved.
    assert.match(raw, /comentario hecho a mano que NO debe perderse/);
    assert.match(raw, /# skills hand-listed below/);

    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.deepEqual(cfg.skills, ['spec', 'wiki-ingest']);

    // Slash command copied if bundled (wiki-ingest.md exists in adapters).
    assert.ok(existsSync(join(dir, '.claude', 'commands', 'wiki-ingest.md')),
      'wiki-ingest slash command copied');

    // Still passes forge validate.
    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
    assert.match(v.out, /OK/);
  });

  test('is idempotent — installing twice does not duplicate', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    lib.installSkill(dir, ASSETS, 'wiki-ingest');
    const second = lib.installSkill(dir, ASSETS, 'wiki-ingest');
    assert.equal(second.alreadyInstalled, true, 'second install is a no-op');
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.deepEqual(cfg.skills, ['spec', 'wiki-ingest'], 'no duplicate skill');
  });

  test('creates a skills: block when project.yaml has none', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'project.yaml'), `project:\n  name: "No Skills"\n  mode: standard\n`, 'utf-8');
    const res = lib.installSkill(dir, ASSETS, 'spec');
    assert.equal(res.ok, true);
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.deepEqual(cfg.skills, ['spec']);
    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('handles a flat list form `skills: [a, b]`', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'project.yaml'),
      `project:\n  name: "Flat"\n  mode: standard\nskills: [spec, wiki-query]\n`, 'utf-8');
    lib.installSkill(dir, ASSETS, 'wiki-ingest');
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.deepEqual(cfg.skills.sort(), ['spec', 'wiki-ingest', 'wiki-query']);
    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('rejects an unknown skill id', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.installSkill(dir, ASSETS, 'not-a-real-skill');
    assert.equal(res.ok, false);
  });
});

describe('installProfile', () => {
  test('adds the profile to agents.profiles and writes the agent files, validates', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.installProfile(dir, ASSETS, 'hono-drizzle');
    assert.equal(res.ok, true);

    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.ok(cfg.agents.profiles.includes('hono-drizzle'), 'profile added to agents.profiles');
    assert.deepEqual(cfg.agents.active, ['orchestrator', 'backend-engineer'], 'active agents untouched');

    // Profile agent file(s) installed into .claude/agents/.
    assert.ok(existsSync(join(dir, '.claude', 'agents', 'api-engineer.md')),
      'profile agent api-engineer.md installed');

    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('creates agents.profiles when missing and is idempotent', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'project.yaml'),
      `project:\n  name: "NoProfiles"\n  mode: standard\nagents:\n  active:\n    - orchestrator\n`, 'utf-8');
    lib.installProfile(dir, ASSETS, 'express');
    const second = lib.installProfile(dir, ASSETS, 'express');
    assert.equal(second.alreadyInstalled, true, 'second install is a no-op');
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.deepEqual(cfg.agents.profiles, ['express']);
    assert.deepEqual(cfg.agents.active, ['orchestrator']);
    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('preserves hand-written comments when inserting profiles, validates', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    lib.installProfile(dir, ASSETS, 'hono-drizzle');
    const raw = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(raw, /comentario hecho a mano que NO debe perderse/);
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.ok(cfg.agents.profiles.includes('hono-drizzle'));
    assert.deepEqual(cfg.agents.active, ['orchestrator', 'backend-engineer']);
    assert.deepEqual(cfg.skills, ['spec'], 'skills block untouched');
    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('handles a flat profiles list form `profiles: [a]`', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'project.yaml'),
      `project:\n  name: "FlatProfiles"\n  mode: standard\nagents:\n  active:\n    - orchestrator\n  profiles: [express]\n`, 'utf-8');
    lib.installProfile(dir, ASSETS, 'nestjs');
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.deepEqual(cfg.agents.profiles.sort(), ['express', 'nestjs']);
    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('rejects an unknown profile name', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.installProfile(dir, ASSETS, 'not-a-real-profile');
    assert.equal(res.ok, false);
  });
});

describe('installTemplate', () => {
  test('scaffolds the wiki structure idempotently', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.installTemplate(dir, ASSETS, 'wiki');
    assert.equal(res.ok, true);
    assert.equal(res.alreadyInstalled, false);
    assert.ok(existsSync(join(dir, 'wiki', 'index.md')), 'wiki/index.md created');
    assert.ok(existsSync(join(dir, 'wiki', 'concepts', '_template.md')), 'concepts seed created');
    // index.md comes from the bundled template (distinctive text).
    assert.match(readFileSync(join(dir, 'wiki', 'index.md'), 'utf-8'), /Catálogo de páginas/);

    const second = lib.installTemplate(dir, ASSETS, 'wiki');
    assert.equal(second.alreadyInstalled, true, 'second wiki install is a no-op');
  });

  test('scaffolds the spec template into docs/specs/_template.md', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.installTemplate(dir, ASSETS, 'spec:spec-template.md');
    assert.equal(res.ok, true);
    assert.ok(existsSync(join(dir, 'docs', 'specs', '_template.md')), 'spec template scaffolded');
    const second = lib.installTemplate(dir, ASSETS, 'spec:spec-template.md');
    assert.equal(second.alreadyInstalled, true);
  });

  test('installs architecture.rules into .claude/', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.installTemplate(dir, ASSETS, 'claude-md:architecture.rules');
    assert.equal(res.ok, true);
    assert.ok(existsSync(join(dir, '.claude', 'architecture.rules')));
  });

  test('rejects an unknown template id', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.installTemplate(dir, ASSETS, 'nope:nope');
    assert.equal(res.ok, false);
  });
});

describe('installItem dispatcher + search reflects installs', () => {
  test('installing a skill flips its installed flag in searchCatalog', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    let item = lib.searchCatalog(ASSETS, dir, 'wiki-lint').find(i => i.type === 'skill' && i.id === 'wiki-lint');
    assert.equal(item.installed, false);
    lib.installItem(dir, ASSETS, { type: 'skill', id: 'wiki-lint' });
    item = lib.searchCatalog(ASSETS, dir, 'wiki-lint').find(i => i.type === 'skill' && i.id === 'wiki-lint');
    assert.equal(item.installed, true, 'installed flag flips after install');
    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });
});
