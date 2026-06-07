// Parity test suite for the ported forge commands (issue #20).
//
// Runs the compiled CLI (dist/cli.js) through child_process and asserts on its
// observable behaviour: command listing, version, skills output, doctor, the
// offline catalog search, migrate/validate/wiki on synthetic project.yaml files.
//
// No test framework or extra dependency is required — this uses the native
// Node.js test runner (node:test) plus node:assert. Run it directly with:
//
//     node --test test/commands.test.mjs
//
// The CLI must be built first (npm run build:all). The suite resolves dist/cli.js
// relative to this file, so it works regardless of the current directory.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

// Read the version from package.json so a version bump never breaks the suite.
const EXPECTED_VERSION = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
).version;
const ALL_COMMANDS = [
  'init',
  'audit',
  'generate',
  'validate',
  'doctor',
  'migrate',
  'wiki',
  'skills',
  'aitmpl-search',
  'scaffold',
  'teardown',
];

/** Strip ANSI color/style escape codes so assertions match plain text. */
function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Run the compiled CLI with the given args.
 * @param {string[]} args
 * @param {{ cwd?: string }} [opts]
 * @returns {{ status: number, stdout: string, stderr: string, all: string }}
 */
function runForge(args, opts = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    encoding: 'utf-8',
    // Avoid inheriting a FORGE_HOME that could point elsewhere; let the CLI
    // resolve its bundled assets/ next to dist/.
    env: { ...process.env, FORGE_HOME: '' },
  });
  const stdout = stripAnsi(res.stdout ?? '');
  const stderr = stripAnsi(res.stderr ?? '');
  return {
    status: res.status ?? 1,
    stdout,
    stderr,
    all: stdout + stderr,
  };
}

/** Create a throwaway directory and register its cleanup with the test runner. */
function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write a project.yaml into `dir` and return its path. */
function writeProjectYaml(dir, contents) {
  const p = join(dir, 'project.yaml');
  writeFileSync(p, contents, 'utf-8');
  return p;
}

// A minimal but schema-valid v2 project.yaml (project.name + project.mode are
// the only required fields; rules/mcp/github mark it as v2 for migrate).
const VALID_V2_YAML = `project:
  name: "Test Project"
  mode: "standard"
rules:
  conventional_commits: true
mcp:
  servers: []
github:
  project:
    number: 1
`;

before(() => {
  assert.ok(
    existsSync(CLI),
    `Compiled CLI not found at ${CLI}. Run "npm run build:all" before the tests.`
  );
});

