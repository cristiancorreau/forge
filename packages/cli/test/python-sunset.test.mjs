// Python sunset (SPEC-041 / Epic #76) — assert the legacy Python CLI stays
// removed. The CLI is 100% TypeScript since v2.8.0; v3.0.0 removed forge.py,
// scripts/*.py, tests/*.py and requirements.txt. This guard makes the sunset
// permanent: if any of these files reappears, the test fails.
//
//     node --test test/python-sunset.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// test/ -> cli/ -> packages/ -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..');

describe('Python sunset — legacy Python CLI stays removed (SPEC-041)', () => {
  test('forge.py no longer exists at the repo root', () => {
    assert.ok(
      !existsSync(join(REPO_ROOT, 'forge.py')),
      'forge.py must not exist — the legacy Python CLI was removed in v3.0.0',
    );
  });

  test('scripts/ has no Python files (and the legacy dir is gone)', () => {
    const scriptsDir = join(REPO_ROOT, 'scripts');
    if (!existsSync(scriptsDir)) return; // dir removed entirely — best outcome
    const pyFiles = readdirSync(scriptsDir).filter((f) => f.endsWith('.py'));
    assert.deepEqual(
      pyFiles,
      [],
      `scripts/ must not contain Python files: ${pyFiles.join(', ')}`,
    );
  });

  test('the legacy pytest suite (tests/*.py) no longer exists', () => {
    const testsDir = join(REPO_ROOT, 'tests');
    if (!existsSync(testsDir)) return; // dir removed entirely — best outcome
    const pyFiles = readdirSync(testsDir).filter((f) => f.endsWith('.py'));
    assert.deepEqual(
      pyFiles,
      [],
      `tests/ must not contain the legacy pytest suite: ${pyFiles.join(', ')}`,
    );
  });

  test('requirements.txt (forge\'s own Python deps) no longer exists', () => {
    assert.ok(
      !existsSync(join(REPO_ROOT, 'requirements.txt')),
      'requirements.txt must not exist — forge has no Python dependencies',
    );
  });

  test('the legacy tests-legacy.yml CI workflow is removed', () => {
    assert.ok(
      !existsSync(join(REPO_ROOT, '.github', 'workflows', 'tests-legacy.yml')),
      'tests-legacy.yml must not exist — tests.yml is the only test gate',
    );
  });

  test('version coherence: all 4 sources read 3.0.0', () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
    );
    const versionTs = readFileSync(
      join(__dirname, '..', 'src', 'version.ts'),
      'utf-8',
    );
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, 'manifest.json'), 'utf-8'),
    );
    const forgeManifest = JSON.parse(
      readFileSync(join(REPO_ROOT, '.forge', 'manifest.json'), 'utf-8'),
    );

    assert.equal(pkg.version, '3.0.0', 'package.json version must be 3.0.0');
    assert.match(versionTs, /VERSION = '3\.0\.0'/, 'version.ts VERSION must be 3.0.0');
    assert.equal(manifest.version, '3.0.0', 'manifest.json version must be 3.0.0');
    assert.equal(
      forgeManifest.forgeVersion,
      '3.0.0',
      '.forge/manifest.json forgeVersion must be 3.0.0',
    );
  });
});
