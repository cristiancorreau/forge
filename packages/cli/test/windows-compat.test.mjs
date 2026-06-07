// Tests for Windows/PowerShell compatibility logic (SPEC-035).
//
// These exercise the platform-dependent helpers in a platform-independent way by
// injecting the platform/env, so they assert the Windows behaviour while running
// on macOS/Linux CI as well as on real windows-latest CI.
//
// Imports the COMPILED modules from dist/, so the CLI must be built first
// (npm run build:all). Run directly with: node --test test/windows-compat.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

// Dynamic import() of an absolute path needs a file:// URL on Windows
// (a bare "D:\..." path throws ERR_UNSUPPORTED_ESM_URL_SCHEME).
const importDist = (...parts) => import(pathToFileURL(join(DIST, ...parts)).href);

let bunMod, asciiMod, boxMod, bannerMod;

before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'bun.js')),
    'dist not built — run "npm run build:all" before the tests.');
  bunMod = await importDist('lib', 'bun.js');
  asciiMod = await importDist('ui', 'ascii.js');
  boxMod = await importDist('ui', 'box.js');
  bannerMod = await importDist('ui', 'banner.js');
});

// ── Bun resolver ─────────────────────────────────────────────────────────────
describe('lib/bun — cross-platform Bun resolver', () => {
  test('win32 candidates include %USERPROFILE%\\.bun\\bin\\bun.exe', () => {
    const candidates = bunMod.bunCandidates({
      platform: 'win32',
      env: { USERPROFILE: 'C:\\Users\\dev' },
    });
    // The home candidate must end with the Windows Bun path (path.join uses the
    // host separator; assert on the components instead of a literal string).
    const winCandidate = candidates.find(c => c.includes('.bun') && c.endsWith('bun.exe') && c.includes('dev'));
    assert.ok(winCandidate, `expected a USERPROFILE bun.exe candidate, got: ${candidates.join(', ')}`);
    assert.ok(winCandidate.includes('C:\\Users\\dev') || winCandidate.includes('C:/Users/dev'),
      'candidate must be rooted at USERPROFILE');
    // The bare command (bun.exe / bun) is always tried first.
    assert.ok(candidates[0] === 'bun.exe' || candidates[0] === 'bun');
  });

  test('win32 falls back to HOMEDRIVE+HOMEPATH when USERPROFILE is unset', () => {
    const candidates = bunMod.bunCandidates({
      platform: 'win32',
      env: { HOMEDRIVE: 'C:', HOMEPATH: '\\Users\\alt' },
    });
    assert.ok(
      candidates.some(c => c.includes('alt') && c.endsWith('bun.exe')),
      `expected a HOMEDRIVE+HOMEPATH candidate, got: ${candidates.join(', ')}`,
    );
  });

  test('posix candidates use ~/.bun/bin/bun and system locations', () => {
    const candidates = bunMod.bunCandidates({
      platform: 'linux',
      env: { HOME: '/home/dev' },
    });
    assert.equal(candidates[0], 'bun');
    assert.ok(candidates.includes('/home/dev/.bun/bin/bun'));
    assert.ok(candidates.includes('/opt/homebrew/bin/bun'));
    assert.ok(candidates.includes('/usr/local/bin/bun'));
    // No Windows .exe candidate on POSIX.
    assert.ok(!candidates.some(c => c.endsWith('.exe')));
  });

  test('findBun honours FORGE_NO_BUN=1 (returns null without probing)', () => {
    const result = bunMod.findBun({ platform: 'win32', env: { FORGE_NO_BUN: '1', USERPROFILE: 'C:\\Users\\dev' } });
    assert.equal(result, null);
  });

  test('resolveCliEntry yields a path without a leading-slash drive (Windows-safe)', () => {
    // Simulate a dist/commands/init.js module URL and resolve ../cli.js.
    const fakeMetaUrl = pathToFileURL(join(DIST, 'commands', 'init.js')).href;
    const entry = bunMod.resolveCliEntry(fakeMetaUrl);
    assert.ok(entry.endsWith('cli.js'), `expected .../cli.js, got ${entry}`);
    // fileURLToPath never produces the URL.pathname "/C:/..." artefact.
    assert.ok(!/^\/[A-Za-z]:/.test(entry), 'must not start with /<drive>:');
  });
});

