// SPEC-050 — unified catalog: one model, one engine, installable flag.
// Imports the compiled dist modules — build first (npm run build:all).
//
//     node --test test/catalog-unified.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const SRC = join(__dirname, '..', 'src');

let unified, install, paths;
before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'catalog-unified.js')), 'dist not built — run npm run build:all');
  unified = await import(pathToFileURL(join(DIST, 'lib', 'catalog-unified.js')).href);
  install = await import(pathToFileURL(join(DIST, 'lib', 'catalog-install.js')).href);
  paths = await import(pathToFileURL(join(DIST, 'lib', 'paths.js')).href);
});

function forgeRoot() {
  try { return paths.resolveForgeRoot(); } catch { return null; }
}

describe('SPEC-050 — single source of truth (no second engine)', () => {
  test('aitmpl-search.ts no longer defines its own CATALOG or searchLocal', () => {
    const src = readFileSync(join(SRC, 'commands', 'aitmpl-search.ts'), 'utf-8');
    assert.doesNotMatch(src, /\bconst CATALOG\b/, 'a second catalog array must not live in aitmpl-search.ts');
    assert.doesNotMatch(src, /function searchLocal/, 'a second search engine must not live in aitmpl-search.ts');
    assert.match(src, /getUnifiedCatalog/, 'aitmpl-search must read the unified catalog');
    assert.match(src, /scoreCatalog/, 'aitmpl-search must use the unified search engine');
  });

  test('exactly one catalog data array exists in the lib (catalog-unified)', () => {
    const u = readFileSync(join(SRC, 'lib', 'catalog-unified.ts'), 'utf-8');
    assert.match(u, /RAW_CURATED/, 'the curated data lives in catalog-unified.ts');
  });
});

describe('SPEC-050 — installable flag + model', () => {
  test('curated items are non-installable; MCP servers carry an installSpec', () => {
    const curated = unified.getCuratedItems();
    assert.ok(curated.length > 0);
    assert.ok(curated.every(i => i.installable === false), 'all curated items are installable:false');
    assert.ok(!curated.some(i => i.type === 'profile'), 'forge profiles are not curated entries');
    const mcp = curated.filter(i => i.type === 'mcp-server');
    assert.ok(mcp.length > 0, 'there are MCP servers');
    const postgres = mcp.find(i => i.id === 'postgres');
    assert.ok(postgres, 'the postgres MCP server is present');
    assert.ok(postgres.installSpec && postgres.installSpec.command === 'npx', 'mcp items keep their installSpec');
  });

  test('installable items are skills/profiles/templates, all installable:true', () => {
    const items = install.getInstallableItems(forgeRoot(), process.cwd());
    assert.ok(items.length > 0);
    assert.ok(items.every(i => i.installable === true), 'all installable items are installable:true');
    const types = new Set(items.map(i => i.type));
    for (const t of types) assert.ok(['skill', 'profile', 'template'].includes(t), `unexpected installable type ${t}`);
  });

  test('forge profiles appear once, installable, enriched from curated metadata', () => {
    const items = install.getInstallableItems(forgeRoot(), process.cwd());
    const hono = items.filter(i => i.type === 'profile' && i.id === 'hono-drizzle');
    assert.equal(hono.length, 1, 'hono-drizzle appears exactly once');
    assert.equal(hono[0].installable, true);
    assert.match(hono[0].description, /Hono/, 'enriched with the curated description');
    assert.ok(hono[0].tags.includes('hono'), 'enriched with the curated tags');
  });
});

describe('SPEC-050 — unified catalog + one search engine', () => {
  test('getUnifiedCatalog = installable + curated', () => {
    const all = install.getUnifiedCatalog(forgeRoot(), process.cwd());
    assert.ok(all.some(i => i.type === 'skill' && i.installable), 'includes installable skills');
    assert.ok(all.some(i => i.type === 'mcp-server' && !i.installable), 'includes curated mcp servers');
  });

  test('scoreCatalog: empty query returns all, term filters, category filters', () => {
    const all = install.getUnifiedCatalog(forgeRoot(), process.cwd());
    assert.equal(unified.scoreCatalog(all, '').length, all.length, 'empty query returns everything');
    const pg = unified.scoreCatalog(all, 'postgres');
    assert.ok(pg.length > 0 && pg.some(i => i.id === 'postgres'), 'finds the postgres mcp server');
    const onlyMcp = unified.scoreCatalog(all, '', { category: 'mcp-server' });
    assert.ok(onlyMcp.length > 0 && onlyMcp.every(i => i.category === 'mcp-server'), 'category filter works');
    assert.equal(unified.scoreCatalog(all, 'postgres', { limit: 1 }).length, 1, 'limit caps results');
  });
});
