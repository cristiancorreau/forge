// SPEC-072 (layer 2) — unit tests for the pure form validation helpers.
//
//   cd vscode-extension && npm run compile && node --test test/validation.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'out', 'validation.js');

let V;
before(async () => {
  assert.ok(existsSync(OUT), 'out/validation.js missing — run `npm run compile` first');
  V = await import(pathToFileURL(OUT).href);
});

describe('validateName', () => {
  test('accepts a normal name', () => {
    assert.equal(V.validateName('Mi App Genial').valid, true);
  });
  test('rejects empty / whitespace', () => {
    assert.equal(V.validateName('').valid, false);
    assert.equal(V.validateName('   ').valid, false);
  });
  test('rejects > 64 chars', () => {
    assert.equal(V.validateName('a'.repeat(65)).valid, false);
  });
  test('rejects non-string', () => {
    assert.equal(V.validateName(undefined).valid, false);
  });
});

describe('validateSlug', () => {
  test('accepts kebab-case', () => {
    assert.equal(V.validateSlug('mi-app-genial').valid, true);
    assert.equal(V.validateSlug('app2').valid, true);
  });
  test('rejects uppercase / spaces / underscores', () => {
    assert.equal(V.validateSlug('Mi-App').valid, false);
    assert.equal(V.validateSlug('mi app').valid, false);
    assert.equal(V.validateSlug('mi_app').valid, false);
  });
  test('rejects leading / trailing / doubled hyphens', () => {
    assert.equal(V.validateSlug('-app').valid, false);
    assert.equal(V.validateSlug('app-').valid, false);
    assert.equal(V.validateSlug('mi--app').valid, false);
  });
  test('rejects too short / too long', () => {
    assert.equal(V.validateSlug('a').valid, false);
    assert.equal(V.validateSlug('a'.repeat(49)).valid, false);
  });
});

describe('slugify', () => {
  test('derives the same slug the CLI uses', () => {
    assert.equal(V.slugify('My Cool App'), 'my-cool-app');
    assert.equal(V.slugify('  Acme   Shop!! '), 'acme-shop');
    assert.equal(V.slugify('Already-good'), 'already-good');
  });
});
