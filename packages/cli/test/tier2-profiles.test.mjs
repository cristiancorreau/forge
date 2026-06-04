// SPEC-040 — Tier 2 profiles for new stacks (Spring Boot, Flutter, Rust, Flask).
//
// Covers:
//   1. Each new profile agent has valid frontmatter (name, description, model,
//      tier:2, profile, last_verified) and the required body sections
//      (## Stack, ## Reglas, ## No hagas), plus a README.md.
//   2. listCatalogAgents() lists the new profile agents from the assets tree.
//   3. manifest.json includes the 4 profiles with their agent(s).
//   4. PROFILE_MAP wiring: `forge adopt --yes` on Spring Boot / Rust+Axum /
//      Flutter / Flask fixtures writes a project.yaml whose agents.profiles
//      references the matching profile, and `forge validate` passes. The
//      profile's agent file installs into .claude/agents/.
//
//     node --test test/tier2-profiles.test.mjs
//
// The CLI must be built first (npm run build:all).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { listCatalogAgents } from '../dist/lib/catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');
const ASSETS = join(__dirname, '..', 'assets');

// The four profiles introduced by SPEC-040 and the agent each one provides.
const NEW_PROFILES = [
  { profile: 'springboot', agent: 'api-engineer' },
  { profile: 'flutter',    agent: 'mobile-engineer' },
  { profile: 'rust',       agent: 'api-engineer' },
  { profile: 'flask',      agent: 'api-engineer' },
];

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return (s ?? '').replace(/\x1b\[[0-9;]*m/g, '');
}

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-t2-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runForge(args, opts = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? process.cwd(), encoding: 'utf-8',
    env: { ...process.env, FORGE_HOME: opts.forgeHome ?? '' },
  });
  const all = stripAnsi(res.stdout) + stripAnsi(res.stderr);
  return { status: res.status ?? 1, all };
}

// ─── A. Profile files + agent standard ───────────────────────────────────────

describe('SPEC-040 — new profile files exist and follow the agent standard', () => {
  for (const { profile, agent } of NEW_PROFILES) {
    test(`${profile}: README.md + agents/${agent}.md present in assets`, () => {
      assert.ok(existsSync(join(ASSETS, 'profiles', profile, 'README.md')),
        `profiles/${profile}/README.md missing from the bundle`);
      assert.ok(existsSync(join(ASSETS, 'profiles', profile, 'agents', `${agent}.md`)),
        `profiles/${profile}/agents/${agent}.md missing from the bundle`);
    });

    test(`${profile}: agent frontmatter is complete (tier 2 + profile + last_verified)`, () => {
      const content = readFileSync(join(ASSETS, 'profiles', profile, 'agents', `${agent}.md`), 'utf-8');
      const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      assert.ok(fm, `${profile}/${agent}: no frontmatter`);
      const block = fm[1];
      assert.match(block, new RegExp(`^name:\\s*${agent}\\b`, 'm'), 'name mismatch');
      assert.match(block, /^description:\s*.+/m, 'missing description');
      assert.match(block, /^model:\s*sonnet\b/m, 'model must be sonnet');
      assert.match(block, /^tools:\s*Read, Grep, Glob, Bash, Edit, Write/m, 'tools mismatch');
      assert.match(block, /^tier:\s*2\b/m, 'tier must be 2');
      assert.match(block, new RegExp(`^profile:\\s*${profile}\\b`, 'm'), 'profile field mismatch');
      assert.match(block, /^last_verified:\s*".+"/m, 'missing last_verified');
    });

    test(`${profile}: agent body has the required sections`, () => {
      const content = readFileSync(join(ASSETS, 'profiles', profile, 'agents', `${agent}.md`), 'utf-8');
      for (const section of ['## Stack', '## Reglas', '## No hagas']) {
        assert.ok(content.includes(section), `${profile}/${agent}: missing "${section}"`);
      }
    });
  }
});

// ─── B. Catalog lists the new profile agents ─────────────────────────────────

describe('SPEC-040 — listCatalogAgents reports the new profiles', () => {
  test('catalog includes springboot/flutter/rust/flask with their agents', () => {
    const { profiles } = listCatalogAgents(ASSETS);
    for (const { profile, agent } of NEW_PROFILES) {
      assert.ok(profiles[profile], `catalog is missing profile "${profile}"`);
      assert.ok(profiles[profile].includes(agent),
        `catalog profile "${profile}" should list agent "${agent}", got ${JSON.stringify(profiles[profile])}`);
    }
  });
});

// ─── C. manifest.json inventory ──────────────────────────────────────────────

describe('SPEC-040 — manifest.json lists the new profiles', () => {
  test('manifest profiles include the 4 new entries with the right agents', () => {
    const manifest = JSON.parse(readFileSync(join(ASSETS, 'manifest.json'), 'utf-8'));
    const byId = Object.fromEntries(manifest.profiles.map((p) => [p.id, p]));
    for (const { profile, agent } of NEW_PROFILES) {
      assert.ok(byId[profile], `manifest.json profiles missing "${profile}"`);
      assert.ok(Array.isArray(byId[profile].agents) && byId[profile].agents.includes(agent),
        `manifest profile "${profile}" should list agent "${agent}"`);
      assert.ok(typeof byId[profile].stack === 'string' && byId[profile].stack.length > 0,
        `manifest profile "${profile}" needs a non-empty stack`);
    }
  });
});

