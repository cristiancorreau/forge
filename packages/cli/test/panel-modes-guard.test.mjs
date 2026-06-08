// Source-level guards for SPEC-059 PR1: mode state machine + single KEYMAP.
//
// These checks verify at the source level that:
//   1. The ad-hoc flag dispatcher (typingSkills / typingCatalog / inCatalogList)
//      has been replaced — those flags must NOT drive the main dispatch anymore.
//   2. PanelMode type and KEYMAP are declared and used as the new dispatch mechanism.
//   3. The private API _internalKeyInput is accessed only through the adaptor
//      functions (onKey / offKey), not inline everywhere.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANEL = join(__dirname, '..', 'src', 'tui', 'panel.ts');
const src = readFileSync(PANEL, 'utf8');

describe('tui/panel.ts — SPEC-059 PR1 mode machine guards', () => {

  test('PanelMode type is declared', () => {
    assert.match(src, /type PanelMode\s*=/, 'PanelMode type must be declared');
    assert.match(src, /'NAV'/, 'NAV mode must be declared');
    assert.match(src, /'FILTER'/, 'FILTER mode must be declared');
    assert.match(src, /'PALETTE'/, 'PALETTE mode must be declared');
    assert.match(src, /'CONFIRM'/, 'CONFIRM mode must be declared');
    assert.match(src, /'LOG'/, 'LOG mode must be declared');
  });

  test('KEYMAP object is declared as the single source of truth', () => {
    assert.match(src, /const KEYMAP\s*[=:]/, 'KEYMAP must be declared as a const');
    assert.match(src, /global\s*:\s*\[/, 'KEYMAP must have a global bindings array');
    assert.match(src, /bySection\s*:/, 'KEYMAP must have a bySection map');
    assert.match(src, /action\s*:\s*['"]/, 'KEYMAP entries must have an action field');
  });

  test('mode variable is used as the dispatcher pivot', () => {
    assert.match(src, /let mode\s*:\s*PanelMode/, 'mode variable must be typed as PanelMode');
    assert.match(src, /mode\s*===\s*['"]FILTER['"]/, 'dispatcher must branch on FILTER mode');
    assert.match(src, /mode\s*===\s*['"]NAV['"]/, 'dispatcher must branch on NAV mode');
  });

  test('ad-hoc flag dispatcher is gone — typingSkills flag must not be used as dispatch condition', () => {
    // typingSkills was: const typingSkills = !!searchInput && searchInput.focused
    // then used as a condition in the main dispatch block.
    // The variable name itself may still exist elsewhere but must NOT be used as
    // the main dispatch trigger. We check the specific pattern that defined it.
    assert.doesNotMatch(
      src,
      /const typingSkills\s*=/,
      'typingSkills ad-hoc dispatch flag must be removed',
    );
  });

  test('ad-hoc flag dispatcher is gone — typingCatalog flag must not be used as dispatch condition', () => {
    assert.doesNotMatch(
      src,
      /const typingCatalog\s*=/,
      'typingCatalog ad-hoc dispatch flag must be removed',
    );
  });

  test('ad-hoc flag dispatcher is gone — inCatalogList flag must not be used as dispatch condition', () => {
    assert.doesNotMatch(
      src,
      /const inCatalogList\s*=/,
      'inCatalogList ad-hoc dispatch flag must be removed',
    );
  });

  test('_internalKeyInput is accessed only via onKey/offKey adaptors', () => {
    // The adaptor functions must exist
    assert.match(src, /function onKey\s*\(/, 'onKey adaptor function must be declared');
    assert.match(src, /function offKey\s*\(/, 'offKey adaptor function must be declared');

    // _internalKeyInput must only appear inside those two functions, not scattered inline.
    // Count occurrences: each occurrence outside the adaptor bodies is a violation.
    // We verify there are no inline calls like renderer._internalKeyInput.on directly.
    const inlinePattern = /renderer\._internalKeyInput\s*[\.\?]/g;
    const matches = [...src.matchAll(inlinePattern)];
    // The adaptor bodies themselves contain the reference — that's fine (exactly 2 uses).
    assert.ok(
      matches.length <= 2,
      `_internalKeyInput must only appear in onKey/offKey adaptors (found ${matches.length} raw usages)`,
    );
  });

  test('footer is derived from mode + section (buildFooterText function exists)', () => {
    assert.match(src, /function buildFooterText\s*\(/, 'buildFooterText must be a function');
    assert.match(src, /updateFooter\s*\(\s*\)/, 'updateFooter helper must be called');
  });

  test('help overlay toggle exists and uses KEYMAP data via buildHelpLines', () => {
    assert.match(src, /function buildHelpLines\s*\(/, 'buildHelpLines must be declared');
    assert.match(src, /function toggleHelp\s*\(\s*\)/, 'toggleHelp function must be declared');
    assert.match(src, /helpOverlay/, 'helpOverlay variable must be present');
    assert.match(src, /'?'/, 'help key binding ? must appear in the source');
  });

  test('original [object Object] guards still hold — OpenTUI tag is aliased', () => {
    assert.match(src, /t as otText/, 'OpenTUI `t` must remain aliased as otText');
    assert.match(src, /import \{ t \} from '\.\.\/lib\/i18n/, 'i18n t must be imported as t');
  });

  test('original [object Object] guards still hold — catalog Select names are plain strings', () => {
    assert.doesNotMatch(src, /const tag = fg\(/, 'catalog tag must be a plain string');
    assert.doesNotMatch(
      src,
      /installedBadge = it\.installed \? fg\(/,
      'catalog installedBadge must be a plain string',
    );
  });
});
