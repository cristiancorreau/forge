import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// args.js es CommonJS (module.exports) para poder testearlo en Node sin Electron.
const require = createRequire(import.meta.url);
const { toArgs } = require('../src/args.js');

test('init -> [init, --from, <file>]', () => {
  assert.deepEqual(toArgs('init', { from: 'answers.yaml' }), [
    'init',
    '--from',
    'answers.yaml',
  ]);
});

test('init con dryRun agrega --dry-run', () => {
  assert.deepEqual(toArgs('init', { from: 'answers.yaml', dryRun: true }), [
    'init',
    '--from',
    'answers.yaml',
    '--dry-run',
  ]);
});

test('init sin from lanza error', () => {
  assert.throws(() => toArgs('init', {}), /requiere payload\.from/);
  assert.throws(() => toArgs('init', { from: '   ' }), /requiere payload\.from/);
});

test('adopt -> [adopt, --yes]', () => {
  assert.deepEqual(toArgs('adopt', {}), ['adopt', '--yes']);
});

test('adopt con dryRun agrega --dry-run', () => {
  assert.deepEqual(toArgs('adopt', { dryRun: true }), [
    'adopt',
    '--yes',
    '--dry-run',
  ]);
});

test('audit -> [audit, --json]', () => {
  assert.deepEqual(toArgs('audit'), ['audit', '--json']);
  assert.deepEqual(toArgs('audit', {}), ['audit', '--json']);
});

test('doctor -> [doctor]', () => {
  assert.deepEqual(toArgs('doctor'), ['doctor']);
  assert.deepEqual(toArgs('doctor', {}), ['doctor']);
});

test('generate -> [generate]', () => {
  assert.deepEqual(toArgs('generate', {}), ['generate']);
});

test('generate con runtime -> [generate, --runtime, <runtime>]', () => {
  assert.deepEqual(toArgs('generate', { runtime: 'claude-code' }), [
    'generate',
    '--runtime',
    'claude-code',
  ]);
});

test('accion desconocida lanza error', () => {
  assert.throws(() => toArgs('explode', {}), /Accion desconocida/);
});
