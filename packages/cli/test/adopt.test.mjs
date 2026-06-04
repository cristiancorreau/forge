// adopt command tests (SPEC-038).
//
// Exercises:
//  - analyzeProject (pure): stack / type / structure / entrypoints / git for a
//    TS fullstack fixture and a Python backend fixture; robustness to a bare dir.
//  - generateWiki / buildWikiPages (pure): the populated wiki passes `forge wiki
//    lint` (no broken links, no orphans) and seeds raw/.
//  - `forge adopt --yes` end-to-end through the compiled CLI: writes a
//    project.yaml that passes `forge validate`, installs .claude/ + CLAUDE.md +
//    manifest + a populated wiki/; --dry-run writes nothing; re-running is
//    idempotent and respects existing files without --force; --no-wiki skips it.
//
//     node --test test/adopt.test.mjs
//
// The CLI must be built first (npm run build:all).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');
const DIST = join(__dirname, '..', 'dist');

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

function makeTmpDir(t, prefix = 'forge-adopt-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Build a TS fullstack fixture (Hono + Next.js + Drizzle + Stripe). */
function makeTsFullstack(dir) {
  mkdirSync(join(dir, 'src', 'api'), { recursive: true });
  mkdirSync(join(dir, 'src', 'web'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'acme-shop',
    description: 'An e-commerce platform demo',
    version: '1.0.0',
    main: 'src/index.ts',
    scripts: { dev: 'tsx src/index.ts', build: 'tsc', test: 'vitest' },
    dependencies: { hono: '^4.0.0', next: '^14.0.0', 'drizzle-orm': '^0.30.0', stripe: '^14.0.0' },
    devDependencies: { vitest: '^1.0.0', '@playwright/test': '^1.40.0', typescript: '^5.4.0' },
  }, null, 2), 'utf-8');
  writeFileSync(join(dir, 'README.md'),
    '# Acme Shop\n\nAcme Shop is a demo e-commerce platform built with Hono and Next.js.\n\n## Features\n\n- Catalog\n', 'utf-8');
  writeFileSync(join(dir, 'src', 'index.ts'), 'export const x = 1;\n', 'utf-8');
  writeFileSync(join(dir, 'src', 'api', 'routes.ts'), 'export const api = 1;\n', 'utf-8');
  writeFileSync(join(dir, 'src', 'web', 'page.tsx'), 'export const web = 1;\n', 'utf-8');
  writeFileSync(join(dir, 'tests', 'a.test.ts'), 'test\n', 'utf-8');
  writeFileSync(join(dir, '.env.example'), 'DATABASE_URL=\n', 'utf-8');
  writeFileSync(join(dir, 'Dockerfile'), 'FROM node:20\n', 'utf-8');
}

