// Wiki scaffolding tests (SPEC-031).
//
// Exercise `forge wiki init` end-to-end through the compiled CLI, assert the
// templated structure is laid down (with distinctive text from the bundled
// templates), that ingest reuses the same templated scaffolder, and that the
// ProjectYaml `integrations.obsidian` field round-trips from a project.yaml.
//
//     node --test test/wiki.test.mjs
//
// The CLI must be built first (npm run build:all).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function runForge(args, opts = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, FORGE_HOME: '' },
  });
  const stdout = stripAnsi(res.stdout ?? '');
  const stderr = stripAnsi(res.stderr ?? '');
  return { status: res.status ?? 1, stdout, stderr, all: stdout + stderr };
}

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-wiki-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const SUBDIR_SEEDS = ['concepts', 'entities', 'sources', 'synthesis'];

describe('forge wiki init — templated scaffold', () => {
  test('creates index.md/log.md from the bundled templates (distinctive text)', (t) => {
    const dir = makeTmpDir(t);
    const { status } = runForge(['wiki', 'init'], { cwd: dir });
    assert.equal(status, 0);

    const index = readFileSync(join(dir, 'wiki', 'index.md'), 'utf-8');
    const log = readFileSync(join(dir, 'wiki', 'log.md'), 'utf-8');
    // These strings only exist in templates/wiki/, never in the inline fallbacks.
    assert.match(index, /Catálogo de páginas/, 'index.md must come from the template');
    assert.match(index, /## Síntesis/, 'index.md must list the Síntesis section');
    assert.match(log, /Append-only/, 'log.md must come from the template');
  });

  test('seeds every subdir _template.md and leaves raw/ empty', (t) => {
    const dir = makeTmpDir(t);
    runForge(['wiki', 'init'], { cwd: dir });

    for (const sub of SUBDIR_SEEDS) {
      const seed = join(dir, 'wiki', sub, '_template.md');
      assert.ok(existsSync(seed), `${sub}/_template.md should exist`);
    }
    // raw/ is an immutable store — no seed file.
    assert.ok(existsSync(join(dir, 'wiki', 'raw')), 'raw/ dir should exist');
    assert.ok(!existsSync(join(dir, 'wiki', 'raw', '_template.md')), 'raw/ must stay empty');
    // The synthesis template (added by SPEC-031) carries its distinctive title.
    const synth = readFileSync(join(dir, 'wiki', 'synthesis', '_template.md'), 'utf-8');
    assert.match(synth, /Título de la Síntesis/);
  });

  test('status shows the templated structure and lint is clean after init', (t) => {
    const dir = makeTmpDir(t);
    runForge(['wiki', 'init'], { cwd: dir });

    const status = runForge(['wiki', 'status'], { cwd: dir });
    assert.equal(status.status, 0);
    assert.match(status.all, /synthesis/);
    assert.match(status.all, /Wiki saludable/);

    // Template seeds must not trip the linter (no orphan/broken-link warnings).
    const lint = runForge(['wiki', 'lint'], { cwd: dir });
    assert.equal(lint.status, 0);
    assert.match(lint.all, /Wiki íntegro/);
    assert.doesNotMatch(lint.all, /Link roto/);
    assert.doesNotMatch(lint.all, /huérfana/);
  });

  test('init is idempotent — re-running does not error and keeps the structure', (t) => {
    const dir = makeTmpDir(t);
    runForge(['wiki', 'init'], { cwd: dir });
    const second = runForge(['wiki', 'init'], { cwd: dir });
    assert.equal(second.status, 0);
    assert.match(second.all, /Wiki actualizado|Wiki inicializado/);
    assert.ok(existsSync(join(dir, 'wiki', 'index.md')));
  });

  test('init is listed in the wiki help', () => {
    const { all } = runForge(['wiki', '--help']);
    assert.match(all, /init \[--force\]/);
  });
});

describe('forge wiki ingest — reuses the templated scaffolder', () => {
  test('ingest initializes the wiki from templates, not the minimal stub', (t) => {
    const dir = makeTmpDir(t);
    const src = join(dir, 'note.md');
    writeFileSync(src, '# A source note\n', 'utf-8');

    const { status } = runForge(['wiki', 'ingest', src], { cwd: dir });
    assert.equal(status, 0);

    const index = readFileSync(join(dir, 'wiki', 'index.md'), 'utf-8');
    assert.match(index, /Catálogo de páginas/, 'ingest must scaffold from the template');
    for (const sub of SUBDIR_SEEDS) {
      assert.ok(existsSync(join(dir, 'wiki', sub, '_template.md')), `${sub}/_template.md should exist after ingest`);
    }
  });
});

describe('ProjectYaml.integrations — type round-trip', () => {
  test('loadProjectYaml exposes integrations.obsidian (vault_path + map)', async (t) => {
    const dir = makeTmpDir(t);
    const yamlPath = join(dir, 'project.yaml');
    writeFileSync(
      yamlPath,
      `project:
  name: "Obsidian Project"
  mode: "standard"
integrations:
  obsidian:
    vault_path: "docs/my-vault"
    map:
      api: "03-api/endpoints.md"
      database: "02-db/migrations.md"
`,
      'utf-8',
    );

    const yamlMod = await import(pathToFileURL(join(__dirname, '..', 'dist', 'lib', 'yaml.js')).href);
    const config = yamlMod.loadProjectYaml(yamlPath);

    assert.equal(config.integrations?.obsidian?.vault_path, 'docs/my-vault');
    assert.equal(config.integrations?.obsidian?.map?.api, '03-api/endpoints.md');
    assert.equal(config.integrations?.obsidian?.map?.database, '02-db/migrations.md');
  });
});
