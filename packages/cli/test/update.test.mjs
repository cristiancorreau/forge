// Tests for `forge update` (issue #75 — Fase 4: actualizar config gestionada).
//
// End-to-end on a TEMP fixture: init a project, then tweak (a) the catalog
// source and (b) a managed file as if the user edited it. `forge update`:
//   - --dry-run lists changes without writing,
//   - apply updates the unmodified file and preserves the user-edited one,
//   - re-running is idempotent,
//   - --force overwrites the user-edited file too.
//
// The CLI must be built first (npm run build:all). Run directly with:
//     node --test test/update.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, writeFileSync, readFileSync, appendFileSync, rmSync, existsSync, cpSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');
const ASSETS = join(__dirname, '..', 'assets');

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Run the compiled CLI with FORGE_HOME pointed at a (possibly mutated) catalog. */
function runForge(args, { cwd, forgeHome }) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, FORGE_HOME: forgeHome, FORGE_NO_DASHBOARD: '1' },
  });
  const stdout = stripAnsi(res.stdout ?? '');
  const stderr = stripAnsi(res.stderr ?? '');
  return { status: res.status ?? 1, all: stdout + stderr };
}

const BASE_YAML = `project:
  name: "Update Fixture"
  slug: "update-fixture"
  language: typescript
  mode: standard
  status: active
stack:
  backend: hono
agents:
  active:
    - orchestrator
    - backend-engineer
  compliance: []
  profiles: []
runtimes:
  active:
    - claude-code
`;

/**
 * Builds a fresh fixture: a mutable copy of the catalog (so we can simulate a
 * catalog bump without touching assets/) plus an inited project against it.
 */
function makeFixture(t) {
  const catalog = mkdtempSync(join(tmpdir(), 'forge-update-cat-'));
  cpSync(ASSETS, catalog, { recursive: true });
  const proj = mkdtempSync(join(tmpdir(), 'forge-update-proj-'));
  writeFileSync(join(proj, 'project.yaml'), BASE_YAML, 'utf-8');
  t.after(() => {
    rmSync(catalog, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  });

  const init = runForge(['init', '--force'], { cwd: proj, forgeHome: catalog });
  assert.equal(init.status, 0, `init must succeed; output:\n${init.all}`);
  assert.ok(existsSync(join(proj, '.forge', 'manifest.json')), 'manifest must exist after init');
  return { catalog, proj };
}

before(() => {
  assert.ok(existsSync(CLI), `Compiled CLI not found at ${CLI}. Run "npm run build:all" first.`);
});

describe('forge update (issue #75)', () => {
  test('--dry-run lists catalog changes and skips user edits without writing', (t) => {
    const { catalog, proj } = makeFixture(t);

    // (a) catalog bump on an unmodified managed file
    appendFileSync(join(catalog, 'core', 'agents', 'orchestrator.md'), '\n<!-- catalog bump -->\n');
    // (b) user edit on another managed file
    appendFileSync(join(proj, '.claude', 'agents', 'backend-engineer.md'), '\n<!-- USER EDIT -->\n');

    const before = readFileSync(join(proj, '.claude', 'agents', 'orchestrator.md'), 'utf-8');
    const { status, all } = runForge(['update', '--dry-run'], { cwd: proj, forgeHome: catalog });

    assert.equal(status, 0, `dry-run must exit 0; output:\n${all}`);
    assert.match(all, /orchestrator\.md/, 'dry-run should list the changed agent');
    assert.match(all, /\[SKIP\].*backend-engineer\.md/, 'dry-run should skip the user-edited agent');
    // Nothing written.
    const after = readFileSync(join(proj, '.claude', 'agents', 'orchestrator.md'), 'utf-8');
    assert.equal(before, after, 'dry-run must not modify any file');
  });

  test('apply updates the unmodified file, preserves the user edit, idempotent on re-run', (t) => {
    const { catalog, proj } = makeFixture(t);

    appendFileSync(join(catalog, 'core', 'agents', 'orchestrator.md'), '\n<!-- catalog bump -->\n');
    appendFileSync(join(proj, '.claude', 'agents', 'backend-engineer.md'), '\n<!-- USER EDIT -->\n');

    const apply = runForge(['update'], { cwd: proj, forgeHome: catalog });
    assert.equal(apply.status, 0, `update must exit 0; output:\n${apply.all}`);

    const orch = readFileSync(join(proj, '.claude', 'agents', 'orchestrator.md'), 'utf-8');
    assert.match(orch, /catalog bump/, 'unmodified file must be updated to the catalog version');

    const backend = readFileSync(join(proj, '.claude', 'agents', 'backend-engineer.md'), 'utf-8');
    assert.match(backend, /USER EDIT/, 'user-edited file must be preserved');

    // Manifest updated for the written file (its hash now matches the new disk content).
    const manifest = JSON.parse(readFileSync(join(proj, '.forge', 'manifest.json'), 'utf-8'));
    assert.ok(manifest.files['.claude/agents/orchestrator.md'], 'manifest must still track orchestrator');

    // Re-run is idempotent: orchestrator is in sync, only the user-edit remains skipped.
    const rerun = runForge(['update'], { cwd: proj, forgeHome: catalog });
    assert.equal(rerun.status, 0);
    assert.doesNotMatch(rerun.all, /\[UPD\].*orchestrator\.md/, 're-run must not re-update an in-sync file');
  });

  test('--force overwrites the user-edited file too', (t) => {
    const { catalog, proj } = makeFixture(t);

    appendFileSync(join(catalog, 'core', 'agents', 'backend-engineer.md'), '\n<!-- catalog bump -->\n');
    appendFileSync(join(proj, '.claude', 'agents', 'backend-engineer.md'), '\n<!-- USER EDIT -->\n');

    const skip = runForge(['update'], { cwd: proj, forgeHome: catalog });
    assert.match(skip.all, /\[SKIP\].*backend-engineer\.md/, 'without --force the edit is skipped');
    let backend = readFileSync(join(proj, '.claude', 'agents', 'backend-engineer.md'), 'utf-8');
    assert.match(backend, /USER EDIT/, 'user edit still present without --force');

    const force = runForge(['update', '--force'], { cwd: proj, forgeHome: catalog });
    assert.equal(force.status, 0, `--force must exit 0; output:\n${force.all}`);
    backend = readFileSync(join(proj, '.claude', 'agents', 'backend-engineer.md'), 'utf-8');
    assert.match(backend, /catalog bump/, '--force must apply the catalog version');
    assert.doesNotMatch(backend, /USER EDIT/, '--force overwrites the user edit');
  });

  test('does not touch generated files (CLAUDE.md, settings.json, architecture.rules)', (t) => {
    const { catalog, proj } = makeFixture(t);

    // Edit a generated file as the user; update must never overwrite it.
    const claudeMd = join(proj, 'CLAUDE.md');
    appendFileSync(claudeMd, '\n<!-- USER NOTES -->\n');
    const before = readFileSync(claudeMd, 'utf-8');

    const { status, all } = runForge(['update'], { cwd: proj, forgeHome: catalog });
    assert.equal(status, 0);
    assert.doesNotMatch(all, /CLAUDE\.md/, 'generated files must not appear in the update plan');
    assert.equal(readFileSync(claudeMd, 'utf-8'), before, 'CLAUDE.md must be left untouched');
  });
});
