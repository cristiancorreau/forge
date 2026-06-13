// SPEC-072 (layer 3) — artifact parity: GUI (toArgs) vs CLI-direct.
//
// For each core command (init --from, adopt, generate) we run the forge CLI
// twice in isolated temp dirs:
//   (a) CLI branch  — canonical args written by hand.
//   (b) GUI branch  — args produced by toArgs() from an equivalent payload.
// Then we assert equal exit code and equal SHA-256 of project.yaml and every
// file under .claude/, plus the .forge/manifest.json with its timestamps
// excluded. Byte-for-byte equality proves the GUI just drives the same engine.
//
// Pre-requisite: the CLI must be built (the test does it in `before`):
//     cd packages/cli && npm run build:all
// And the extension compiled (out/ipc.js):
//     cd vscode-extension && npm run compile
//
//   node --test test/parity.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync,
  statSync, existsSync, rmSync,
} from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const CLI_PKG = join(REPO, 'packages', 'cli');
const CLI = join(CLI_PKG, 'dist', 'cli.js');
const IPC = join(__dirname, '..', 'out', 'ipc.js');

let toArgs;

before(async () => {
  // Build the CLI (SPEC-072 pre-requisite). Deterministic dist for both branches.
  const build = spawnSync('npm', ['run', 'build:all'], {
    cwd: CLI_PKG, encoding: 'utf8', env: { ...process.env },
  });
  assert.equal(build.status, 0, `build:all failed:\n${build.stdout}\n${build.stderr}`);
  assert.ok(existsSync(CLI), 'dist/cli.js missing after build');
  assert.ok(existsSync(IPC), 'out/ipc.js missing — run `npm run compile` in vscode-extension');
  ({ toArgs } = await import(pathToFileURL(IPC).href));
});

// --- helpers ------------------------------------------------------------

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function runCli(args, cwd) {
  const r = spawnSync('node', [CLI, ...args], {
    cwd, encoding: 'utf8',
    env: { ...process.env, FORGE_NO_BUN: '1', FORGE_HOME: '' },
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Recursively list relative POSIX paths of files under `root`. */
function listFiles(root, base = root, acc = []) {
  if (!existsSync(root)) return acc;
  for (const entry of readdirSync(root)) {
    const abs = join(root, entry);
    const st = statSync(abs);
    if (st.isDirectory()) listFiles(abs, base, acc);
    else acc.push(relative(base, abs).split(sep).join('/'));
  }
  return acc;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Read a file and return a content buffer suitable for hashing. For the
 * manifest, strip the non-deterministic timestamps (top-level + per-file
 * installedAt) and the forgeVersion (irrelevant to artifact parity).
 */
function normalizedContent(rel, abs) {
  const raw = readFileSync(abs, 'utf8');
  if (rel === '.forge/manifest.json') {
    const m = JSON.parse(raw);
    delete m.installedAt;
    if (m.files && typeof m.files === 'object') {
      for (const k of Object.keys(m.files)) {
        if (m.files[k] && typeof m.files[k] === 'object') {
          delete m.files[k].installedAt;
        }
      }
    }
    return JSON.stringify(m);
  }
  return raw;
}

/**
 * Build a map relpath → sha256 for the artifacts we care about: project.yaml,
 * everything under .claude/, and the normalized .forge/manifest.json.
 */
function fingerprint(root) {
  const rels = new Set();
  if (existsSync(join(root, 'project.yaml'))) rels.add('project.yaml');
  for (const f of listFiles(join(root, '.claude'), root)) rels.add(f);
  if (existsSync(join(root, '.forge', 'manifest.json'))) rels.add('.forge/manifest.json');

  const out = {};
  for (const rel of [...rels].sort()) {
    out[rel] = sha256(normalizedContent(rel, join(root, rel)));
  }
  return out;
}

function assertParity(cliDir, guiDir) {
  const a = fingerprint(cliDir);
  const b = fingerprint(guiDir);
  assert.deepEqual(
    Object.keys(b).sort(),
    Object.keys(a).sort(),
    'GUI and CLI produced a different set of artifact files'
  );
  for (const rel of Object.keys(a)) {
    assert.equal(b[rel], a[rel], `SHA-256 mismatch for ${rel}`);
  }
  assert.ok(Object.keys(a).length > 0, 'no artifacts produced — fixture is wrong');
}

// --- init --from --------------------------------------------------------

describe('parity: init --from', () => {
  test('CLI-direct args == toArgs(runInit) artifacts', () => {
    const answers = {
      name: 'Parity Demo', type: 'fullstack', frontend: 'nextjs',
      frontendLanguage: 'typescript', mode: 'standard', runtime: 'claude-code',
      testing: ['vitest'], skills: ['spec'],
    };

    const cliDir = tmp('parity-init-cli-');
    const guiDir = tmp('parity-init-gui-');
    try {
      writeFileSync(join(cliDir, 'answers.json'), JSON.stringify(answers));
      writeFileSync(join(guiDir, 'answers.json'), JSON.stringify(answers));

      const cliRes = runCli(['init', '--from', 'answers.json'], cliDir);
      const guiArgs = toArgs('runInit', { answersFile: 'answers.json' });
      const guiRes = runCli(guiArgs, guiDir);

      assert.equal(cliRes.status, 0, `CLI init failed: ${cliRes.stderr}`);
      assert.equal(guiRes.status, cliRes.status, 'exit code mismatch');
      assertParity(cliDir, guiDir);
    } finally {
      rmSync(cliDir, { recursive: true, force: true });
      rmSync(guiDir, { recursive: true, force: true });
    }
  });
});

// --- adopt --------------------------------------------------------------

/** Minimal TS fullstack fixture so adopt has something to analyze. */
function makeAdoptFixture(dir) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'parity-adopt', description: 'Parity adopt fixture', version: '1.0.0',
    main: 'src/index.ts', scripts: { test: 'vitest' },
    dependencies: { next: '^14.0.0' }, devDependencies: { vitest: '^1.0.0', typescript: '^5.4.0' },
  }, null, 2));
  writeFileSync(join(dir, 'README.md'), '# Parity Adopt\n\nFixture for parity testing.\n');
  writeFileSync(join(dir, 'src', 'index.ts'), 'export const x = 1;\n');
}

