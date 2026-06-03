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
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

const EXPECTED_VERSION = '2.8.0';
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

  test('--version reports 2.8.0', () => {
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

  test('an unknown command exits 1', () => {
    const { status, all } = runForge(['definitely-not-a-command']);
    assert.equal(status, 1);
    assert.match(all, /Unknown command/);
  });
});
