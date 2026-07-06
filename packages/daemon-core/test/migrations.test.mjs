// Migraciones SQL (SPEC-076 § 7-8):
// - sincronía entre migrations/*.sql y src/db/migrations.generated.ts
//   (falla si divergen; `node scripts/build-migrations.mjs` re-sincroniza);
// - DDL con las 8 tablas, UNIQUE, CHECKs e índices del maestro;
// - aplicación limpia sobre SQLite vacía vía node:sqlite (se salta si el
//   builtin no está disponible — no exige SQLite instalado en el sistema).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, '..');
const MIGRATIONS_DIR = join(PKG, 'migrations');

const { MIGRATIONS } = await import('@cristiancorreau/forge-daemon-core');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // node:sqlite no disponible en este Node — el criterio permite saltar
}

const normalize = (s) => s.replace(/\r\n/g, '\n').trim();

describe('migraciones — sincronía .sql ↔ generated', () => {
  test('los archivos NNN-*.sql y MIGRATIONS coinciden 1:1 (contenido normalizado)', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}-.+\.sql$/.test(f)).sort();
    assert.equal(files.length, MIGRATIONS.length,
      'cantidad de .sql ≠ entradas en MIGRATIONS — corre "node scripts/build-migrations.mjs"');
    files.forEach((file, i) => {
      const entry = MIGRATIONS[i];
      assert.equal(entry.name, file.replace(/\.sql$/, ''));
      assert.equal(entry.id, parseInt(file.slice(0, 3), 10));
      assert.equal(
        normalize(entry.sql),
        normalize(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')),
        `${file} divergió de migrations.generated.ts — corre "node scripts/build-migrations.mjs"`,
      );
    });
  });

  test('001-init existe y es la primera migración', () => {
    assert.equal(MIGRATIONS[0].id, 1);
    assert.equal(MIGRATIONS[0].name, '001-init');
  });
});

describe('001-init — contenido del DDL (SPEC-076 § 7)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '001-init.sql'), 'utf-8');

  test('define las 8 tablas del maestro', () => {
    for (const table of ['projects', 'harnesses', 'teams', 'team_roles', 'tasks', 'sessions', 'approvals', 'events']) {
      assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`), `falta tabla ${table}`);
    }
  });

  test('UNIQUE en projects.path', () => {
    assert.match(sql, /path\s+TEXT NOT NULL UNIQUE/);
  });

  test('CHECK de enums de status', () => {
    assert.match(sql, /CHECK \(status IN \('backlog','queued','running','needs_input','review','done','failed','orphaned'\)\)/);
    assert.match(sql, /CHECK \(status IN \('running','done','failed','orphaned'\)\)/);
    assert.match(sql, /CHECK \(status IN \('active','rate_limited','disabled'\)\)/);
  });

  test('los 6 índices del punto 7', () => {
    for (const idx of ['idx_tasks_project', 'idx_tasks_status', 'idx_sessions_task',
                       'idx_sessions_status', 'idx_events_ts', 'idx_approvals_session']) {
      assert.match(sql, new RegExp(`CREATE INDEX ${idx}\\b`), `falta índice ${idx}`);
    }
  });
});

describe('001-init — aplica limpio sobre SQLite vacía', () => {
  test('exec del DDL completo en :memory:', { skip: !DatabaseSync && 'node:sqlite no disponible' }, () => {
    const db = new DatabaseSync(':memory:');
    db.exec(MIGRATIONS[0].sql);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name);
    assert.deepEqual(tables, ['approvals', 'events', 'harnesses', 'projects', 'sessions', 'tasks', 'team_roles', 'teams']);
    db.close();
  });
});
