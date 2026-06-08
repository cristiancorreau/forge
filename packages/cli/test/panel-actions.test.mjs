// Tests for the new panel-data actions: uninstallItem / enableSkill / disableSkill
// / installHook (SPEC-059 PR2).
//
// Each function is tested for correctness, idempotence and YAML safety (the
// resulting project.yaml must still pass `forge validate`).
//
// These import the COMPILED modules from dist/, so the CLI must be built first
// (npm run build:all). Run directly with: node --test test/panel-actions.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, writeFileSync, readFileSync, rmSync,
  existsSync, mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const CLI  = join(DIST, 'cli.js');
const ASSETS = join(__dirname, '..', 'assets');

process.env.FORGE_HOME = ASSETS;

const importDist = (...parts) => import(pathToFileURL(join(DIST, ...parts)).href);

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

let lib, yamlMod;

before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'catalog-install.js')),
    'dist not built — run "npm run build:all" before the tests.');
  lib     = await importDist('lib', 'catalog-install.js');
  yamlMod = await importDist('lib', 'yaml.js');
});

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-panel-actions-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const BASE_YAML = `project:
  name: "Actions Test"
  mode: standard
  language: typescript

# comentario que NO debe perderse
agents:
  active:
    - orchestrator
  profiles:
    - hono-drizzle

skills:
  - spec
  - wiki-ingest
`;

function writeBase(dir, yaml = BASE_YAML) {
  writeFileSync(join(dir, 'project.yaml'), yaml, 'utf-8');
}

/** Run \`forge validate\` in dir; returns {status, out}. */
function runValidate(dir) {
  const res = spawnSync(process.execPath, [CLI, 'validate'], {
    cwd: dir, encoding: 'utf-8', env: { ...process.env, FORGE_HOME: ASSETS },
  });
  return { status: res.status ?? 1, out: stripAnsi((res.stdout ?? '') + (res.stderr ?? '')) };
}

// ─── disableSkill ─────────────────────────────────────────────────────────────

describe('disableSkill', () => {
  test('removes the skill from project.yaml.skills, preserves comments, validates', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.disableSkill(dir, 'wiki-ingest');
    assert.equal(res.ok, true);
    assert.equal(res.changed.length, 1, 'project.yaml reported as changed');

    const raw = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(raw, /comentario que NO debe perderse/, 'comment preserved');
    assert.doesNotMatch(raw, /wiki-ingest/, 'wiki-ingest removed');

    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.deepEqual(cfg.skills, ['spec'], 'only spec remains');

    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('is idempotent — disabling twice is a no-op', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    lib.disableSkill(dir, 'wiki-ingest');
    const second = lib.disableSkill(dir, 'wiki-ingest');
    assert.equal(second.ok, true);
    assert.equal(second.changed.length, 0, 'second call reports no changes');
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.deepEqual(cfg.skills, ['spec']);
  });

  test('returns ok when skill not in project.yaml at all', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'project.yaml'), `project:\n  name: "X"\n  mode: standard\n`, 'utf-8');
    const res = lib.disableSkill(dir, 'spec');
    assert.equal(res.ok, true);
    assert.equal(res.changed.length, 0);
  });

  test('rejects an unknown skill id', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.disableSkill(dir, 'totally-unknown-skill-xyz');
    assert.equal(res.ok, false);
  });

  test('handles flat list form `skills: [a, b]`', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'project.yaml'),
      `project:\n  name: "Flat"\n  mode: standard\nskills: [spec, wiki-ingest]\n`, 'utf-8');
    lib.disableSkill(dir, 'wiki-ingest');
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.deepEqual(cfg.skills, ['spec']);
    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });
});

// ─── enableSkill ──────────────────────────────────────────────────────────────

describe('enableSkill', () => {
  test('adds the skill and is idempotent (delegates to installSkill)', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'project.yaml'),
      `project:\n  name: "E"\n  mode: standard\nskills:\n  - spec\n`, 'utf-8');
    const res = lib.enableSkill(dir, ASSETS, 'wiki-ingest');
    assert.equal(res.ok, true);
    assert.equal(res.alreadyInstalled, false);
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.ok(cfg.skills.includes('wiki-ingest'));

    const second = lib.enableSkill(dir, ASSETS, 'wiki-ingest');
    assert.equal(second.alreadyInstalled, true);
    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });
});

// ─── uninstallItem ────────────────────────────────────────────────────────────

