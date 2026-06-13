// Tests for the shared, platform-aware Bun relaunch decision (SPEC-036).
//
// Part 1 factored the "should we re-launch under Bun to render OpenTUI?" decision
// + spawn into pure, injectable helpers in lib/bun.ts so the full matrix
// (darwin/win32/linux × bun present/absent × TTY × WT_SESSION × the
// FORGE_FORCE_BUN/FORGE_NO_BUN overrides × the relaunch guard) is unit-testable
// on any host without spawning a real process.
//
// Imports the COMPILED module from dist/, so the CLI must be built first
// (npm run build:all). Run directly with: node --test test/bun-relaunch.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

// Dynamic import() of an absolute path needs a file:// URL on Windows.
const importDist = (...parts) => import(pathToFileURL(join(DIST, ...parts)).href);

let bunMod;

before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'bun.js')),
    'dist not built — run "npm run build:all" before the tests.');
  bunMod = await importDist('lib', 'bun.js');
});

const BUN = '/usr/local/bin/bun'; // a stand-in resolved bun path

// OpenTUI is opt-in (SPEC-065): every "→ true" case below also requires
// FORGE_ENABLE_OPENTUI=1. ON merges that gate into a test env; the default
// (without the flag) is asserted separately in the opt-in describe block.
const ON = (env = {}) => ({ FORGE_ENABLE_OPENTUI: '1', ...env });

// ── shouldRelaunchUnderBun — OpenTUI opt-in gate (SPEC-065) ─────────────────────
describe('lib/bun — shouldRelaunchUnderBun (FORGE_ENABLE_OPENTUI opt-in gate)', () => {
  test('no FORGE_ENABLE_OPENTUI → false even with bun + TTY on darwin (default = @clack)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'darwin', bunPath: BUN, isTTY: true, env: {} }),
      false,
    );
  });

  test('no FORGE_ENABLE_OPENTUI → false on win32 Windows Terminal (default = @clack)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'win32', bunPath: BUN, isTTY: true, env: { WT_SESSION: '1' } }),
      false,
    );
  });

  test('no FORGE_ENABLE_OPENTUI → false even with FORGE_FORCE_BUN=1 (opt-in gate wins)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'darwin', bunPath: BUN, isTTY: true, env: { FORGE_FORCE_BUN: '1' } }),
      false,
    );
  });

  test('FORGE_ENABLE_OPENTUI=1 + bun + TTY → true (opt-in path enabled)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'darwin', bunPath: BUN, isTTY: true, env: ON() }),
      true,
    );
  });

  test('FORGE_ENABLE_OPENTUI=1 + win32 Windows Terminal + bun + TTY → true', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'win32', bunPath: BUN, isTTY: true, env: ON({ WT_SESSION: '1' }) }),
      true,
    );
  });
});

