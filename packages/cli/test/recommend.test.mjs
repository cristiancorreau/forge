// SPEC-051 — forge recommend: one pure engine, WHY anchored in detection.
// Imports the compiled dist modules — build first (npm run build:all).
//
//     node --test test/recommend.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

let rec, paths;
before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'recommend.js')), 'dist not built — run npm run build:all');
  rec = await import(pathToFileURL(join(DIST, 'lib', 'recommend.js')).href);
  paths = await import(pathToFileURL(join(DIST, 'lib', 'paths.js')).href);
});

function forgeRoot() {
  try { return paths.resolveForgeRoot(); } catch { return null; }
}
function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-rec-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('SPEC-051 — recommend engine', () => {
  test('a Django project recommends the django profile, with WHY citing the signal', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'manage.py'), '');
    writeFileSync(join(dir, 'requirements.txt'), 'django\npsycopg2\n');
    writeFileSync(join(dir, 'Dockerfile'), 'FROM python\n');
    mkdirSync(join(dir, '.git'));

    const { stack, recommendations } = rec.recommend(forgeRoot(), dir);
    assert.equal(stack.backend, 'django');

    const django = recommendations.find(r => r.item.type === 'profile' && r.item.id === 'django');
    assert.ok(django, 'django profile must be recommended');
    assert.equal(django.item.installable, true);
    assert.equal(django.signal, 'backend:django');
    assert.match(django.why, /django/i, 'WHY must cite the detected backend');

    // Docker + git signals also produce (non-installable) MCP recommendations.
    assert.ok(recommendations.some(r => r.item.id === 'docker'), 'docker MCP recommended');
    assert.ok(recommendations.some(r => r.item.id === 'git'), 'git MCP recommended');
  });

  test('every recommendation is anchored in a non-empty signal (no opinion)', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '15', 'drizzle-orm': '1' } }));
    const { recommendations } = rec.recommend(forgeRoot(), dir);
    assert.ok(recommendations.length > 0);
    for (const r of recommendations) {
      assert.ok(r.signal && r.signal.length > 0, 'each rec carries a detection signal');
      assert.ok(r.why && r.why.length > 0, 'each rec carries a WHY');
    }
    // nextjs → nextjs-admin profile, drizzle/postgres → postgres MCP.
    assert.ok(recommendations.some(r => r.item.id === 'nextjs-admin'), 'nextjs → nextjs-admin profile');
    assert.ok(recommendations.some(r => r.item.id === 'postgres'), 'drizzle ORM → postgres MCP');
  });

  test('non-installable items expose a manual install command, never --apply', (t) => {
    const dir = makeTmpDir(t);
    mkdirSync(join(dir, '.git'));
    const { recommendations } = rec.recommend(forgeRoot(), dir);
    const git = recommendations.find(r => r.item.id === 'git');
    assert.ok(git && git.item.installable === false, 'git MCP is not installable by forge');
    assert.ok(rec.manualInstallCommand(git.item)?.includes('mcp-server-git'), 'manual command present');
  });

  test('a project with no signals yields no recommendations', (t) => {
    const dir = makeTmpDir(t);
    const { recommendations } = rec.recommend(forgeRoot(), dir);
    assert.equal(recommendations.length, 0);
  });

  test('groupRecommendations caps to topN per category', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'Dockerfile'), 'FROM node\n');
    mkdirSync(join(dir, '.git'));
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    const { recommendations } = rec.recommend(forgeRoot(), dir);
    const groups = rec.groupRecommendations(recommendations, 1);
    for (const cat of Object.keys(groups)) {
      assert.ok(groups[cat].length <= 1, `category ${cat} capped to 1`);
    }
  });
});