// ─── D. PROFILE_MAP wiring via `forge adopt` end-to-end ───────────────────────

describe('SPEC-040 — adopt activates the matching profile (PROFILE_MAP)', () => {
  test('Spring Boot (pom.xml) → springboot profile + api-engineer installed', (t) => {
    const dir = makeTmpDir(t);
    mkdirSync(join(dir, 'src', 'main', 'java'), { recursive: true });
    writeFileSync(join(dir, 'pom.xml'),
      '<project>\n<parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId></parent>\n<artifactId>demo</artifactId>\n</project>\n', 'utf-8');
    writeFileSync(join(dir, 'README.md'), '# Demo\n\nA Spring Boot service.\n', 'utf-8');

    const res = runForge(['adopt', '--yes', dir], { forgeHome: ASSETS });
    assert.equal(res.status, 0, res.all);

    const yaml = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(yaml, /backend: springboot/);
    assert.match(yaml, /profiles:[\s\S]*- springboot/);

    const validate = runForge(['validate'], { cwd: dir, forgeHome: ASSETS });
    assert.equal(validate.status, 0, validate.all);

    assert.ok(existsSync(join(dir, '.claude', 'agents', 'api-engineer.md')),
      'expected the springboot api-engineer to install into .claude/agents/');
  });

  test('Rust + Axum (Cargo.toml) → rust profile + api-engineer installed', (t) => {
    const dir = makeTmpDir(t);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'Cargo.toml'),
      '[package]\nname = "rust-api"\nversion = "0.1.0"\n[dependencies]\naxum = "0.7"\ntokio = { version = "1", features = ["full"] }\n', 'utf-8');
    writeFileSync(join(dir, 'src', 'main.rs'), 'fn main() {}\n', 'utf-8');
    writeFileSync(join(dir, 'README.md'), '# Rust API\n\nAn Axum API.\n', 'utf-8');

    const res = runForge(['adopt', '--yes', dir], { forgeHome: ASSETS });
    assert.equal(res.status, 0, res.all);

    const yaml = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(yaml, /backend: axum/);
    assert.match(yaml, /profiles:[\s\S]*- rust/);

    const validate = runForge(['validate'], { cwd: dir, forgeHome: ASSETS });
    assert.equal(validate.status, 0, validate.all);

    assert.ok(existsSync(join(dir, '.claude', 'agents', 'api-engineer.md')),
      'expected the rust api-engineer to install into .claude/agents/');
  });

  test('Flutter (pubspec.yaml) → flutter profile + mobile-engineer installed', (t) => {
    const dir = makeTmpDir(t);
    mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'pubspec.yaml'),
      'name: my_app\ndescription: A Flutter app\nenvironment:\n  sdk: ">=3.0.0 <4.0.0"\ndependencies:\n  flutter:\n    sdk: flutter\n', 'utf-8');
    writeFileSync(join(dir, 'lib', 'main.dart'), 'void main() {}\n', 'utf-8');
    writeFileSync(join(dir, 'README.md'), '# My App\n\nA Flutter mobile app.\n', 'utf-8');

    const res = runForge(['adopt', '--yes', dir], { forgeHome: ASSETS });
    assert.equal(res.status, 0, res.all);

    const yaml = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(yaml, /mobile: flutter/);
    assert.match(yaml, /profiles:[\s\S]*- flutter/);

    const validate = runForge(['validate'], { cwd: dir, forgeHome: ASSETS });
    assert.equal(validate.status, 0, validate.all);

    assert.ok(existsSync(join(dir, '.claude', 'agents', 'mobile-engineer.md')),
      'expected the flutter mobile-engineer to install into .claude/agents/');
  });

  test('Flask (requirements.txt) → flask profile + api-engineer installed', (t) => {
    const dir = makeTmpDir(t);
    mkdirSync(join(dir, 'app'), { recursive: true });
    writeFileSync(join(dir, 'requirements.txt'), 'Flask==3.0.0\nFlask-SQLAlchemy\n', 'utf-8');
    writeFileSync(join(dir, 'app', '__init__.py'), 'def create_app():\n    pass\n', 'utf-8');
    writeFileSync(join(dir, 'README.md'), '# Svc\n\nA Flask service.\n', 'utf-8');

    const res = runForge(['adopt', '--yes', dir], { forgeHome: ASSETS });
    assert.equal(res.status, 0, res.all);

    const yaml = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(yaml, /backend: flask/);
    assert.match(yaml, /profiles:[\s\S]*- flask/);

    const validate = runForge(['validate'], { cwd: dir, forgeHome: ASSETS });
    assert.equal(validate.status, 0, validate.all);

    assert.ok(existsSync(join(dir, '.claude', 'agents', 'api-engineer.md')),
      'expected the flask api-engineer to install into .claude/agents/');
  });
});
