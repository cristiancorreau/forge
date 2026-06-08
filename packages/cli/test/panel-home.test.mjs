// Tests for detectBrownfield + getProjectState (SPEC-059 PR6).
//
// Pure functions in lib/panel-data.ts — no TTY, no Bun, no OpenTUI.
// Import compiled dist/ via pathToFileURL.
// Run directly: node --test test/panel-home.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

const importDist = (...parts) => import(pathToFileURL(join(DIST, ...parts)).href);

let panelData;

before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'panel-data.js')),
    'dist not built — run "npm run build:all" before the tests.');
  panelData = await importDist('lib', 'panel-data.js');
});

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-home-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeProjectYaml(dir, contents) {
  writeFileSync(join(dir, 'project.yaml'), contents, 'utf-8');
}

const MINIMAL_YAML = `project:
  name: "Home Test"
  mode: "startup"
  language: "typescript"
runtimes:
  active:
    - claude-code
`;

const YAML_WITH_SKILLS = `project:
  name: "Home Test"
  mode: "startup"
  language: "typescript"
runtimes:
  active:
    - claude-code
skills:
  - spec
  - wiki-ingest
`;

// ─── detectBrownfield ────────────────────────────────────────────────────────

describe('panel-data — detectBrownfield (SPEC-059 PR6)', () => {
  test('returns true when package.json exists and no project.yaml', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'package.json'), '{"name":"test"}', 'utf-8');
    assert.equal(panelData.detectBrownfield(dir), true);
  });

  test('returns true when pyproject.toml exists and no project.yaml', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'pyproject.toml'), '[tool.poetry]\nname = "test"\n', 'utf-8');
    assert.equal(panelData.detectBrownfield(dir), true);
  });

  test('returns true when go.mod exists and no project.yaml', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'go.mod'), 'module example.com/test\n', 'utf-8');
    assert.equal(panelData.detectBrownfield(dir), true);
  });

  test('returns true when Cargo.toml exists and no project.yaml', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "test"\n', 'utf-8');
    assert.equal(panelData.detectBrownfield(dir), true);
  });

  test('returns true when .git directory exists and no project.yaml', (t) => {
    const dir = makeTmpDir(t);
    mkdirSync(join(dir, '.git'));
    assert.equal(panelData.detectBrownfield(dir), true);
  });

  test('returns false when project.yaml exists (forge already configured)', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'package.json'), '{"name":"test"}', 'utf-8');
    writeProjectYaml(dir, MINIMAL_YAML);
    assert.equal(panelData.detectBrownfield(dir), false);
  });

  test('returns false when empty directory (no markers, no project.yaml)', (t) => {
    const dir = makeTmpDir(t);
    assert.equal(panelData.detectBrownfield(dir), false);
  });
});

// ─── getProjectState ─────────────────────────────────────────────────────────

describe('panel-data — getProjectState (SPEC-059 PR6)', () => {
  test('returns "empty" for a directory with no markers and no project.yaml', (t) => {
    const dir = makeTmpDir(t);
    assert.equal(panelData.getProjectState(dir), 'empty');
  });

  test('returns "brownfield" for a directory with package.json but no project.yaml', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'package.json'), '{"name":"test"}', 'utf-8');
    assert.equal(panelData.getProjectState(dir), 'brownfield');
  });

  test('returns "configured" when project.yaml exists but skills list is empty', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, MINIMAL_YAML);
    assert.equal(panelData.getProjectState(dir), 'configured');
  });

  test('returns "configured" when project.yaml + skills but no audit report', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, YAML_WITH_SKILLS);
    // No audit/doctor passed → cannot go beyond 'configured' even with skills
    assert.equal(panelData.getProjectState(dir, null, null), 'configured');
  });

  test('returns "healthy" when project.yaml + skills + no audit errors + assetsOk', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, YAML_WITH_SKILLS);
    const mockAudit = { summary: { errors: 0 } };
    const mockDoctor = { assetsOk: true };
    assert.equal(panelData.getProjectState(dir, mockAudit, mockDoctor), 'healthy');
  });

  test('returns "needs-attention" when audit has errors', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, YAML_WITH_SKILLS);
    const mockAudit = { summary: { errors: 2 } };
    const mockDoctor = { assetsOk: true };
    assert.equal(panelData.getProjectState(dir, mockAudit, mockDoctor), 'needs-attention');
  });

  test('returns "needs-attention" when doctor assetsOk is false', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, YAML_WITH_SKILLS);
    const mockAudit = { summary: { errors: 0 } };
    const mockDoctor = { assetsOk: false };
    assert.equal(panelData.getProjectState(dir, mockAudit, mockDoctor), 'needs-attention');
  });

  test('degraded mode: omitting doctor treats assets as ok (optimistic)', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, YAML_WITH_SKILLS);
    const mockAudit = { summary: { errors: 0 } };
    // No doctor → assetsOk treated as true → healthy
    assert.equal(panelData.getProjectState(dir, mockAudit), 'healthy');
  });

  test('degraded mode: omitting audit returns "configured" when skills present', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, YAML_WITH_SKILLS);
    // No audit → cannot classify beyond 'configured'
    assert.equal(panelData.getProjectState(dir, undefined, undefined), 'configured');
  });

  test('all 5 states are representable', (t) => {
    // empty
    const emptyDir = makeTmpDir(t);
    assert.equal(panelData.getProjectState(emptyDir), 'empty');

    // brownfield
    const brownDir = makeTmpDir(t);
    writeFileSync(join(brownDir, 'package.json'), '{}', 'utf-8');
    assert.equal(panelData.getProjectState(brownDir), 'brownfield');

    // configured (no skills)
    const cfgDir = makeTmpDir(t);
    writeProjectYaml(cfgDir, MINIMAL_YAML);
    assert.equal(panelData.getProjectState(cfgDir), 'configured');

    // healthy
    const healthyDir = makeTmpDir(t);
    writeProjectYaml(healthyDir, YAML_WITH_SKILLS);
    assert.equal(
      panelData.getProjectState(healthyDir, { summary: { errors: 0 } }, { assetsOk: true }),
      'healthy',
    );

    // needs-attention
    const badDir = makeTmpDir(t);
    writeProjectYaml(badDir, YAML_WITH_SKILLS);
    assert.equal(
      panelData.getProjectState(badDir, { summary: { errors: 1 } }, { assetsOk: true }),
      'needs-attention',
    );
  });
});
