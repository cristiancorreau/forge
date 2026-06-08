// Source-level guards for the OpenTUI panel (tui/panel.ts), which is Bun-only and
// not render-tested. They lock in the fix for the "[object Object]" bug:
//   1. The OpenTUI `t` template tag and the i18n `t()` function collided (both
//      named `t`), so t('panel.sec.config') returned a StyledText object that
//      rendered as "[object Object]". The OpenTUI tag must be aliased.
//   2. SelectRenderable option names must be plain strings; interpolating fg()
//      styled fragments into the catalog option name rendered "[object Object]".

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANEL = join(__dirname, '..', 'src', 'tui', 'panel.ts');
const src = readFileSync(PANEL, 'utf8');

describe('tui/panel.ts [object Object] guards', () => {
  test('OpenTUI template tag is aliased so the i18n t() is not shadowed', () => {
    assert.match(src, /t as otText/, 'OpenTUI `t` must be imported aliased (e.g. `t as otText`)');
    assert.match(src, /import \{ t \} from '\.\.\/lib\/i18n/, 'i18n `t` must be imported as `t`');
    // The bare `t,` from @opentui/core must be gone (that was the collision).
    assert.doesNotMatch(src, /\n\s*t,\s*\n[\s\S]*?from '@opentui\/core'/,
      'panel.ts must not import a bare `t` from @opentui/core (collides with i18n t)');
  });

  test('catalog Select option names use plain strings (no styled fragments)', () => {
    assert.doesNotMatch(src, /const tag = fg\(/,
      'catalog `tag` must be a plain string, not an fg() styled object');
    assert.doesNotMatch(src, /installedBadge = it\.installed \? fg\(/,
      'catalog `installedBadge` must be a plain string, not an fg() styled object');
  });
});
