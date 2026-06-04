// Tests for the non-interactive data layer behind `forge panel` (SPEC-033).
//
// The panel UI itself (OpenTUI / @clack) is interactive and Bun-only, so it is
// not exercised here. Instead we test the pure data functions the panel renders:
// skills search/filter, hook listing (.claude/hooks + registry), template
// listing, the config summary, and the programmatic audit/doctor reports.
//
// These import the COMPILED modules from dist/, so the CLI must be built first
// (npm run build:all). Run directly with: node --test test/panel.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const CLI = join(DIST, 'cli.js');

/** Strip ANSI escapes so assertions match plain text. */
function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// The data layer resolves forge assets via resolveForgeRoot(). Point FORGE_HOME
// at the bundled assets so registry + templates resolve deterministically.
const ASSETS = join(__dirname, '..', 'assets');
process.env.FORGE_HOME = ASSETS;

let panelData, audit, doctor;

before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'panel-data.js')),
    'dist not built — run "npm run build:all" before the tests.');
  panelData = await import(join(DIST, 'lib', 'panel-data.js'));
  audit = await import(join(DIST, 'commands', 'audit.js'));
  doctor = await import(join(DIST, 'commands', 'doctor.js'));
});

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-panel-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeProjectYaml(dir, contents) {
  writeFileSync(join(dir, 'project.yaml'), contents, 'utf-8');
}

const FULL_YAML = `project:
  name: "Panel Test"
  mode: "enterprise"
  language: "typescript"
stack:
  backend: hono
  database: postgresql
  testing:
    - vitest
agents:
  active:
    - orchestrator
    - backend-engineer
  specialized:
    - dsar-specialist
  compliance:
    - compliance-reviewer
  profiles:
    - hono-drizzle
runtimes:
  active:
    - claude-code
compliance:
  frameworks:
    - GDPR
deploy:
  provider: vercel
  production_url: https://example.com
skills:
  - spec
  - wiki-ingest
`;

describe('panel-data — searchSkills', () => {
  test('an empty query returns the full catalog', (t) => {
    const dir = makeTmpDir(t);
    const rows = panelData.searchSkills('', dir);
    assert.ok(rows.length >= 10, 'expected the whole catalog for an empty query');
  });

  test('filters by command/name substring (case-insensitive)', (t) => {
    const dir = makeTmpDir(t);
    const rows = panelData.searchSkills('WIKI', dir);
    assert.ok(rows.length >= 3, 'expected the wiki-* skills');
    assert.ok(rows.every(r => `${r.id} ${r.command} ${r.category} ${r.purpose} ${r.trigger}`.toLowerCase().includes('wiki')));
    assert.ok(rows.some(r => r.id === 'wiki-ingest'));
  });

  test('filters by category', (t) => {
    const dir = makeTmpDir(t);
    const rows = panelData.searchSkills('Sesión', dir);
    assert.ok(rows.some(r => r.id === 'session-start'));
    assert.ok(rows.some(r => r.id === 'session-close'));
  });

  test('filters by trigger text', (t) => {
    const dir = makeTmpDir(t);
    const rows = panelData.searchSkills('deploy', dir);
    assert.ok(rows.some(r => r.id === 'local2prod'), 'local2prod trigger mentions deploy');
  });

  test('a non-matching query yields no rows', (t) => {
    const dir = makeTmpDir(t);
    assert.equal(panelData.searchSkills('zzzznotaskill', dir).length, 0);
  });

  test('marks active skills from project.yaml', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, FULL_YAML);
    const rows = panelData.searchSkills('', dir);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    assert.equal(byId['spec'].active, true, 'spec is active in the yaml');
    assert.equal(byId['wiki-ingest'].active, true, 'wiki-ingest is active in the yaml');
    assert.equal(byId['browser-test'].active, false, 'browser-test is not active');
  });

  test('no project.yaml means nothing is marked active', (t) => {
    const dir = makeTmpDir(t);
    const rows = panelData.searchSkills('', dir);
    assert.ok(rows.every(r => r.active === false));
  });
});

