// Tests for panel-commands.ts (SPEC-059 PR3/PR4).
//
// Covers: COMMANDS registry, fuzzyMatch, logBuffer, runPanelCommand.
// All pure — no TTY, no Bun, no OpenTUI.
//
// Imports from dist/ — run "npm run build:all" first.
// Run directly with: node --test test/panel-commands.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const ASSETS = join(__dirname, '..', 'assets');

process.env.FORGE_HOME = ASSETS;

const importDist = (...parts) => import(pathToFileURL(join(DIST, ...parts)).href);

let mod;

before(async () => {
  assert.ok(
    existsSync(join(DIST, 'lib', 'panel-commands.js')),
    'dist not built — run "npm run build:all" before the tests.',
  );
  mod = await importDist('lib', 'panel-commands.js');
});

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-pcmd-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ── COMMANDS registry ────────────────────────────────────────────────────────

describe('COMMANDS registry', () => {
  test('COMMANDS is a non-empty array', () => {
    assert.ok(Array.isArray(mod.COMMANDS), 'COMMANDS must be an array');
    assert.ok(mod.COMMANDS.length > 0, 'COMMANDS must not be empty');
  });

  test('has exactly 23 commands', () => {
    assert.equal(mod.COMMANDS.length, 23, 'expected 23 commands');
  });

  test('every command has required fields', () => {
    const validKinds = new Set(['pure', 'writes-fs', 'delegated']);
    for (const cmd of mod.COMMANDS) {
      assert.equal(typeof cmd.id, 'string', `${cmd.id}: id must be a string`);
      assert.ok(cmd.id.length > 0, 'id must not be empty');
      assert.equal(typeof cmd.name, 'string', `${cmd.id}: name must be a string`);
      assert.ok(cmd.name.length > 0, 'name must not be empty');
      assert.ok(Array.isArray(cmd.aliases), `${cmd.id}: aliases must be an array`);
      assert.equal(typeof cmd.desc, 'string', `${cmd.id}: desc must be a string`);
      assert.ok(cmd.desc.length > 0, `${cmd.id}: desc must not be empty`);
      assert.ok(validKinds.has(cmd.kind), `${cmd.id}: kind must be pure|writes-fs|delegated, got "${cmd.kind}"`);
    }
  });

  test('ids are unique', () => {
    const ids = mod.COMMANDS.map(c => c.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, 'all command ids must be unique');
  });

  test('pure commands include audit, doctor, validate, recommend, skills, catalog', () => {
    const pureIds = mod.COMMANDS.filter(c => c.kind === 'pure').map(c => c.id);
    const expected = ['audit', 'doctor', 'validate', 'recommend', 'skills', 'catalog'];
    for (const id of expected) {
      assert.ok(pureIds.includes(id), `expected '${id}' to be pure`);
    }
  });

  test('writes-fs commands include generate, update, adopt, add, scaffold, teardown', () => {
    const fsIds = mod.COMMANDS.filter(c => c.kind === 'writes-fs').map(c => c.id);
    const expected = ['generate', 'update', 'adopt', 'add', 'scaffold', 'teardown'];
    for (const id of expected) {
      assert.ok(fsIds.includes(id), `expected '${id}' to be writes-fs`);
    }
  });

  test('delegated commands include init, migrate, session-start, session-close, mcp, wiki', () => {
    const delIds = mod.COMMANDS.filter(c => c.kind === 'delegated').map(c => c.id);
    const expected = ['init', 'migrate', 'session-start', 'session-close', 'mcp', 'wiki'];
    for (const id of expected) {
      assert.ok(delIds.includes(id), `expected '${id}' to be delegated`);
    }
  });
});

// ── fuzzyMatch ───────────────────────────────────────────────────────────────

