// SqliteRegistry contra DB temporal vía FORGE_HOME (SPEC-077 § 3).
// Se salta si node:sqlite no está disponible en el Node actual (< 22.5).
// Requiere `npm run build` previo.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let sqliteAvailable = true;
try {
  await import('node:sqlite');
} catch {
  sqliteAvailable = false;
}
const SKIP = !sqliteAvailable && 'node:sqlite no disponible (Node < 22.5)';

const NOW = '2026-07-05T12:00:00.000Z';
const PROJECT = {
  id: 'prj_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  name: 'demo',
  path: '/tmp/demo',
  profile: 'enterprise',
  vcsRemote: 'git@github.com:demo/demo.git',
  status: 'active',
  metadata: { language: 'typescript', runtimes: ['claude-code'], specsDir: 'docs/specs' },
  createdAt: NOW,
  lastSeenAt: NOW,
};

let forgeHome;
let SqliteRegistry;
let registry;

before(async () => {
  forgeHome = mkdtempSync(join(tmpdir(), 'forge-registry-'));
  process.env.FORGE_HOME = forgeHome;
  if (sqliteAvailable) {
    ({ SqliteRegistry } = await import('@cristiancorreau/forge-daemon')); // adapters del paquete compilado
    registry = new SqliteRegistry();
  }
});

after(() => {
  registry?.close();
  rmSync(forgeHome, { recursive: true, force: true });
  delete process.env.FORGE_HOME;
});

describe('SqliteRegistry — apertura y migraciones', { skip: SKIP }, () => {
  test('crea $FORGE_HOME/forge.db y aplica las 2 migraciones (schema_migrations)', async () => {
    assert.ok(existsSync(join(forgeHome, 'forge.db')), 'no creó forge.db en FORGE_HOME');
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(forgeHome, 'forge.db'));
    const applied = db.prepare('SELECT id, name FROM schema_migrations ORDER BY id').all();
    assert.deepEqual(applied.map((r) => [r.id, r.name]), [[1, '001-init'], [2, '002-projects-metadata']]);
    const mode = db.prepare('PRAGMA journal_mode').get();
    assert.equal(String(mode.journal_mode).toLowerCase(), 'wal', 'journal_mode debe ser WAL');
    db.close();
  });

  test('reabrir la DB es idempotente (no re-aplica migraciones)', async () => {
    const again = new SqliteRegistry();
    again.close();
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(forgeHome, 'forge.db'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 2);
    db.close();
  });
});

describe('SqliteRegistry.projects — CRUD y mapeo camelCase↔snake_case', { skip: SKIP }, () => {
  test('insert + byId round-trip completo (metadata y status incluidos)', async () => {
    await registry.projects.insert(PROJECT);
    const found = await registry.projects.byId(PROJECT.id);
    assert.deepEqual(found, PROJECT);
  });

  test('byPath encuentra por ruta; inexistente → null', async () => {
    assert.deepEqual(await registry.projects.byPath('/tmp/demo'), PROJECT);
    assert.equal(await registry.projects.byPath('/tmp/nope'), null);
    assert.equal(await registry.projects.byId('prj_00000000000000000000000000'), null);
  });

  test('UNIQUE(path) de 001-init sigue vigente', async () => {
    await assert.rejects(
      registry.projects.insert({ ...PROJECT, id: 'prj_01ARZ3NDEKTSV4RRFFQ69G5FAW' }),
      /UNIQUE/i,
    );
  });

  test('CHECK(status) de 002 rechaza estados fuera del enum', async () => {
    await assert.rejects(
      registry.projects.insert({
        ...PROJECT, id: 'prj_01ARZ3NDEKTSV4RRFFQ69G5FAX', path: '/tmp/otro', status: 'gone',
      }),
      /CHECK/i,
    );
  });

  test('update modifica status/metadata/lastSeenAt', async () => {
    const updated = {
      ...PROJECT,
      status: 'missing',
      metadata: { language: 'php' },
      lastSeenAt: '2026-07-05T13:00:00.000Z',
    };
    await registry.projects.update(updated);
    assert.deepEqual(await registry.projects.byId(PROJECT.id), updated);
  });

  test('campos opcionales ausentes no viajan como null', async () => {
    const minimal = {
      id: 'prj_01ARZ3NDEKTSV4RRFFQ69G5FB0',
      name: 'min', path: '/tmp/min', createdAt: NOW,
    };
    await registry.projects.insert(minimal);
    const found = await registry.projects.byId(minimal.id);
    assert.equal('vcsRemote' in found, false);
    assert.equal('profile' in found, false);
    assert.equal('lastSeenAt' in found, false);
    assert.equal(found.status, 'active', 'default de columna de 002');
    assert.deepEqual(found.metadata, {});
  });

  test('list ordena por created_at y remove elimina', async () => {
    const all = await registry.projects.list();
    assert.deepEqual(all.map((p) => p.path).sort(), ['/tmp/demo', '/tmp/min']);
    await registry.projects.remove('prj_01ARZ3NDEKTSV4RRFFQ69G5FB0');
    assert.equal((await registry.projects.list()).length, 1);
  });
});

describe('SqliteRegistry.events — append-only', { skip: SKIP }, () => {
  test('append asigna rowid creciente y since filtra por ts con limit', async () => {
    await registry.events.append({
      ts: '2026-07-05T12:00:00.000Z', kind: 'project.added', entity: 'project',
      entityId: PROJECT.id, payload: { name: 'demo' },
    });
    await registry.events.append({
      ts: '2026-07-05T12:05:00.000Z', kind: 'project.updated', entity: 'project',
      entityId: PROJECT.id,
    });

    const all = await registry.events.since('2026-07-05T00:00:00.000Z');
    assert.equal(all.length, 2);
    assert.ok(all[0].id < all[1].id, 'ids append-only crecientes');
    assert.deepEqual(all[0].payload, { name: 'demo' });
    assert.equal('payload' in all[1], false, 'payload NULL no viaja');

    const later = await registry.events.since('2026-07-05T12:01:00.000Z');
    assert.deepEqual(later.map((e) => e.kind), ['project.updated']);

    const limited = await registry.events.since('2026-07-05T00:00:00.000Z', 1);
    assert.equal(limited.length, 1);
  });
});

describe('SqliteRegistry — repos de fases futuras', { skip: SKIP }, () => {
  test('tasks/sessions/harnesses lanzan NotImplemented (SPEC-078)', async () => {
    await assert.rejects(async () => registry.tasks.list(), /not implemented/i);
    await assert.rejects(async () => registry.sessions.active(), /not implemented/i);
    await assert.rejects(async () => registry.harnesses.byId('hrn_x'), /not implemented/i);
  });
});