describe('panel-data — listInstalledHooks', () => {
  test('lists registry hooks with event/matcher even when none are installed', (t) => {
    const dir = makeTmpDir(t);
    const hooks = panelData.listInstalledHooks(dir, ASSETS);
    assert.ok(hooks.length >= 3, 'registry declares at least the universal hooks');
    const byHook = Object.fromEntries(hooks.map(h => [h.hook, h]));
    // Universal: pre-edit-check.js → PreToolUse with Edit|Write matcher.
    assert.ok(byHook['pre-edit-check.js'], 'pre-edit-check.js must be listed');
    assert.equal(byHook['pre-edit-check.js'].event, 'PreToolUse');
    assert.equal(byHook['pre-edit-check.js'].matcher, 'Edit|Write');
    assert.equal(byHook['pre-edit-check.js'].mode, 'universal');
    assert.equal(byHook['pre-edit-check.js'].installed, false, 'not installed in an empty dir');
    // Standard: pre-bash-check.js → Bash matcher, standard mode.
    assert.equal(byHook['pre-bash-check.js'].matcher, 'Bash');
    assert.equal(byHook['pre-bash-check.js'].mode, 'standard');
    // Descriptions are collapsed to a single line.
    assert.ok(byHook['pre-edit-check.js'].description.length > 0);
    assert.ok(!byHook['pre-edit-check.js'].description.includes('\n'));
  });

  test('marks a hook installed when present in .claude/hooks/', (t) => {
    const dir = makeTmpDir(t);
    const hooksDir = join(dir, '.claude', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'pre-edit-check.js'), '// hook\n', 'utf-8');
    const hooks = panelData.listInstalledHooks(dir, ASSETS);
    const entry = hooks.find(h => h.hook === 'pre-edit-check.js');
    assert.equal(entry.installed, true);
  });

  test('reports hooks on disk that are not in the registry as unknown', (t) => {
    const dir = makeTmpDir(t);
    const hooksDir = join(dir, '.claude', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'my-custom-hook.js'), '// custom\n', 'utf-8');
    const hooks = panelData.listInstalledHooks(dir, ASSETS);
    const entry = hooks.find(h => h.hook === 'my-custom-hook.js');
    assert.ok(entry, 'custom on-disk hook must be listed');
    assert.equal(entry.mode, 'unknown');
    assert.equal(entry.installed, true);
  });

  test('returns [] gracefully when forgeRoot is null and no hooks dir', (t) => {
    const dir = makeTmpDir(t);
    const hooks = panelData.listInstalledHooks(dir, null);
    assert.deepEqual(hooks, []);
  });
});

describe('panel-data — listTemplates', () => {
  test('lists spec, mode, wiki and claude-md templates', () => {
    const templates = panelData.listTemplates(ASSETS);
    assert.ok(templates.length > 0, 'expected bundled templates');
    const cats = new Set(templates.map(t => t.category));
    assert.ok(cats.has('spec'), 'spec template missing');
    assert.ok(cats.has('mode'), 'mode templates missing');
    assert.ok(cats.has('wiki'), 'wiki templates missing');
    assert.ok(cats.has('claude-md'), 'claude-md templates missing');
    // Known entries.
    assert.ok(templates.some(t => t.name === 'spec-template.md'));
    assert.ok(templates.some(t => t.name === 'startup.yaml.tpl'));
    // Every entry carries a non-empty description and a relPath.
    for (const t of templates) {
      assert.ok(t.description.length > 0, `template ${t.name} has no description`);
      assert.ok(t.relPath.length > 0);
    }
  });

  test('returns [] when forgeRoot is null', () => {
    assert.deepEqual(panelData.listTemplates(null), []);
  });
});

describe('panel-data — getConfigSummary', () => {
  test('reports not found without a project.yaml', (t) => {
    const dir = makeTmpDir(t);
    const c = panelData.getConfigSummary(dir);
    assert.equal(c.found, false);
    assert.equal(c.yamlPath, null);
  });

  test('summarises a full project.yaml', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, FULL_YAML);
    const c = panelData.getConfigSummary(dir);
    assert.equal(c.found, true);
    assert.equal(c.name, 'Panel Test');
    assert.equal(c.mode, 'enterprise');
    assert.equal(c.language, 'typescript');
    assert.deepEqual(c.agentsActive, ['orchestrator', 'backend-engineer']);
    assert.deepEqual(c.agentsSpecialized, ['dsar-specialist']);
    assert.deepEqual(c.agentsCompliance, ['compliance-reviewer']);
    assert.deepEqual(c.profiles, ['hono-drizzle']);
    assert.deepEqual(c.runtimes, ['claude-code']);
    assert.deepEqual(c.compliance, ['GDPR']);
    assert.deepEqual(c.skills, ['spec', 'wiki-ingest']);
    assert.equal(c.deploy.provider, 'vercel');
    assert.equal(c.deploy.url, 'https://example.com');
    // Stack is flattened into key/value pairs (testing joined).
    const stack = Object.fromEntries(c.stack.map(s => [s.key, s.value]));
    assert.equal(stack.backend, 'hono');
    assert.equal(stack.database, 'postgresql');
    assert.equal(stack.testing, 'vitest');
  });
});

