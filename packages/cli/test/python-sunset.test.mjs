// Python sunset (SPEC-041 / Epic #76) — assert the legacy Python CLI stays
// removed. The CLI is 100% TypeScript since v2.8.0; v3.0.0 removed forge.py,
// scripts/*.py, tests/*.py and requirements.txt. This guard makes the sunset
// permanent: if any of these files reappears, the test fails.
//
//     node --test test/python-sunset.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

// Residual Python cleanup (SPEC-042 / #78) — the v3.0.0 sunset removed the legacy
// Python *CLI*; this guard makes the residual cleanup permanent: the orphaned
// git pre-commit hook (token-stats.py shell-out) and the two legacy `.py` hook
// copies stay gone, the manifest stops registering the pre-commit hook, and the
// published bundle ships zero Python and no pre-commit hook.
describe('Residual Python cleanup — leftovers stay removed (SPEC-042)', () => {
  test('the orphaned hooks/pre-commit git hook no longer exists', () => {
    assert.ok(
      !existsSync(join(REPO_ROOT, 'hooks', 'pre-commit')),
      'hooks/pre-commit must not exist — the CLI ships its own .githooks/pre-commit (zero Python)',
    );
  });

  test('the legacy Python hook copies (core/hooks/*.py) no longer exist', () => {
    for (const f of ['pre-bash-check.py', 'pre-edit-check.py']) {
      assert.ok(
        !existsSync(join(REPO_ROOT, 'core', 'hooks', f)),
        `core/hooks/${f} must not exist — the registry and CLI use the .js/.sh hooks`,
      );
    }
  });

  test('manifest.json registers no pre-commit hook', () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, 'manifest.json'), 'utf-8'),
    );
    const hooks = Array.isArray(manifest.hooks) ? manifest.hooks : [];
    const preCommit = hooks.filter((h) => h && h.id === 'pre-commit');
    assert.deepEqual(
      preCommit,
      [],
      'manifest.json must not register a pre-commit hook',
    );
  });

  test('the published bundle ships no Python files nor the pre-commit hook', () => {
    const ASSETS = join(__dirname, '..', 'assets');
    if (!existsSync(ASSETS)) return; // bundle not built in this run — assets.test.mjs covers the built bundle

    /** Recursively collect files under `dir` matching `pred`. */
    const walk = (dir, pred, out = []) => {
      if (!existsSync(dir)) return out;
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p, pred, out);
        else if (pred(p)) out.push(p);
      }
      return out;
    };

    const pyFiles = walk(ASSETS, (f) => f.endsWith('.py')).map((f) =>
      f.replace(ASSETS + '/', ''),
    );
    assert.deepEqual(
      pyFiles,
      [],
      `bundle still ships Python files: ${pyFiles.join(', ')}`,
    );

    assert.ok(
      !existsSync(join(ASSETS, 'hooks', 'pre-commit')),
      'bundle must not ship the orphaned hooks/pre-commit',
    );
  });
});
