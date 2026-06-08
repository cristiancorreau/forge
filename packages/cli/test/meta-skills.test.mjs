// Tests for the authoring meta-skills forge-skill-creator / forge-skill-improver
// (SPEC-058). Verifies they ship in assets, appear installable in the catalog,
// and — the dogfooding guarantee — pass their own `forge eval` quality gate.
//
// Imports COMPILED modules from dist/, so build first (npm run build:all).
// Run directly: node --test test/meta-skills.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const ASSETS = join(__dirname, '..', 'assets');
const importDist = (...parts) => import(pathToFileURL(join(DIST, ...parts)).href);
process.env.FORGE_HOME = ASSETS;

const META_SKILLS = ['forge-skill-creator', 'forge-skill-improver'];

let evalLib, catalog, yamlMod;

before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'skill-eval.js')),
    'dist not built — run "npm run build:all" before the tests.');
  evalLib = await importDist('lib', 'skill-eval.js');
  catalog = await importDist('lib', 'catalog-install.js');
  yamlMod = await importDist('lib', 'yaml.js');
});

describe('authoring meta-skills (SPEC-058)', () => {
  test('both meta-skills ship in assets/core/skills', () => {
    for (const id of META_SKILLS) {
      const p = join(ASSETS, 'core', 'skills', id, 'SKILL.md');
      assert.ok(existsSync(p), `${id}/SKILL.md must ship in assets (${p})`);
    }
  });

  test('both meta-skills appear installable in the catalog', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-meta-'));
    for (const id of META_SKILLS) {
      const items = catalog.searchCatalog(ASSETS, dir, id);
      const item = items.find(i => i.type === 'skill' && i.id === id);
      assert.ok(item, `${id} found in catalog`);
      assert.equal(item.installable, true, `${id} is installable`);
      assert.equal(item.installed, false, `${id} not installed in a clean project`);
    }
  });

  // Dogfooding: the skills that teach the quality gate must themselves pass it.
  test('both meta-skills pass their own forge eval quality gate (>=75 / min >=6)', () => {
    for (const id of META_SKILLS) {
      const md = readFileSync(join(ASSETS, 'core', 'skills', id, 'SKILL.md'), 'utf8');
      const ev = evalLib.evalSkill(md);
      const gate = evalLib.checkQualityGate(ev);
      assert.equal(gate.pass, true,
        `${id} must pass its own gate; overall=${ev.overallScore}, reason=${gate.reason}`);
      assert.ok(ev.overallScore >= 75, `${id} overall ${ev.overallScore} >= 75`);
      const weakest = ev.categories.reduce((a, b) => (a.score < b.score ? a : b));
      assert.ok(weakest.score >= 6, `${id} weakest category ${weakest.id}=${weakest.score} >= 6`);
    }
  });

  test('installSkill adds a meta-skill to project.yaml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-meta-inst-'));
    writeFileSync(join(dir, 'project.yaml'), 'project:\n  name: t\n  mode: standard\n');
    const res = catalog.installSkill(dir, ASSETS, 'forge-skill-creator');
    assert.equal(res.ok, true, `install ok: ${res.message}`);
    const cfg = yamlMod.loadProjectYaml(join(dir, 'project.yaml'));
    assert.ok((cfg.skills || []).includes('forge-skill-creator'),
      'forge-skill-creator added to project.yaml skills');
  });
});