describe('audit/doctor — programmatic reports', () => {
  test('runAudit returns a structured report', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, FULL_YAML);
    const r = audit.runAudit(dir);
    assert.ok(r.summary && typeof r.summary.ok === 'number', 'summary.ok must be a number');
    assert.ok(Array.isArray(r.issues));
    assert.equal(r.hasProjectYaml, true);
    assert.equal(typeof r.hooksInstalled, 'number');
    assert.ok(['ok', 'outdated', 'missing'].includes(r.manifestStatus));
  });

  test('runAudit flags a missing project.yaml as an error', (t) => {
    const dir = makeTmpDir(t);
    const r = audit.runAudit(dir);
    assert.equal(r.hasProjectYaml, false);
    assert.ok(r.summary.errors >= 1, 'a missing project.yaml is an error');
    assert.ok(r.issues.some(i => i.level === 'error' && /project\.yaml/.test(i.check)));
  });

  test('runAudit counts installed hooks', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, FULL_YAML);
    const hooksDir = join(dir, '.claude', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'pre-edit-check.js'), '// hook\n', 'utf-8');
    writeFileSync(join(hooksDir, 'post-turn-check.sh'), '# hook\n', 'utf-8');
    const r = audit.runAudit(dir);
    assert.equal(r.hooksInstalled, 2);
  });

  test('runDoctor returns environment + runtime data', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, FULL_YAML);
    const r = doctor.runDoctor(dir);
    assert.equal(typeof r.ok, 'boolean');
    assert.equal(typeof r.nodeVersion, 'string');
    assert.equal(r.forgeRootOk, true, 'FORGE_HOME points at valid assets');
    assert.equal(r.assetsOk, true);
    assert.equal(r.configMode, 'enterprise');
    assert.ok(Array.isArray(r.runtimes) && r.runtimes.length >= 4, 'all runtimes probed');
    // claude-code is the active runtime in the yaml.
    const cc = r.runtimes.find(rt => rt.id === 'claude-code');
    assert.ok(cc, 'claude-code must be probed');
    assert.equal(cc.active, true);
    // A configured .claude dir is detected.
    mkdirSync(join(dir, '.claude'), { recursive: true });
    assert.ok(doctor.runDoctor(dir).runtimesDetected.includes('claude-code'));
  });
});

describe('forge panel — CLI (non-TTY fallback)', () => {
  test('panel --help documents the command', () => {
    const res = spawnSync(process.execPath, [CLI, 'panel', '--help'], { encoding: 'utf-8' });
    assert.equal(res.status, 0);
    assert.match(stripAnsi(res.stdout), /Usage: forge panel/);
  });

  test('panel prints a non-interactive snapshot of every section without crashing', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, FULL_YAML);
    // stdin from /dev/null (non-TTY) must NOT crash the @clack fallback.
    const res = spawnSync(process.execPath, [CLI, 'panel'], {
      cwd: dir, encoding: 'utf-8', input: '',
      env: { ...process.env, FORGE_NO_BUN: '1' },
    });
    const out = stripAnsi((res.stdout ?? '') + (res.stderr ?? ''));
    assert.equal(res.status, 0, `panel should exit 0; output:\n${out}`);
    assert.match(out, /Configuración/);
    assert.match(out, /Monitoreo/);
    assert.match(out, /spec/);          // skills section
    assert.match(out, /Hooks/);
    assert.match(out, /Templates/);
    assert.doesNotMatch(out, /ERR_TTY_INIT_FAILED/);
  });

  test('--help lists the panel command', () => {
    const res = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf-8' });
    assert.equal(res.status, 0);
    assert.match(stripAnsi(res.stdout), /\bpanel\b/);
  });
});
