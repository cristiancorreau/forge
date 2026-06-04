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
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
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
    // Hooks are JavaScript (zero Python).
    assert.ok(existsSync(join(dir, '.claude', 'hooks', 'pre-edit-check.js')), 'JS hook missing');
    assert.ok(!existsSync(join(dir, '.claude', 'hooks', 'pre-edit-check.py')), 'Python hook must not exist');
    // Manifest with the current version.
    const manifestPath = join(dir, '.forge', 'manifest.json');
    assert.ok(existsSync(manifestPath), '.forge/manifest.json missing');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifest.forgeVersion, EXPECTED_VERSION);
    assert.equal(manifest.runtime, 'claude-code');

    // settings.json wires hooks via node (no python3).
    const settings = readFileSync(join(dir, '.claude', 'settings.json'), 'utf-8');
    assert.match(settings, /node .claude\/hooks/);
    assert.doesNotMatch(settings, /python3/);
  });
});

// ---------------------------------------------------------------------------
// Runtime-hooks integration suite (issue #32).
//
// `forge generate` must emit executable/automatic guardrail hooks for every
// runtime, not just Claude Code:
//   - Kiro:           branch-guard + bash-check + post-turn-check JSON hooks
//   - OpenCode/Codex: shared .githooks/pre-commit fallback (branch guard + debug)
// ---------------------------------------------------------------------------

const ALL_RUNTIMES_YAML = `project:
  name: "Hooks E2E"
  mode: "standard"
  language: "typescript"
agents:
  active:
    - orchestrator
runtimes:
  active:
    - claude-code
    - opencode
    - codex
    - kiro
`;

describe('forge generate — runtime hooks (issue #32)', () => {
  test('--runtime all produces hook files for the four runtimes', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, ALL_RUNTIMES_YAML);

    const { status, stdout } = runForge(['generate', '--runtime', 'all', '--force'], { cwd: dir });
    assert.equal(status, 0, `generate --runtime all should exit 0; output:\n${stdout}`);

    // Kiro: three JSON hooks.
    const kiroHooks = join(dir, '.kiro', 'hooks');
    assert.ok(existsSync(join(kiroHooks, 'pre-edit-branch-guard.json')), 'kiro branch-guard hook missing');
    assert.ok(existsSync(join(kiroHooks, 'pre-bash-check.json')), 'kiro bash-check hook missing');
    assert.ok(existsSync(join(kiroHooks, 'post-turn-check.json')), 'kiro post-turn-check hook missing');

    // OpenCode + Codex share the executable git fallback.
    assert.ok(existsSync(join(dir, '.githooks', 'pre-commit')), 'shared .githooks/pre-commit missing');
  });

  test('Kiro JSON hooks are valid JSON with the expected event names', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, ALL_RUNTIMES_YAML);
    runForge(['generate', '--runtime', 'kiro', '--force'], { cwd: dir });

    const kiroHooks = join(dir, '.kiro', 'hooks');
    const branch = JSON.parse(readFileSync(join(kiroHooks, 'pre-edit-branch-guard.json'), 'utf-8'));
    const bash = JSON.parse(readFileSync(join(kiroHooks, 'pre-bash-check.json'), 'utf-8'));
    const post = JSON.parse(readFileSync(join(kiroHooks, 'post-turn-check.json'), 'utf-8'));

    assert.equal(branch.event, 'PreEdit');
    assert.equal(bash.event, 'PreBash');
    assert.equal(post.event, 'PostTurn');

    // bash-check must block, not just warn, and cover destructive patterns.
    assert.equal(bash.action.type, 'block');
    assert.ok(bash.condition.script.includes('DROP'), 'bash-check must guard DROP statements');
    assert.ok(bash.condition.script.includes('--force-reset'), 'bash-check must guard --force-reset');

    // post-turn-check looks for debug statements.
    assert.ok(post.condition.script.includes('console'), 'post-turn-check must look for console.log');
    assert.ok(post.action.message.includes('debug'), 'post-turn-check message must mention debug');
  });

  test('OpenCode generates the shared git pre-commit hook (executable)', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, ALL_RUNTIMES_YAML);
    const { status } = runForge(['generate', '--runtime', 'opencode', '--force'], { cwd: dir });
    assert.equal(status, 0);

    const hook = join(dir, '.githooks', 'pre-commit');
    assert.ok(existsSync(hook), 'opencode did not generate .githooks/pre-commit');

    const content = readFileSync(hook, 'utf-8');
    assert.match(content, /#!\/bin\/sh/, 'hook must be a POSIX sh script');
    assert.doesNotMatch(content, /python/i, 'shared hook must not require Python');
    assert.ok(content.includes('main') && content.includes('master'), 'branch guard must cover main/master');
    assert.ok(content.includes('console') && content.includes('.log'), 'debug detection must cover console.log');
    assert.match(content, /debugger;/);

    // Executable bit set (owner-exec) on non-Windows.
    if (process.platform !== 'win32') {
      assert.ok((statSync(hook).mode & 0o100) !== 0, 'pre-commit hook must be executable');
    }
  });

  test('Codex generates the shared git pre-commit hook', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, ALL_RUNTIMES_YAML);
    const { status } = runForge(['generate', '--runtime', 'codex', '--force'], { cwd: dir });
    assert.equal(status, 0);
    assert.ok(existsSync(join(dir, '.githooks', 'pre-commit')), 'codex did not generate .githooks/pre-commit');
  });

  test('Codex and OpenCode AGENTS.md document the git hook mechanism', (t) => {
    const dirA = makeTmpDir(t);
    writeProjectYaml(dirA, ALL_RUNTIMES_YAML);
    runForge(['generate', '--runtime', 'codex', '--force'], { cwd: dirA });
    assert.match(
      readFileSync(join(dirA, 'AGENTS.md'), 'utf-8'),
      /core\.hooksPath \.githooks/,
      'Codex AGENTS.md must document core.hooksPath',
    );

    const dirB = makeTmpDir(t);
    writeProjectYaml(dirB, ALL_RUNTIMES_YAML);
    runForge(['generate', '--runtime', 'opencode', '--force'], { cwd: dirB });
    assert.match(
      readFileSync(join(dirB, 'AGENTS.md'), 'utf-8'),
      /core\.hooksPath \.githooks/,
      'OpenCode AGENTS.md must document core.hooksPath',
    );
  });

  test('generate --runtime all --dry-run does not write any hook files', (t) => {
    const dir = makeTmpDir(t);
    writeProjectYaml(dir, ALL_RUNTIMES_YAML);
    runForge(['generate', '--runtime', 'all', '--dry-run'], { cwd: dir });
    assert.ok(!existsSync(join(dir, '.githooks', 'pre-commit')), 'dry-run must not write the git hook');
    assert.ok(!existsSync(join(dir, '.kiro', 'hooks', 'pre-bash-check.json')), 'dry-run must not write kiro hooks');
  });
});