// ── useAscii ─────────────────────────────────────────────────────────────────
describe('ui/ascii — useAscii()', () => {
  test('FORGE_ASCII=1 forces ASCII on any platform', () => {
    assert.equal(asciiMod.useAscii({ platform: 'darwin', env: { FORGE_ASCII: '1' } }), true);
    assert.equal(asciiMod.useAscii({ platform: 'linux', env: { FORGE_ASCII: '1' } }), true);
  });

  test('FORGE_ASCII=0 forces Unicode even on legacy Windows', () => {
    assert.equal(asciiMod.useAscii({ platform: 'win32', env: { FORGE_ASCII: '0' } }), false);
  });

  test('win32 without Windows Terminal (no WT_SESSION) → ASCII', () => {
    assert.equal(asciiMod.useAscii({ platform: 'win32', env: {} }), true);
  });

  test('win32 inside Windows Terminal (WT_SESSION set) → Unicode', () => {
    assert.equal(asciiMod.useAscii({ platform: 'win32', env: { WT_SESSION: '1' } }), false);
  });

  test('macOS/Linux default to Unicode', () => {
    assert.equal(asciiMod.useAscii({ platform: 'darwin', env: {} }), false);
    assert.equal(asciiMod.useAscii({ platform: 'linux', env: {} }), false);
  });

  test('borderChars switches the charset', () => {
    const ascii = asciiMod.borderChars({ env: { FORGE_ASCII: '1' } });
    assert.equal(ascii.vertical, '|');
    assert.equal(ascii.horizontal, '-');
    assert.equal(ascii.topLeft, '+');

    const unicode = asciiMod.borderChars({ env: { FORGE_ASCII: '0' } });
    assert.equal(unicode.vertical, '│');
    assert.equal(unicode.horizontal, '─');
    assert.equal(unicode.topLeft, '┌');
  });

  test('boxenBorderStyle maps to classic for ASCII, passes through otherwise', () => {
    assert.equal(asciiMod.boxenBorderStyle('double', { env: { FORGE_ASCII: '1' } }), 'classic');
    assert.equal(asciiMod.boxenBorderStyle('double', { env: { FORGE_ASCII: '0' } }), 'double');
    assert.equal(asciiMod.boxenBorderStyle('round', { env: { FORGE_ASCII: '0' } }), 'round');
  });

  // OpenTUI BoxRenderable custom border chars (#74 — legacy Windows render).
  test('tuiBorderChars returns an all-ASCII 12-glyph set in ASCII mode', () => {
    const a = asciiMod.tuiBorderChars({ env: { FORGE_ASCII: '1' } });
    assert.ok(a, 'ASCII mode must return a charset');
    for (const k of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'horizontal', 'vertical', 'topT', 'bottomT', 'leftT', 'rightT', 'cross']) {
      assert.equal(typeof a[k], 'string', `${k} present`);
      assert.ok(/^[-+|]$/.test(a[k]), `${k} is a plain-ASCII glyph (got ${JSON.stringify(a[k])})`);
    }
  });

  test('tuiBorderChars is undefined off ASCII mode (no-op → Unicode borderStyle kept)', () => {
    assert.equal(asciiMod.tuiBorderChars({ platform: 'darwin', env: {} }), undefined);
    assert.equal(asciiMod.tuiBorderChars({ platform: 'linux', env: {} }), undefined);
    assert.equal(asciiMod.tuiBorderChars({ platform: 'win32', env: { WT_SESSION: '1' } }), undefined);
    // legacy Windows console → ASCII charset
    assert.ok(asciiMod.tuiBorderChars({ platform: 'win32', env: {} }));
  });
});

// ── box renderer ─────────────────────────────────────────────────────────────
describe('ui/box — ASCII-aware box renderer', () => {
  // box() reads the ambient process.env. NO_COLOR keeps the assertions on plain
  // glyphs (colors.ts disables ANSI when NO_COLOR is set), and FORGE_ASCII picks
  // the charset. We restore both after each toggle.
  function withEnv(env, fn) {
    const saved = {};
    for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
    try { return fn(); }
    finally {
      for (const k of Object.keys(env)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  }

  test('emits ASCII borders when FORGE_ASCII=1', () => {
    const out = withEnv({ FORGE_ASCII: '1', NO_COLOR: '1' }, () =>
      boxMod.box('Title', ['line one', 'line two']));
    assert.ok(out.includes('+'), 'ASCII box must use + corners');
    assert.ok(out.includes('|'), 'ASCII box must use | verticals');
    assert.ok(out.includes('-'), 'ASCII box must use - horizontals');
    // No Unicode box-drawing glyphs leak through.
    assert.ok(!/[│┌┐└┘─]/.test(out), 'ASCII box must not contain Unicode box glyphs');
  });

  test('emits Unicode borders when FORGE_ASCII=0', () => {
    const out = withEnv({ FORGE_ASCII: '0', NO_COLOR: '1' }, () =>
      boxMod.box('Title', ['line one']));
    assert.ok(/[│┌┐└┘─]/.test(out), 'Unicode box must contain box-drawing glyphs');
  });
});

// ── banner ───────────────────────────────────────────────────────────────────
describe('ui/banner — ASCII fallback banner', () => {
  test('forgeBanner returns the ASCII rows under FORGE_ASCII=1', () => {
    const rows = bannerMod.forgeBanner({ env: { FORGE_ASCII: '1' } });
    assert.equal(rows, bannerMod.FORGE_BANNER_ASCII);
    // ASCII banner contains no block glyphs.
    assert.ok(!rows.some(l => /[█╗╝╔╚║═]/.test(l)), 'ASCII banner must be block-glyph free');
  });

  test('forgeBanner returns the Unicode block banner by default', () => {
    const rows = bannerMod.forgeBanner({ platform: 'darwin', env: {} });
    assert.equal(rows, bannerMod.FORGE_BANNER);
  });
});