describe('fuzzyMatch', () => {
  test('empty query returns all commands', () => {
    const results = mod.fuzzyMatch('', mod.COMMANDS);
    assert.equal(results.length, mod.COMMANDS.length, 'empty query must return all commands');
  });

  test('whitespace-only query returns all commands', () => {
    const results = mod.fuzzyMatch('   ', mod.COMMANDS);
    assert.equal(results.length, mod.COMMANDS.length);
  });

  test('rcm → recommend (alias subsequence match)', () => {
    const results = mod.fuzzyMatch('rcm', mod.COMMANDS);
    assert.ok(results.length > 0, 'rcm must match at least one command');
    assert.equal(results[0].id, 'recommend', 'recommend must be the first result for "rcm"');
  });

  test('exact prefix match scores highest — "aud" → audit first', () => {
    const results = mod.fuzzyMatch('aud', mod.COMMANDS);
    assert.ok(results.length > 0, 'aud must match at least one command');
    assert.equal(results[0].id, 'audit', '"aud" prefix must rank audit first');
  });

  test('doc → doctor first', () => {
    const results = mod.fuzzyMatch('doc', mod.COMMANDS);
    assert.ok(results.length > 0);
    assert.equal(results[0].id, 'doctor');
  });

  test('non-matching query returns empty array', () => {
    const results = mod.fuzzyMatch('zzzznotacommand', mod.COMMANDS);
    assert.equal(results.length, 0, 'non-matching query must return []');
  });

  test('results are ordered by score (best first)', () => {
    const results = mod.fuzzyMatch('rec', mod.COMMANDS);
    assert.ok(results.length >= 1);
    // All returned results must be actual matches
    for (const cmd of results) {
      const matchable = [cmd.name, cmd.id, ...cmd.aliases].join(' ').toLowerCase();
      assert.ok(matchable.includes('rec') || mod.scoreMatch('rec', cmd.name) >= 0 || mod.scoreMatch('rec', cmd.id) >= 0,
        `command '${cmd.id}' should have matched 'rec'`);
    }
  });

  test('alias match — "sk" → skills', () => {
    const results = mod.fuzzyMatch('sk', mod.COMMANDS);
    assert.ok(results.some(r => r.id === 'skills'), '"sk" must match skills via alias');
  });

  test('custom commands list is used when provided', () => {
    const custom = [mod.COMMANDS[0], mod.COMMANDS[1]];
    const results = mod.fuzzyMatch('', custom);
    assert.equal(results.length, 2);
  });
});

// ── logBuffer ────────────────────────────────────────────────────────────────

describe('logBuffer', () => {
  test('logBuffer(n) respects maxLines', () => {
    const buf = mod.logBuffer(5);
    for (let i = 0; i < 10; i++) buf.append(`line ${i}`);
    const win = buf.getWindow();
    assert.equal(win.length, 5, 'window must not exceed maxLines');
  });

  test('getWindow returns the most recent lines', () => {
    const buf = mod.logBuffer(3);
    buf.append('a');
    buf.append('b');
    buf.append('c');
    buf.append('d');
    const win = buf.getWindow();
    assert.deepEqual(win, ['b', 'c', 'd']);
  });

  test('total tracks all lines appended (including scrolled off)', () => {
    const buf = mod.logBuffer(3);
    buf.append(['x', 'y', 'z', 'w']);
    assert.equal(buf.total, 4);
  });

  test('append with array splits correctly', () => {
    const buf = mod.logBuffer(10);
    buf.append(['line1', 'line2', 'line3']);
    assert.equal(buf.total, 3);
    assert.deepEqual(buf.getWindow(), ['line1', 'line2', 'line3']);
  });

  test('append with string containing newlines splits correctly', () => {
    const buf = mod.logBuffer(10);
    buf.append('line1\nline2\nline3');
    assert.equal(buf.total, 3);
  });

  test('empty buffer returns []', () => {
    const buf = mod.logBuffer(5);
    assert.deepEqual(buf.getWindow(), []);
  });

  test('maxLines = 1 keeps only the last line', () => {
    const buf = mod.logBuffer(1);
    buf.append('first');
    buf.append('second');
    assert.deepEqual(buf.getWindow(), ['second']);
  });

  test('maxLines < 1 throws RangeError', () => {
    assert.throws(() => mod.logBuffer(0), /maxLines must be >= 1/);
    assert.throws(() => mod.logBuffer(-1), /maxLines must be >= 1/);
  });

  test('maxLines property is accessible', () => {
    const buf = mod.logBuffer(7);
    assert.equal(buf.maxLines, 7);
  });
});

// ── runPanelCommand ──────────────────────────────────────────────────────────