/** Build a Python backend fixture. */
function makePythonBackend(dir) {
  mkdirSync(join(dir, 'app', 'routers'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'pyproject.toml'),
    '[project]\nname = "invoice-api"\ndescription = "FastAPI service for invoicing"\nversion = "0.2.0"\n', 'utf-8');
  writeFileSync(join(dir, 'README.md'),
    '# Invoice API\n\nA FastAPI backend service that manages invoices.\n', 'utf-8');
  writeFileSync(join(dir, 'app', 'main.py'), 'from fastapi import FastAPI\n', 'utf-8');
  writeFileSync(join(dir, 'app', 'routers', 'invoices.py'), 'router = 1\n', 'utf-8');
  writeFileSync(join(dir, 'tests', 'test_app.py'), 'test\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// analyzeProject (pure)
// ---------------------------------------------------------------------------

describe('analyzeProject — static analysis', () => {
  test('TS fullstack: stack, type, structure, entrypoints, deps', async (t) => {
    const dir = makeTmpDir(t);
    makeTsFullstack(dir);
    // give it a git remote without spawning git in the test
    mkdirSync(join(dir, '.git'), { recursive: true });
    writeFileSync(join(dir, '.git', 'config'),
      '[remote "origin"]\n\turl = https://github.com/acme/shop.git\n', 'utf-8');
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf-8');

    const mod = await import(pathToFileURL(join(DIST, 'lib', 'project-analysis.js')).href);
    const a = mod.analyzeProject(dir);

    assert.equal(a.name, 'acme-shop');
    assert.equal(a.description, 'An e-commerce platform demo');
    assert.equal(a.ecosystem, 'npm');
    assert.equal(a.manifest, 'package.json');
    assert.equal(a.type, 'fullstack');
    assert.equal(a.stack.backend, 'hono');
    assert.equal(a.stack.frontend, 'nextjs');
    assert.equal(a.stack.orm, 'drizzle');
    assert.ok(a.stack.testing.includes('vitest'));
    assert.ok(a.stack.testing.includes('playwright'));

    // directory map + entrypoints
    const dirNames = a.directories.map(d => d.name);
    assert.ok(dirNames.includes('src'));
    assert.ok(dirNames.includes('tests'));
    const srcEntry = a.directories.find(d => d.name === 'src');
    assert.ok(srcEntry.dominantExtensions.includes('ts') || srcEntry.dominantExtensions.includes('tsx'));
    assert.ok(a.entrypoints.includes('src/index.ts'));

    // deps + scripts
    assert.ok(a.dependencies.some(d => d.name === 'hono' && !d.dev));
    assert.ok(a.dependencies.some(d => d.name === 'vitest' && d.dev));
    assert.ok('dev' in a.scripts && 'test' in a.scripts);

    // key files
    const kinds = a.keyFiles.map(f => f.kind);
    assert.ok(kinds.includes('readme'));
    assert.ok(kinds.includes('manifest'));
    assert.ok(kinds.includes('dockerfile'));
    assert.ok(kinds.includes('env-example'));

    // git
    assert.equal(a.git.remote, 'https://github.com/acme/shop.git');
    assert.equal(a.git.branch, 'main');
  });

  test('Python backend: type=backend, ecosystem=python, structure', async (t) => {
    const dir = makeTmpDir(t);
    makePythonBackend(dir);
    const mod = await import(pathToFileURL(join(DIST, 'lib', 'project-analysis.js')).href);
    const a = mod.analyzeProject(dir);

    assert.equal(a.name, 'invoice-api');
    assert.equal(a.description, 'FastAPI service for invoicing');
    assert.equal(a.ecosystem, 'python');
    assert.equal(a.stack.language, 'python');
    assert.equal(a.type, 'backend');
    assert.ok(a.directories.map(d => d.name).includes('app'));
    assert.ok(a.entrypoints.includes('app/main.py'));
  });

  test('robust to a bare/empty directory — never throws, degrades', async (t) => {
    const dir = makeTmpDir(t);
    const mod = await import(pathToFileURL(join(DIST, 'lib', 'project-analysis.js')).href);
    const a = mod.analyzeProject(dir);
    // name falls back to the directory basename; nothing detected.
    assert.equal(typeof a.name, 'string');
    assert.equal(a.ecosystem, 'unknown');
    assert.equal(a.manifest, null);
    assert.deepEqual(a.dependencies, []);
    assert.deepEqual(a.directories, []);
    assert.equal(a.git.remote, null);
  });
});

// ---------------------------------------------------------------------------
// wiki-autogen (pure)
// ---------------------------------------------------------------------------

describe('wiki-autogen — factual pages + clean lint', () => {
  test('buildWikiPages: project entity + framework entities + concepts + sources + overview', async (t) => {
    const dir = makeTmpDir(t);
    makeTsFullstack(dir);
    const analysisMod = await import(pathToFileURL(join(DIST, 'lib', 'project-analysis.js')).href);
    const wikiMod = await import(pathToFileURL(join(DIST, 'lib', 'wiki-autogen.js')).href);
    const a = analysisMod.analyzeProject(dir);
    const pages = wikiMod.buildWikiPages(a);

    const slugs = pages.map(p => `${p.section}/${p.slug}`);
    assert.ok(slugs.includes('concepts/arquitectura'));
    assert.ok(slugs.includes('concepts/stack'));
    assert.ok(slugs.includes('entities/acme-shop'));
    assert.ok(slugs.includes('entities/hono'));
    assert.ok(slugs.includes('entities/nextjs'));
    assert.ok(slugs.includes('synthesis/overview'));
    assert.ok(slugs.some(s => s.startsWith('sources/')));

    // overview carries the explicit semantic-pendiente note
    const overview = pages.find(p => p.slug === 'overview');
    assert.match(overview.content, /Pendiente: compilación semántica con \/wiki-ingest/);
    // every page has frontmatter
    for (const p of pages) assert.match(p.content, /^---\n/);
  });

  test('generateWiki: writes pages, seeds raw/, and the wiki passes forge wiki lint', (t) => {
    const dir = makeTmpDir(t);
    makeTsFullstack(dir);
    // scaffold + autogen via the CLI (adopt) so the templated structure exists.
    const res = runForge(['adopt', '--yes', dir]);
    assert.equal(res.status, 0, res.all);

    assert.ok(existsSync(join(dir, 'wiki', 'index.md')));
    assert.ok(existsSync(join(dir, 'wiki', 'concepts', 'stack.md')));
    assert.ok(existsSync(join(dir, 'wiki', 'entities', 'acme-shop.md')));
    assert.ok(existsSync(join(dir, 'wiki', 'synthesis', 'overview.md')));
    // raw/ seeded with README + manifest copies
    const raw = readFileSync(join(dir, 'wiki', 'log.md'), 'utf-8');
    assert.match(raw, /adopt \| Wiki sembrado/);

    const lint = runForge(['wiki', 'lint'], { cwd: dir });
    assert.equal(lint.status, 0, lint.all);
    assert.match(lint.all, /Wiki íntegro/);
    assert.doesNotMatch(lint.all, /Link roto/);
    assert.doesNotMatch(lint.all, /huérfana/);
  });
});

// ---------------------------------------------------------------------------
// forge adopt — end-to-end
// ---------------------------------------------------------------------------

describe('forge adopt — end-to-end', () => {
  test('--yes writes a valid project.yaml + .claude/ + CLAUDE.md + manifest + wiki/', (t) => {
    const dir = makeTmpDir(t);
    makeTsFullstack(dir);
    const res = runForge(['adopt', '--yes', dir]);
    assert.equal(res.status, 0, res.all);
    assert.match(res.all, /forge adoptado/);
    assert.match(res.all, /Proyecto detectado/);
    // next-steps point to /wiki-ingest
    assert.match(res.all, /\/wiki-ingest/);

    // project.yaml validates
    assert.ok(existsSync(join(dir, 'project.yaml')));
    const validate = runForge(['validate'], { cwd: dir });
    assert.equal(validate.status, 0, validate.all);
    assert.match(validate.all, /project\.yaml es válido/);

    // forge config installed
    assert.ok(existsSync(join(dir, 'CLAUDE.md')));
    assert.ok(existsSync(join(dir, '.claude', 'settings.json')));
    assert.ok(existsSync(join(dir, '.claude', 'architecture.rules')));
    assert.ok(existsSync(join(dir, '.claude', 'agents', 'orchestrator.md')));
    assert.ok(existsSync(join(dir, '.forge', 'manifest.json')));
    assert.ok(existsSync(join(dir, 'docs', 'specs', '_template.md')));

    // populated wiki
    assert.ok(existsSync(join(dir, 'wiki', 'index.md')));
    const index = readFileSync(join(dir, 'wiki', 'index.md'), 'utf-8');
    assert.match(index, /acme-shop/);
  });

  test('--dry-run writes nothing', (t) => {
    const dir = makeTmpDir(t);
    makeTsFullstack(dir);
    const res = runForge(['adopt', '--yes', '--dry-run', dir]);
    assert.equal(res.status, 0, res.all);
    assert.match(res.all, /Plan/);
    // nothing written
    assert.ok(!existsSync(join(dir, 'project.yaml')));
    assert.ok(!existsSync(join(dir, '.claude')));
    assert.ok(!existsSync(join(dir, 'wiki')));
    assert.ok(!existsSync(join(dir, 'CLAUDE.md')));
  });

  test('idempotent — re-running preserves existing files without --force', (t) => {
    const dir = makeTmpDir(t);
    makeTsFullstack(dir);
    runForge(['adopt', '--yes', dir]);
    // mark CLAUDE.md and project.yaml with a manual edit
    const claudePath = join(dir, 'CLAUDE.md');
    const yamlPath = join(dir, 'project.yaml');
    writeFileSync(claudePath, readFileSync(claudePath, 'utf-8') + '\n<!-- MANUAL -->\n', 'utf-8');
    writeFileSync(yamlPath, readFileSync(yamlPath, 'utf-8') + '\n# MANUAL\n', 'utf-8');

    const second = runForge(['adopt', '--yes', dir]);
    assert.equal(second.status, 0, second.all);
    assert.match(second.all, /project\.yaml ya existe/);
    // manual edits survive (files not clobbered)
    assert.match(readFileSync(claudePath, 'utf-8'), /<!-- MANUAL -->/);
    assert.match(readFileSync(yamlPath, 'utf-8'), /# MANUAL/);
  });

  test('--force overwrites the generated project.yaml', (t) => {
    const dir = makeTmpDir(t);
    makeTsFullstack(dir);
    runForge(['adopt', '--yes', dir]);
    const yamlPath = join(dir, 'project.yaml');
    writeFileSync(yamlPath, 'project:\n  name: "stale"\n  mode: standard\n', 'utf-8');
    const res = runForge(['adopt', '--yes', '--force', dir]);
    assert.equal(res.status, 0, res.all);
    assert.match(readFileSync(yamlPath, 'utf-8'), /acme-shop/);
  });

  test('--no-wiki skips the wiki but still installs the config', (t) => {
    const dir = makeTmpDir(t);
    makeTsFullstack(dir);
    const res = runForge(['adopt', '--yes', '--no-wiki', dir]);
    assert.equal(res.status, 0, res.all);
    assert.ok(!existsSync(join(dir, 'wiki')));
    assert.ok(existsSync(join(dir, 'project.yaml')));
    assert.ok(existsSync(join(dir, 'CLAUDE.md')));
  });

  test('Python backend: adopt produces a valid project.yaml and clean wiki', (t) => {
    const dir = makeTmpDir(t);
    makePythonBackend(dir);
    const res = runForge(['adopt', '--yes', dir]);
    assert.equal(res.status, 0, res.all);
    const validate = runForge(['validate'], { cwd: dir });
    assert.equal(validate.status, 0, validate.all);
    const yaml = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(yaml, /language: python/);
    assert.match(yaml, /type: backend/);
    const lint = runForge(['wiki', 'lint'], { cwd: dir });
    assert.equal(lint.status, 0, lint.all);
    assert.match(lint.all, /Wiki íntegro/);
  });

  test('adopt is listed in the top-level help with an example', () => {
    const help = runForge(['--help']);
    assert.match(help.all, /adopt/);
    assert.match(help.all, /forge adopt/);
  });

  test('adopt --help shows usage and flags', () => {
    const help = runForge(['adopt', '--help']);
    assert.match(help.all, /Usage: forge adopt/);
    assert.match(help.all, /--no-wiki/);
    assert.match(help.all, /--dry-run/);
  });

  test('errors cleanly on a non-existent target', () => {
    const res = runForge(['adopt', '--yes', '/nonexistent/path/xyz123']);
    assert.equal(res.status, 1);
    assert.match(res.all, /no existe|no es un directorio/);
  });
});