describe('forge CLI — parity suite', () => {
  test('--help lists every ported command', () => {
    const { status, stdout } = runForge(['--help']);
    assert.equal(status, 0);
    for (const cmd of ALL_COMMANDS) {
      assert.match(
        stdout,
        new RegExp(`(^|\\s)${cmd.replace('-', '\\-')}(\\s|$)`, 'm'),
        `--help output is missing command "${cmd}"`
      );
    }
  });

  test('--version reports the package.json version', () => {
    const { status, stdout } = runForge(['--version']);
    assert.equal(status, 0);
    assert.equal(stdout.trim(), EXPECTED_VERSION);
  });

  test('skills lists the skill catalog', () => {
    const { status, stdout } = runForge(['skills']);
    assert.equal(status, 0);
    assert.match(stdout, /forge skills/);
    // At least one known skill command must be present.
    assert.match(stdout, /\/spec/);
  });

  test('skills --json emits valid JSON with skills', () => {
    const { status, stdout } = runForge(['skills', '--json']);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed.skills), 'skills field must be an array');
    assert.ok(parsed.skills.length > 0, 'skills array must not be empty');
    assert.equal(parsed.total, parsed.skills.length);
    // Each skill row carries an id.
    for (const skill of parsed.skills) {
      assert.equal(typeof skill.id, 'string');
    }
  });

  test('doctor runs without crashing (exit 0 or 1)', () => {
    const { status } = runForge(['doctor']);
    assert.ok(
      status === 0 || status === 1,
      `doctor should exit 0 or 1, got ${status}`
    );
  });

  test('aitmpl-search finds results for "hono"', () => {
    const { status, stdout } = runForge(['aitmpl-search', 'hono']);
    assert.equal(status, 0);
    assert.match(stdout, /resultado/);
    assert.match(stdout, /hono/i);
    assert.doesNotMatch(stdout, /Sin resultados/);
  });

  test('aitmpl-search --json returns a JSON array of matches', () => {
    const { status, stdout } = runForge(['aitmpl-search', 'hono', '--json']);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed), 'aitmpl-search --json must output an array');
    assert.ok(parsed.length > 0, 'expected at least one hono result');
  });

  test('migrate --dry-run on a v2 project.yaml reports it is already v2', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, VALID_V2_YAML);
    const { status, stdout } = runForge(['migrate', '--dry-run'], { cwd: dir });
    assert.equal(status, 0);
    assert.match(stdout, /ya está en v2/);
    // Dry-run must not have written a backup or modified anything.
    assert.ok(!existsSync(join(dir, 'project.yaml.bak')));
  });

  test('wiki status without a wiki reports it is not initialized', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, VALID_V2_YAML);
    const { status, all } = runForge(['wiki', 'status'], { cwd: dir });
    assert.equal(status, 0);
    assert.match(all, /no existe|no inicializado/i);
  });

  test('validate on a valid project.yaml exits 0', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, VALID_V2_YAML);
    const { status, stdout } = runForge(['validate'], { cwd: dir });
    assert.equal(status, 0, `validate should pass; output:\n${stdout}`);
    assert.match(stdout, /OK|válido/i);
  });

  test('validate without a project.yaml exits 1', (t) => {
    const dir = makeTmpDir(t);
    const { status, all } = runForge(['validate'], { cwd: dir });
    assert.equal(status, 1);
    assert.match(all, /No se encontró project\.yaml/);
  });

  // Regression for the v2.9.0 schema bug: `skills` as a flat string array was
  // rejected because the JSON schema only allowed the legacy object form.
  test('validate accepts skills as a flat string array (v2.9+ form)', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(
      dir,
      `project:
  name: "Skills Array Project"
  mode: "standard"
skills:
  - spec
  - security-audit
`
    );
    const { status, stdout } = runForge(['validate'], { cwd: dir });
    assert.equal(status, 0, `validate should accept a skills array; output:\n${stdout}`);
    assert.match(stdout, /OK|válido/i);
    assert.doesNotMatch(stdout, /\/skills/, 'must not report a /skills schema error');
  });

  // The legacy object form (skills.active) must keep validating for back-compat.
  test('validate still accepts the legacy skills object form', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(
      dir,
      `project:
  name: "Legacy Skills Project"
  mode: "standard"
skills:
  active:
    - spec
`
    );
    const { status, stdout } = runForge(['validate'], { cwd: dir });
    assert.equal(status, 0, `validate should accept skills.active; output:\n${stdout}`);
  });

  test('audit reports skill opportunities for unused skills', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(
      dir,
      `project:
  name: "Audit Project"
  mode: "standard"
skills:
  - spec
`
    );
    const { status, all } = runForge(['audit'], { cwd: dir });
    assert.ok(status === 0 || status === 1, `audit should exit 0/1, got ${status}`);
    // 'spec' is active, so other skills should surface as opportunities.
    assert.match(all, /oportunidad/i, 'audit should list unused-skill opportunities');
  });

  test('an unknown command exits 1', () => {
    const { status, all } = runForge(['definitely-not-a-command']);
    assert.equal(status, 1);
    assert.match(all, /Unknown command/);
  });

  test('scaffold --help documents its required flags', () => {
    const { status, stdout } = runForge(['scaffold', '--help']);
    assert.equal(status, 0);
    assert.match(stdout, /scaffold/);
    assert.match(stdout, /--name/);
    assert.match(stdout, /--engineer/);
  });

  test('teardown --dry-run lists artifacts without deleting', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, VALID_V2_YAML);
    writeFileSync(join(dir, 'CLAUDE.md'), '# generated by forge\n', 'utf-8');
    const { status, all } = runForge(['teardown', '--dry-run'], { cwd: dir });
    assert.ok(status === 0 || status === 1, `teardown should exit 0/1, got ${status}`);
    assert.match(all, /dry-run/i);
    assert.ok(existsSync(join(dir, 'CLAUDE.md')), 'dry-run must not delete CLAUDE.md');
  });

  test('generate --dry-run does not write files', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(
      dir,
      `project:
  name: "Gen Project"
  mode: "standard"
  language: "typescript"
runtimes:
  active:
    - claude-code
`
    );
    const { status, all } = runForge(['generate', '--dry-run'], { cwd: dir });
    assert.ok(status === 0 || status === 1, `generate should exit 0/1, got ${status}`);
    assert.ok(!existsSync(join(dir, 'CLAUDE.md')), 'dry-run must not write CLAUDE.md');
    assert.match(all.toLowerCase(), /dry-run|forge generate/);
  });

  test('migrate --backup writes v2 sections on a real v1 project', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(
      dir,
      `project:
  name: "Legacy"
  language: "typescript"
agents:
  active:
    - orchestrator
`
    );
    const { status, stdout } = runForge(['migrate', '--backup'], { cwd: dir });
    assert.equal(status, 0, `migrate should succeed; output:\n${stdout}`);
    assert.ok(existsSync(join(dir, 'project.yaml.bak')), 'expected a .bak backup');
    const migrated = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(migrated, /schema_version|rules|mcp|github/);
  });

  // End-to-end install pipeline: with an existing project.yaml, `init --force`
  // is non-interactive (no wizard) and installs the full claude-code setup.
  // This is the same code path the wizard reaches after collecting answers.
  test('init --force installs agents, CLAUDE.md, hooks and manifest', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(
      dir,
      `project:
  name: "Install E2E"
  mode: "standard"
  language: "typescript"
stack:
  backend: hono
agents:
  active:
    - orchestrator
    - test-engineer
runtimes:
  active:
    - claude-code
`
    );
    const { status } = runForge(['init', '--force'], { cwd: dir });
    assert.equal(status, 0, 'init --force should exit 0');

    // Agents installed.
    assert.ok(existsSync(join(dir, '.claude', 'agents', 'orchestrator.md')), 'orchestrator agent missing');
    // Generated config.
    assert.ok(existsSync(join(dir, 'CLAUDE.md')), 'CLAUDE.md missing');
    assert.ok(existsSync(join(dir, '.claude', 'settings.json')), 'settings.json missing');
    // Hooks are JavaScript (zero Python) — including the ported session/stop hooks.
    assert.ok(existsSync(join(dir, '.claude', 'hooks', 'pre-edit-check.js')), 'JS hook missing');
    assert.ok(existsSync(join(dir, '.claude', 'hooks', 'post-turn-check.js')), 'post-turn-check.js missing');
    assert.ok(existsSync(join(dir, '.claude', 'hooks', 'session-start.js')), 'session-start.js missing');
    assert.ok(!existsSync(join(dir, '.claude', 'hooks', 'pre-edit-check.py')), 'Python hook must not exist');
    assert.ok(!existsSync(join(dir, '.claude', 'hooks', 'post-turn-check.sh')), 'shell hook must not be installed');
    // Manifest with the current version.
    const manifestPath = join(dir, '.forge', 'manifest.json');
    assert.ok(existsSync(manifestPath), '.forge/manifest.json missing');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifest.forgeVersion, EXPECTED_VERSION);
    assert.equal(manifest.runtime, 'claude-code');

    // settings.json wires every hook via node (no python3, no shell).
    const settings = readFileSync(join(dir, '.claude', 'settings.json'), 'utf-8');
    assert.match(settings, /node .claude\/hooks/);
    assert.match(settings, /SessionStart/);
    assert.match(settings, /node \.claude\/hooks\/post-turn-check\.js/);
    assert.doesNotMatch(settings, /python3/);
    assert.doesNotMatch(settings, /\.sh/);
  });

  // Auto-selección de profiles: detected/selected stack → Tier 2 profile slugs.
  test('profilesForStack maps a stack to its Tier 2 profiles', async () => {
    const { profilesForStack } = await import(
      join(__dirname, '..', 'dist', 'lib', 'profiles.js')
    );
    assert.deepEqual(profilesForStack({ backend: 'hono', frontend: 'nextjs' }), ['hono-drizzle', 'nextjs-admin']);
    assert.deepEqual(profilesForStack({ backend: 'django' }), ['django']);
    assert.deepEqual(profilesForStack({ testing: ['playwright'] }), ['playwright-crawler']);
    // A framework with no forge profile (fastify) yields nothing, not a bogus slug.
    assert.deepEqual(profilesForStack({ backend: 'fastify' }), []);
  });

  // Tier 3: init generates a stub per specialized agent and audit validates them.
  test('init generates Tier 3 stubs and audit validates them', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(
      dir,
      `project:
  name: "Tier3 E2E"
  mode: "standard"
  language: "typescript"
agents:
  active:
    - orchestrator
  specialized:
    - dsar-specialist
    - gcm-engineer
runtimes:
  active:
    - claude-code
`
    );
    const { status } = runForge(['init', '--force'], { cwd: dir });
    assert.equal(status, 0, 'init --force should exit 0');

    // A stub is written for each Tier 3 agent, with tier: 3 frontmatter.
    const stub = join(dir, '.claude', 'agents', 'dsar-specialist.md');
    assert.ok(existsSync(stub), 'Tier 3 stub missing');
    assert.match(readFileSync(stub, 'utf-8'), /tier: 3/);
    assert.ok(existsSync(join(dir, '.claude', 'agents', 'gcm-engineer.md')), 'second Tier 3 stub missing');

    // audit reports both specialized agents as present (level ok).
    const audit = runForge(['audit', '--json'], { cwd: dir });
    const report = JSON.parse(audit.stdout);
    const tier3 = report.issues.filter((i) => i.check === 'tier3');
    assert.equal(tier3.length, 2, 'audit should emit one tier3 issue per specialized agent');
    assert.ok(tier3.every((i) => i.level === 'ok'), 'specialized agents should be present');
  });

  // Codex hooks: init wires .codex/codex.yaml session hooks + inline guardrails.
  test('init --runtime codex writes AGENTS.md and .codex session hooks', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(
      dir,
      `project:
  name: "Codex E2E"
  mode: "standard"
  language: "typescript"
agents:
  active:
    - orchestrator
runtimes:
  active:
    - codex
`
    );
    const { status } = runForge(['init', '--force', '--runtime', 'codex'], { cwd: dir });
    assert.equal(status, 0, 'init --runtime codex should exit 0');

    assert.ok(existsSync(join(dir, 'AGENTS.md')), 'AGENTS.md missing');
    const codexYamlPath = join(dir, '.codex', 'codex.yaml');
    assert.ok(existsSync(codexYamlPath), '.codex/codex.yaml missing');
    const codexYaml = readFileSync(codexYamlPath, 'utf-8');
    assert.match(codexYaml, /onStart/);
    assert.match(codexYaml, /onFinish/);
    // The session hooks are pure JS (zero Python) and actually copied to .codex/.
    assert.match(codexYaml, /node \.codex\/session-start\.js/);
    assert.ok(existsSync(join(dir, '.codex', 'session-start.js')), 'onStart hook not copied');
    assert.ok(existsSync(join(dir, '.codex', 'post-turn-check.js')), 'onFinish hook not copied');
    assert.doesNotMatch(codexYaml, /python3/);
    // AGENTS.md carries the inline guardrails (Codex's native mechanism).
    assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf-8'), /Branch guard/);
  });

  // Tier 3 collision guard: a specialized name equal to a core/profile agent must
  // NOT clobber the real agent, even under --force.
  test('init does not let a Tier 3 stub clobber a core agent', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(
      dir,
      `project:
  name: "Collision E2E"
  mode: "standard"
  language: "typescript"
agents:
  active:
    - orchestrator
    - backend-engineer
  specialized:
    - backend-engineer
    - dsar-specialist
runtimes:
  active:
    - claude-code
`
    );
    const { status } = runForge(['init', '--force'], { cwd: dir });
    assert.equal(status, 0, 'init --force should exit 0');

    // The real core agent survives (tier: 1), not replaced by a tier: 3 stub.
    const core = readFileSync(join(dir, '.claude', 'agents', 'backend-engineer.md'), 'utf-8');
    assert.match(core, /tier:\s*1/, 'core agent was clobbered by a Tier 3 stub');
    assert.doesNotMatch(core, /tier:\s*3/);
    // The non-colliding Tier 3 agent is still scaffolded.
    assert.ok(existsSync(join(dir, '.claude', 'agents', 'dsar-specialist.md')), 'non-colliding Tier 3 stub missing');
  });

  // The ported JS hooks run on Node alone (no Python) and behave like the shell
  // versions. They live in core/hooks/ and are copied verbatim into projects.
  const HOOKS_DIR = join(__dirname, '..', '..', '..', 'core', 'hooks');

  function gitInit(dir) {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['config', 'user.email', 't@t.co'], { cwd: dir });
    spawnSync('git', ['config', 'user.name', 'forge test'], { cwd: dir });
  }

  test('post-turn-check.js exits 0 with no changes (pure JS)', (t) => {
    const dir = makeTmpDir(t);
    gitInit(dir);
    const res = spawnSync(process.execPath, [join(HOOKS_DIR, 'post-turn-check.js')], { cwd: dir, encoding: 'utf-8' });
    assert.equal(res.status, 0, 'post-turn-check.js should exit 0');
    assert.equal(stripAnsi(res.stdout).trim(), '', 'no output when nothing changed');
  });

  test('session-start.js parses project.yaml in JS and warns on missing fields', (t) => {
    const dir = makeTmpDir(t);
    gitInit(dir);
    writeProjectYaml(dir, 'project:\n  name: "Hooky"\n'); // project.mode missing on purpose
    const res = spawnSync(process.execPath, [join(HOOKS_DIR, 'session-start.js')], { cwd: dir, encoding: 'utf-8' });
    assert.equal(res.status, 0, 'session-start.js should exit 0 when git is available');
    // Warns about the missing required field — proves the in-process YAML read works.
    assert.match(stripAnsi(res.stdout), /project\.mode/);
  });
});
