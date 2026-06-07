// SPEC-051 — forge recommend: one pure engine, WHY anchored in detection.
// SPEC-055 — forge recommend: exportable bundle + intent/interactive/apply-file.
// Imports the compiled dist modules — build first (npm run build:all).
//
//     node --test test/recommend.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync,
} from 'node:fs';
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

describe('SPEC-055 — buildBundle (plan declarativo)', () => {
  // Fixture: a RecommendResult with mixed installable/non-installable items.
  function makeFixtureResult() {
    return {
      stack: { language: 'python', backend: 'django', frontend: null, mobile: null, database: 'postgresql', orm: 'django-orm', testing: [], hasDocker: true },
      recommendations: [
        {
          item: {
            type: 'profile', id: 'django', label: 'Django', description: 'Profile Django',
            category: 'profile', tags: ['python'], installable: true, installed: false,
          },
          why: 'detecte el backend django',
          signal: 'backend:django',
          score: 3,
        },
        {
          item: {
            type: 'mcp-server', id: 'git', label: 'Git MCP', description: 'Git context via MCP',
            category: 'mcp-server', tags: ['git'], installable: false, installed: false,
            installSpec: {
              slug: 'git',
              command: 'claude',
              args: ['mcp', 'add', '--transport', 'stdio', 'git', '--', 'uvx', 'mcp-server-git', '--repository', '.'],
              params: [],
              env: [],
            },
          },
          why: 'detecte un repositorio git',
          signal: 'git',
          score: 1,
        },
      ],
    };
  }

  test('buildBundle returns stable shape from RecommendResult fixture', () => {
    const result = makeFixtureResult();
    const bundle = rec.buildBundle(result);

    // Shape assertions.
    assert.ok(bundle.createdFrom, 'bundle.createdFrom present');
    assert.ok(Array.isArray(bundle.createdFrom.signals), 'signals is array');
    assert.ok(Array.isArray(bundle.items), 'items is array');

    // Signals derived from recommendations.
    assert.deepStrictEqual(
      [...bundle.createdFrom.signals].sort(),
      ['backend:django', 'git'],
      'signals match recommendation signals',
    );

    // No intent if not provided.
    assert.equal(bundle.createdFrom.intent, undefined, 'no intent when not passed');

    // Items count matches recommendations.
    assert.equal(bundle.items.length, 2, 'two items in bundle');

    // First item (installable).
    const djangoItem = bundle.items.find(i => i.id === 'django');
    assert.ok(djangoItem, 'django item present');
    assert.equal(djangoItem.type, 'profile');
    assert.equal(djangoItem.category, 'profile');
    assert.equal(djangoItem.installable, true);
    assert.ok(djangoItem.why && djangoItem.why.length > 0, 'why present');

    // Second item (non-installable with installSpec).
    const gitItem = bundle.items.find(i => i.id === 'git');
    assert.ok(gitItem, 'git item present');
    assert.equal(gitItem.installable, false);
    assert.ok(gitItem.installSpec, 'installSpec present for non-installable');
    assert.equal(gitItem.installSpec.command, 'claude');
  });

  test('buildBundle incorporates intent into createdFrom.intent', () => {
    const result = makeFixtureResult();
    const bundle = rec.buildBundle(result, 'quiero CI con tests end-to-end');
    assert.equal(bundle.createdFrom.intent, 'quiero CI con tests end-to-end');
  });

  test('buildBundle with empty intent string omits intent field', () => {
    const result = makeFixtureResult();
    const bundle = rec.buildBundle(result, '');
    assert.equal(bundle.createdFrom.intent, undefined, 'empty intent is omitted');
  });

  test('buildBundle with no recommendations yields empty items and signals', () => {
    const result = { stack: {}, recommendations: [] };
    const bundle = rec.buildBundle(result, 'test intent');
    assert.deepStrictEqual(bundle.items, []);
    assert.deepStrictEqual(bundle.createdFrom.signals, []);
    assert.equal(bundle.createdFrom.intent, 'test intent');
  });

  test('buildBundle signals are deduplicated', () => {
    // Two recommendations with the same signal.
    const result = {
      stack: {},
      recommendations: [
        {
          item: { type: 'profile', id: 'a', label: 'A', description: '', category: 'profile', tags: [], installable: true, installed: false },
          why: 'why a', signal: 'backend:django', score: 3,
        },
        {
          item: { type: 'profile', id: 'b', label: 'B', description: '', category: 'profile', tags: [], installable: true, installed: false },
          why: 'why b', signal: 'backend:django', score: 2,
        },
      ],
    };
    const bundle = rec.buildBundle(result);
    assert.equal(bundle.createdFrom.signals.length, 1, 'duplicate signals deduplicated');
    assert.equal(bundle.createdFrom.signals[0], 'backend:django');
  });

  test('non-installable items in bundle never have installable:true', () => {
    const result = makeFixtureResult();
    const bundle = rec.buildBundle(result);
    for (const item of bundle.items) {
      if (item.id === 'git') {
        assert.equal(item.installable, false, 'git stays non-installable in bundle');
      }
    }
  });

  test('roundtrip: export bundle to file then verify installable/non-installable split', (t) => {
    const dir = makeTmpDir(t);
    const bundlePath = join(dir, 'bundle.json');

    const result = makeFixtureResult();
    const bundle = rec.buildBundle(result, 'test roundtrip');
    writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), 'utf-8');

    // Read back and verify.
    const loaded = JSON.parse(readFileSync(bundlePath, 'utf-8'));
    assert.equal(loaded.createdFrom.intent, 'test roundtrip');
    assert.equal(loaded.items.length, 2);

    const installableItems = loaded.items.filter(i => i.installable);
    const nonInstallableItems = loaded.items.filter(i => !i.installable);
    assert.equal(installableItems.length, 1, 'one installable item');
    assert.equal(nonInstallableItems.length, 1, 'one non-installable item');
    assert.equal(installableItems[0].id, 'django');
    assert.equal(nonInstallableItems[0].id, 'git');
  });

  test('SPEC-055 acceptance: buildBundle delegates to recommend engine — no second engine', (t) => {
    // Verify that buildBundle is a pure transform of RecommendResult (no engine code of its own).
    // We call recommend() then buildBundle() and verify every bundle item.id
    // maps to an original recommendation — proof no items were invented.
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'manage.py'), '');
    writeFileSync(join(dir, 'requirements.txt'), 'django\n');
    mkdirSync(join(dir, '.git'));

    const result = rec.recommend(forgeRoot(), dir);
    const bundle = rec.buildBundle(result, 'django CI');

    const recIds = new Set(result.recommendations.map(r => r.item.id));
    for (const item of bundle.items) {
      assert.ok(recIds.has(item.id), `bundle item ${item.id} exists in recommendations — no invented items`);
    }
    assert.equal(bundle.items.length, result.recommendations.length, 'item count matches');
  });
});
