// i18n (ES/EN) for the CLI. Imports the compiled dist module — build first.
//
//     node --test test/i18n.test.mjs

import { test, describe, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
let i18n;
before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'i18n.js')), 'dist not built — run npm run build:all');
  i18n = await import(pathToFileURL(join(DIST, 'lib', 'i18n.js')).href);
});
afterEach(() => { delete process.env.FORGE_LANG; });

describe('resolveLang — precedence', () => {
  test('--lang flag wins', () => {
    assert.equal(i18n.resolveLang(['node', 'cli', '--lang', 'es']), 'es');
    assert.equal(i18n.resolveLang(['node', 'cli', '--lang', 'en']), 'en');
    assert.equal(i18n.resolveLang(['node', 'cli', '--lang=es']), 'es');
  });
  test('FORGE_LANG env when no flag', () => {
    process.env.FORGE_LANG = 'es';
    assert.equal(i18n.resolveLang(['node', 'cli']), 'es');
    process.env.FORGE_LANG = 'en_US';
    assert.equal(i18n.resolveLang(['node', 'cli']), 'en');
  });
  test('falls back to en for a non-Spanish, no-signal environment', () => {
    // No flag, no FORGE_LANG; an explicit en locale resolves to en.
    const saved = { LC_ALL: process.env.LC_ALL, LANG: process.env.LANG, LC_MESSAGES: process.env.LC_MESSAGES };
    process.env.LC_ALL = 'en_US.UTF-8'; delete process.env.LANG; delete process.env.LC_MESSAGES;
    try { assert.equal(i18n.resolveLang(['node', 'cli']), 'en'); }
    finally { Object.assign(process.env, saved); }
  });
  test('detects a Spanish locale', () => {
    const saved = { LC_ALL: process.env.LC_ALL, LANG: process.env.LANG };
    delete process.env.LC_ALL; process.env.LANG = 'es_AR.UTF-8'; delete process.env.LC_MESSAGES;
    try { assert.equal(i18n.resolveLang(['node', 'cli']), 'es'); }
    finally { Object.assign(process.env, saved); }
  });
});

describe('t — translation + interpolation', () => {
  test('returns the active-language string', () => {
    i18n.setLang('es');
    assert.equal(i18n.getLang(), 'es');
    assert.match(i18n.t('header.tagline'), /agentes de IA/);
    i18n.setLang('en');
    assert.match(i18n.t('header.tagline'), /AI agents/);
  });
  test('interpolates {version} in help.full', () => {
    i18n.setLang('en');
    assert.match(i18n.t('help.full', { version: '9.9.9' }), /Forge AI v9\.9\.9/);
  });
  test('unknown key falls back to the key itself', () => {
    assert.equal(i18n.t('does.not.exist'), 'does.not.exist');
  });
});

describe('help.full differs by language', () => {
  test('English vs Spanish tagline in the help block', () => {
    i18n.setLang('en');
    const en = i18n.t('help.full', { version: '1.0.0' });
    i18n.setLang('es');
    const es = i18n.t('help.full', { version: '1.0.0' });
    assert.match(en, /Agentic development framework/);
    assert.match(es, /Framework de desarrollo agéntico/);
    assert.match(es, /Uso: forge/);
    assert.notEqual(en, es);
  });
});

describe('key parity — every key exists in both languages', () => {
  test('en and es have identical key sets', async () => {
    // MESSAGE_KEYS is the en key list; assert es resolves each to a non-key value.
    i18n.setLang('es');
    for (const k of i18n.MESSAGE_KEYS) {
      assert.notEqual(i18n.t(k, { version: 'x' }), k, `missing es translation for "${k}"`);
    }
    i18n.setLang('en');
    for (const k of i18n.MESSAGE_KEYS) {
      assert.notEqual(i18n.t(k, { version: 'x' }), k, `missing en translation for "${k}"`);
    }
  });
});
