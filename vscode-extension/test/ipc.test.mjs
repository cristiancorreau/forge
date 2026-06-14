// SPEC-070 / SPEC-072 — unit tests for the pure action → CLI args mapping.
//
//   cd vscode-extension && npm run compile && node --test test/ipc.test.mjs
//
// Imports the COMPILED module (out/ipc.js); run `npm run compile` first.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'out', 'ipc.js');

let toArgs;
let terminalCommandForRuntime;
before(async () => {
  assert.ok(existsSync(OUT), 'out/ipc.js missing — run `npm run compile` first');
  ({ toArgs, terminalCommandForRuntime } = await import(pathToFileURL(OUT).href));
});

describe('terminalCommandForRuntime — runtime → agent CLI', () => {
  test('maps the known runtimes', () => {
    assert.equal(terminalCommandForRuntime('claude-code'), 'claude');
    assert.equal(terminalCommandForRuntime('opencode'), 'opencode');
    assert.equal(terminalCommandForRuntime('codex'), 'codex');
    assert.equal(terminalCommandForRuntime('gemini'), 'gemini');
  });
  test('returns null for unknown / empty', () => {
    assert.equal(terminalCommandForRuntime('kiro'), null);
    assert.equal(terminalCommandForRuntime(''), null);
    assert.equal(terminalCommandForRuntime(undefined), null);
  });
});

describe('toArgs — runInit', () => {
  test('maps answersFile to init --from <file>', () => {
    assert.deepEqual(toArgs('runInit', { answersFile: 'answers.json' }), ['init', '--from', 'answers.json']);
  });
  test('appends --dry-run when requested', () => {
    assert.deepEqual(
      toArgs('runInit', { answersFile: '/tmp/a.json', dryRun: true }),
      ['init', '--from', '/tmp/a.json', '--dry-run']
    );
  });
  test('omits --dry-run when false', () => {
    assert.deepEqual(toArgs('runInit', { answersFile: 'x', dryRun: false }), ['init', '--from', 'x']);
  });
});

describe('toArgs — runAdopt', () => {
  test('bare adopt is non-interactive (--yes)', () => {
    assert.deepEqual(toArgs('runAdopt', {}), ['adopt', '--yes']);
  });
  test('includes runtime and mode flags when provided', () => {
    assert.deepEqual(
      toArgs('runAdopt', { runtime: 'opencode', mode: 'enterprise' }),
      ['adopt', '--yes', '--runtime', 'opencode', '--mode', 'enterprise']
    );
  });
  test('wiki === false appends --no-wiki; true does not', () => {
    assert.deepEqual(toArgs('runAdopt', { wiki: false }), ['adopt', '--yes', '--no-wiki']);
    assert.deepEqual(toArgs('runAdopt', { wiki: true }), ['adopt', '--yes']);
  });
  test('full payload order is runtime, mode, no-wiki, dry-run', () => {
    assert.deepEqual(
      toArgs('runAdopt', { runtime: 'codex', mode: 'startup', wiki: false, dryRun: true }),
      ['adopt', '--yes', '--runtime', 'codex', '--mode', 'startup', '--no-wiki', '--dry-run']
    );
  });
});

describe('toArgs — runAudit / runDoctor', () => {
  test('audit is always --json', () => {
    assert.deepEqual(toArgs('runAudit', {}), ['audit', '--json']);
  });
  test('doctor has no flags', () => {
    assert.deepEqual(toArgs('runDoctor', {}), ['doctor']);
  });
});

describe('toArgs — runGenerate', () => {
  test('no runtime → auto-detect (bare generate)', () => {
    assert.deepEqual(toArgs('runGenerate', {}), ['generate']);
  });
  test('runtime → --runtime <name>', () => {
    assert.deepEqual(toArgs('runGenerate', { runtime: 'claude-code' }), ['generate', '--runtime', 'claude-code']);
  });
});

describe('toArgs — guard', () => {
  test('unknown action throws', () => {
    assert.throws(() => toArgs('bogus', {}), /unknown action/);
  });
});