// ── shouldRelaunchUnderBun — matrix on the opt-in path (FORGE_ENABLE_OPENTUI=1) ──
describe('lib/bun — shouldRelaunchUnderBun (relaunch decision matrix, OpenTUI on)', () => {
  test('darwin + bun + TTY → true (default macOS behaviour preserved)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'darwin', bunPath: BUN, isTTY: true, env: ON() }),
      true,
    );
  });

  test('linux + bun + TTY → true', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'linux', bunPath: BUN, isTTY: true, env: ON() }),
      true,
    );
  });

  test('FORGE_NO_BUN=1 → false even with bun + TTY', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'darwin', bunPath: BUN, isTTY: true, env: ON({ FORGE_NO_BUN: '1' }) }),
      false,
    );
  });

  test('no TTY → false (panels need a real terminal)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'darwin', bunPath: BUN, isTTY: false, env: ON() }),
      false,
    );
  });

  test('no bun resolved → false', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'darwin', bunPath: null, isTTY: true, env: ON() }),
      false,
    );
  });

  test('already under Bun → false (nothing to relaunch)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'darwin', bunPath: BUN, isTTY: true, alreadyBun: true, env: ON() }),
      false,
    );
  });

  test('FORGE_BUN_RELAUNCH=1 guard → false (prevents infinite re-launch)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'darwin', bunPath: BUN, isTTY: true, env: ON({ FORGE_BUN_RELAUNCH: '1' }) }),
      false,
    );
  });

  // ── Windows matrix ──
  test('win32 + bun + TTY, NO capable terminal → false (avoid broken OpenTUI)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'win32', bunPath: BUN, isTTY: true, env: ON() }),
      false,
    );
  });

  test('win32 + bun + TTY + WT_SESSION (Windows Terminal) → true', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'win32', bunPath: BUN, isTTY: true, env: ON({ WT_SESSION: '1' }) }),
      true,
    );
  });

  test('win32 + bun + TTY + TERM_PROGRAM (e.g. VS Code) → true', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'win32', bunPath: BUN, isTTY: true, env: ON({ TERM_PROGRAM: 'vscode' }) }),
      true,
    );
  });

  test('win32 legacy console but FORGE_FORCE_BUN=1 → true (override the gate)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'win32', bunPath: BUN, isTTY: true, env: ON({ FORGE_FORCE_BUN: '1' }) }),
      true,
    );
  });

  test('win32 + WT_SESSION but FORGE_NO_BUN=1 → false (opt-out wins over force)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'win32', bunPath: BUN, isTTY: true, env: ON({ WT_SESSION: '1', FORGE_NO_BUN: '1' }) }),
      false,
    );
  });

  test('win32 + FORGE_FORCE_BUN but no TTY → false (gate runs before force)', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'win32', bunPath: BUN, isTTY: false, env: ON({ FORGE_FORCE_BUN: '1' }) }),
      false,
    );
  });

  test('win32 + FORGE_FORCE_BUN but no bun → false', () => {
    assert.equal(
      bunMod.shouldRelaunchUnderBun({ platform: 'win32', bunPath: null, isTTY: true, env: ON({ FORGE_FORCE_BUN: '1' }) }),
      false,
    );
  });
});

// ── relaunchUnderBun ───────────────────────────────────────────────────────────
describe('lib/bun — relaunchUnderBun (spawn + guard + exit code)', () => {
  test('sets FORGE_BUN_RELAUNCH=1 and propagates the child exit code', () => {
    // Use the host node as a stand-in "bun" that runs a tiny script asserting the
    // guard env is present and exits with a known code. This exercises the real
    // spawnSync path (stdio inherit, env propagation, status passthrough).
    const NODE = process.execPath;
    const script =
      'if (process.env.FORGE_BUN_RELAUNCH !== "1") process.exit(2); ' +
      'if (process.argv[1] !== "init") process.exit(3); ' +
      'process.exit(7);';
    // relaunchUnderBun spawns NODE ['-e', script, 'init']: with `node -e <code>
    // <args...>`, positional args start at process.argv[1] inside the eval (there
    // is no script-path slot). So argv[1] === 'init', guard set → exit 7.
    const code = bunMod.relaunchUnderBun(NODE, '-e', [script, 'init'], { PATH: process.env.PATH });
    assert.equal(code, 7);
  });

  test('child without the guard would exit 2 (sanity: env IS injected → not 2)', () => {
    const NODE = process.execPath;
    // A script that exits 0 only when the guard is set; if relaunchUnderBun failed
    // to inject it the child would exit 9.
    const script = 'process.exit(process.env.FORGE_BUN_RELAUNCH === "1" ? 0 : 9);';
    const code = bunMod.relaunchUnderBun(NODE, '-e', [script], { PATH: process.env.PATH });
    assert.equal(code, 0);
  });
});

// ── bunFallbackHint ────────────────────────────────────────────────────────────
describe('lib/bun — bunFallbackHint (one friendly nudge)', () => {
  test('returns the hint string in a TTY when not under Bun and not opted out', () => {
    const hint = bunMod.bunFallbackHint({ isTTY: true, alreadyBun: false, env: {} });
    assert.equal(hint, bunMod.BUN_FALLBACK_HINT);
    assert.match(hint, /bun\.sh/);
  });

  test('returns null when there is no TTY', () => {
    assert.equal(bunMod.bunFallbackHint({ isTTY: false, alreadyBun: false, env: {} }), null);
  });

  test('returns null when already running under Bun (OpenTUI in use)', () => {
    assert.equal(bunMod.bunFallbackHint({ isTTY: true, alreadyBun: true, env: {} }), null);
  });

  test('returns null when FORGE_NO_BUN=1 (user opted out — no nudge)', () => {
    assert.equal(bunMod.bunFallbackHint({ isTTY: true, alreadyBun: false, env: { FORGE_NO_BUN: '1' } }), null);
  });
});