describe('parity: adopt', () => {
  test('CLI-direct args == toArgs(runAdopt) artifacts (no wiki)', () => {
    const cliDir = tmp('parity-adopt-cli-');
    const guiDir = tmp('parity-adopt-gui-');
    try {
      makeAdoptFixture(cliDir);
      makeAdoptFixture(guiDir);

      // --no-wiki keeps the artifact set deterministic (wiki autogen can vary).
      const cliRes = runCli(['adopt', '--yes', '--runtime', 'claude-code', '--mode', 'standard', '--no-wiki'], cliDir);
      const guiArgs = toArgs('runAdopt', { runtime: 'claude-code', mode: 'standard', wiki: false });
      const guiRes = runCli(guiArgs, guiDir);

      assert.equal(cliRes.status, 0, `CLI adopt failed: ${cliRes.stderr}`);
      assert.equal(guiRes.status, cliRes.status, 'exit code mismatch');
      assertParity(cliDir, guiDir);
    } finally {
      rmSync(cliDir, { recursive: true, force: true });
      rmSync(guiDir, { recursive: true, force: true });
    }
  });
});

// --- generate -----------------------------------------------------------

describe('parity: generate', () => {
  test('CLI-direct args == toArgs(runGenerate) artifacts', () => {
    // generate needs an initialized project; seed both dirs identically via init.
    const answers = { name: 'Gen Demo', type: 'backend', mode: 'standard', runtime: 'claude-code' };

    const cliDir = tmp('parity-gen-cli-');
    const guiDir = tmp('parity-gen-gui-');
    try {
      for (const d of [cliDir, guiDir]) {
        writeFileSync(join(d, 'answers.json'), JSON.stringify(answers));
        const seed = runCli(['init', '--from', 'answers.json'], d);
        assert.equal(seed.status, 0, `seed init failed: ${seed.stderr}`);
      }

      const cliRes = runCli(['generate', '--runtime', 'claude-code'], cliDir);
      const guiArgs = toArgs('runGenerate', { runtime: 'claude-code' });
      const guiRes = runCli(guiArgs, guiDir);

      assert.equal(guiRes.status, cliRes.status, 'exit code mismatch');
      assertParity(cliDir, guiDir);
    } finally {
      rmSync(cliDir, { recursive: true, force: true });
      rmSync(guiDir, { recursive: true, force: true });
    }
  });
});