describe('uninstallItem — skill', () => {
  test('removes skill from project.yaml and slash command, validates', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    // First install so the slash command exists.
    lib.installItem(dir, ASSETS, { type: 'skill', id: 'wiki-ingest' });
    assert.ok(existsSync(join(dir, '.claude', 'commands', 'wiki-ingest.md')), 'cmd present after install');

    const res = lib.uninstallItem(dir, ASSETS, { type: 'skill', id: 'wiki-ingest' });
    assert.equal(res.ok, true);

    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.ok(!cfg.skills.includes('wiki-ingest'), 'skill removed from yaml');
    assert.ok(!existsSync(join(dir, '.claude', 'commands', 'wiki-ingest.md')), 'slash cmd removed');

    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('is idempotent — uninstalling twice is safe', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    lib.uninstallItem(dir, ASSETS, { type: 'skill', id: 'wiki-ingest' });
    const second = lib.uninstallItem(dir, ASSETS, { type: 'skill', id: 'wiki-ingest' });
    assert.equal(second.ok, true);
    assert.equal(second.changed.length, 0);
    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('preserves other skills and comments when removing one skill', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    lib.uninstallItem(dir, ASSETS, { type: 'skill', id: 'wiki-ingest' });
    const raw = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(raw, /comentario que NO debe perderse/);
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.deepEqual(cfg.skills, ['spec'], 'spec still present');
    assert.deepEqual(cfg.agents.profiles, ['hono-drizzle'], 'profiles untouched');
  });
});

describe('uninstallItem — profile', () => {
  test('removes profile from agents.profiles, preserves comments, validates', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.uninstallItem(dir, ASSETS, { type: 'profile', id: 'hono-drizzle' });
    assert.equal(res.ok, true);
    assert.equal(res.changed.length, 1);

    const raw = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(raw, /comentario que NO debe perderse/);

    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.ok(!cfg.agents?.profiles?.includes('hono-drizzle'), 'profile removed');
    assert.deepEqual(cfg.skills, ['spec', 'wiki-ingest'], 'skills untouched');

    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('is idempotent — removing twice is safe', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    lib.uninstallItem(dir, ASSETS, { type: 'profile', id: 'hono-drizzle' });
    const second = lib.uninstallItem(dir, ASSETS, { type: 'profile', id: 'hono-drizzle' });
    assert.equal(second.ok, true);
    assert.equal(second.changed.length, 0);
  });
});

describe('uninstallItem — unsupported types', () => {
  test('returns ok=false for template type', (t) => {
    const dir = makeTmpDir(t);
    const res = lib.uninstallItem(dir, ASSETS, { type: 'template', id: 'wiki' });
    assert.equal(res.ok, false);
    assert.match(res.message, /no admite desinstalación/);
  });
});

// ─── installHook ──────────────────────────────────────────────────────────────

describe('installHook', () => {
  test('copies the hook to .claude/hooks/, validates', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    // Find a real hook in the registry.
    const hooksDir = join(ASSETS, 'core', 'hooks');
    if (!existsSync(hooksDir)) {
      // If assets don't have hooks, create a fake one for the test.
      mkdirSync(hooksDir, { recursive: true });
      writeFileSync(join(hooksDir, 'pre-edit-check.js'), '// forge hook\n', 'utf-8');
    }
    const hookId = 'pre-edit-check.js';
    const hookSrc = join(hooksDir, hookId);
    if (!existsSync(hookSrc)) {
      writeFileSync(hookSrc, '// forge hook\n', 'utf-8');
    }

    const res = lib.installHook(dir, ASSETS, hookId);
    assert.equal(res.ok, true);
    assert.equal(res.alreadyInstalled, false);
    assert.ok(existsSync(join(dir, '.claude', 'hooks', hookId)), 'hook file installed');
    assert.ok(res.changed.some(f => f.includes(hookId)));

    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });

  test('is idempotent — installing twice returns alreadyInstalled=true', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const hooksDir = join(ASSETS, 'core', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const hookId = 'pre-edit-check.js';
    const hookSrc = join(hooksDir, hookId);
    if (!existsSync(hookSrc)) writeFileSync(hookSrc, '// forge hook\n', 'utf-8');

    lib.installHook(dir, ASSETS, hookId);
    const second = lib.installHook(dir, ASSETS, hookId);
    assert.equal(second.alreadyInstalled, true);
    assert.equal(second.changed.length, 0);
  });

  test('returns ok=false for a hook not in the registry', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const res = lib.installHook(dir, ASSETS, 'nonexistent-hook.js');
    assert.equal(res.ok, false);
    assert.match(res.message, /no encontrado en el registry/);
  });

  test('creates .claude/hooks/ dir if it does not exist', (t) => {
    const dir = makeTmpDir(t);
    writeBase(dir);
    const hooksDir = join(ASSETS, 'core', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const hookId = 'pre-edit-check.js';
    if (!existsSync(join(hooksDir, hookId))) writeFileSync(join(hooksDir, hookId), '// h\n', 'utf-8');

    assert.ok(!existsSync(join(dir, '.claude', 'hooks')), '.claude/hooks should not exist yet');
    lib.installHook(dir, ASSETS, hookId);
    assert.ok(existsSync(join(dir, '.claude', 'hooks')), '.claude/hooks created');
  });
});

// ─── Round-trip: install → disable → enable ───────────────────────────────────

describe('round-trip enable/disable', () => {
  test('install → disable → enable restores original state', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'project.yaml'),
      `project:\n  name: "RT"\n  mode: standard\nskills:\n  - spec\n`, 'utf-8');

    lib.enableSkill(dir, ASSETS, 'wiki-ingest');
    let cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.ok(cfg.skills.includes('wiki-ingest'), 'enabled');

    lib.disableSkill(dir, 'wiki-ingest');
    cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.ok(!cfg.skills.includes('wiki-ingest'), 'disabled');

    lib.enableSkill(dir, ASSETS, 'wiki-ingest');
    cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.ok(cfg.skills.includes('wiki-ingest'), 're-enabled');

    const v = runValidate(dir);
    assert.equal(v.status, 0, `validate failed:\n${v.out}`);
  });
});