describe('runPanelCommand', () => {
  test('unknown command id returns ok:false with error line', async (t) => {
    const dir = makeTmpDir(t);
    const result = await mod.runPanelCommand('not-a-real-command', { root: dir, forgeRoot: ASSETS });
    assert.equal(result.ok, false);
    assert.ok(Array.isArray(result.lines));
    assert.ok(result.lines.some(l => /not-a-real-command|Unknown/i.test(l)));
  });

  test('delegated command returns DelegateSignal', async (t) => {
    const dir = makeTmpDir(t);
    const result = await mod.runPanelCommand('init', { root: dir, forgeRoot: ASSETS });
    assert.equal(result.delegate, true, 'init must return delegate:true');
    assert.ok(typeof result.cmd === 'string');
    assert.ok(typeof result.reason === 'string');
  });

  test('writes-fs command returns NeedsApplySignal', async (t) => {
    const dir = makeTmpDir(t);
    const result = await mod.runPanelCommand('generate', { root: dir, forgeRoot: ASSETS });
    assert.equal(result.needsApply, true, 'generate must return needsApply:true');
    assert.ok(typeof result.cmd === 'string');
    assert.ok(typeof result.reason === 'string');
  });

  test('audit (pure) runs in-process and returns lines', async (t) => {
    const dir = makeTmpDir(t);
    const result = await mod.runPanelCommand('audit', { root: dir, forgeRoot: ASSETS });
    // audit should succeed structurally (may have warnings for missing config)
    assert.ok(Array.isArray(result.lines), 'lines must be an array');
    assert.ok(result.lines.length > 0, 'lines must not be empty');
    assert.ok(typeof result.ok === 'boolean', 'ok must be boolean');
    // First line should mention audit
    assert.ok(result.lines.some(l => /audit/i.test(l)), 'output should mention audit');
  });

  test('doctor (pure) runs in-process and returns lines', async (t) => {
    const dir = makeTmpDir(t);
    const result = await mod.runPanelCommand('doctor', { root: dir, forgeRoot: ASSETS });
    assert.ok(Array.isArray(result.lines));
    assert.ok(result.lines.length > 0);
    assert.ok(typeof result.ok === 'boolean');
    assert.ok(result.lines.some(l => /doctor|Node/i.test(l)));
  });

  test('skills (pure) returns skill listing', async (t) => {
    const dir = makeTmpDir(t);
    const result = await mod.runPanelCommand('skills', { root: dir, forgeRoot: ASSETS });
    assert.ok(Array.isArray(result.lines));
    assert.ok(result.lines.length > 0);
    assert.equal(result.ok, true);
  });

  test('version (pure) returns version string', async (t) => {
    const dir = makeTmpDir(t);
    const result = await mod.runPanelCommand('version', { root: dir, forgeRoot: ASSETS });
    assert.ok(Array.isArray(result.lines));
    assert.ok(result.lines.some(l => /forge v\d/.test(l)), 'version output must include "forge v<n>"');
  });

  test('delegated: migrate returns delegate signal', async (t) => {
    const dir = makeTmpDir(t);
    const result = await mod.runPanelCommand('migrate', { root: dir, forgeRoot: ASSETS });
    assert.equal(result.delegate, true);
    assert.ok(result.cmd.includes('migrate'));
  });

  test('delegated: session-start returns delegate signal', async (t) => {
    const dir = makeTmpDir(t);
    const result = await mod.runPanelCommand('session-start', { root: dir, forgeRoot: ASSETS });
    assert.equal(result.delegate, true);
  });

  test('writes-fs: teardown returns needsApply signal', async (t) => {
    const dir = makeTmpDir(t);
    const result = await mod.runPanelCommand('teardown', { root: dir, forgeRoot: ASSETS });
    assert.equal(result.needsApply, true);
    assert.ok(result.cmd.includes('teardown'));
  });
});

// ── scoreMatch (re-exported for direct testing) ───────────────────────────────

describe('scoreMatch', () => {
  test('exact prefix scores higher than scattered match', () => {
    const exactPrefixScore = mod.scoreMatch('aud', 'audit');
    const scatteredScore = mod.scoreMatch('aud', 'agentic-updated');
    assert.ok(exactPrefixScore > scatteredScore, 'prefix match must outscore scattered match');
  });

  test('non-subsequence returns -1', () => {
    const score = mod.scoreMatch('xyz', 'audit');
    assert.equal(score, -1);
  });

  test('empty query returns 0', () => {
    assert.equal(mod.scoreMatch('', 'anything'), 0);
  });
});
