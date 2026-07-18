/**
 * SqliteRegistry — RegistryPort sobre node:sqlite (DatabaseSync), SPEC-077 § 3.
 *
 * En Fase 1 implementa `projects` y `events` completos; el resto de repos
 * lanza NotImplemented y llega con SPEC-078. Sin dependencias nativas de npm:
 * node:sqlite es builtin en Node >= 22.5 y Bun >= 1.2.
 *
 * Convivencia CLI/daemon: journal_mode=WAL + busy_timeout=5000.
 * Mapeo camelCase (contrato de schemas) ↔ snake_case (columnas), SPEC-075.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS } from '@cristiancorreau/forge-daemon-core';
import type {
  RegistryPort, Repo, Project, Harness, Team, Task, Session, Approval,
  TaskStatus, DomainEvent,
} from '@cristiancorreau/forge-daemon-core';
import { defaultDbPath } from './forge-home.js';

type Row = Record<string, unknown>;

function projectToRow(p: Project): Row {
  return {
    id: p.id,
    name: p.name,
    path: p.path,
    vcs_remote: p.vcsRemote ?? null,
    profile: p.profile ?? null,
    created_at: p.createdAt,
    last_seen_at: p.lastSeenAt ?? null,
    metadata_json: JSON.stringify(p.metadata ?? {}),
    status: p.status ?? 'active',
  };
}

function projectFromRow(row: Row): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    path: row.path as string,
    ...(row.vcs_remote != null ? { vcsRemote: row.vcs_remote as string } : {}),
    ...(row.profile != null ? { profile: row.profile as string } : {}),
    status: row.status as Project['status'],
    metadata: JSON.parse((row.metadata_json as string) || '{}'),
    createdAt: row.created_at as string,
    ...(row.last_seen_at != null ? { lastSeenAt: row.last_seen_at as string } : {}),
  };
}

function eventFromRow(row: Row): DomainEvent {
  return {
    id: row.id as number,
    ts: row.ts as string,
    kind: row.kind as string,
    entity: row.entity as DomainEvent['entity'],
    entityId: row.entity_id as string,
    ...(row.payload_json != null ? { payload: JSON.parse(row.payload_json as string) } : {}),
  };
}

class SqliteProjectsRepo implements Repo<Project> {
  constructor(private readonly db: DatabaseSync) {}

  async insert(row: Project): Promise<void> {
    const r = projectToRow(row);
    this.db.prepare(
      `INSERT INTO projects (id, name, path, vcs_remote, profile, created_at, last_seen_at, metadata_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      r.id as string, r.name as string, r.path as string,
      r.vcs_remote as string | null, r.profile as string | null,
      r.created_at as string, r.last_seen_at as string | null,
      r.metadata_json as string, r.status as string,
    );
  }

  async byId(id: string): Promise<Project | null> {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined;
    return row ? projectFromRow(row) : null;
  }

  async byPath(path: string): Promise<Project | null> {
    const row = this.db.prepare('SELECT * FROM projects WHERE path = ?').get(path) as Row | undefined;
    return row ? projectFromRow(row) : null;
  }

  async list(): Promise<Project[]> {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at, id').all() as Row[];
    return rows.map(projectFromRow);
  }

  async update(row: Project): Promise<void> {
    const r = projectToRow(row);
    this.db.prepare(
      `UPDATE projects
       SET name = ?, path = ?, vcs_remote = ?, profile = ?, created_at = ?,
           last_seen_at = ?, metadata_json = ?, status = ?
       WHERE id = ?`,
    ).run(
      r.name as string, r.path as string, r.vcs_remote as string | null,
      r.profile as string | null, r.created_at as string,
      r.last_seen_at as string | null, r.metadata_json as string,
      r.status as string, r.id as string,
    );
  }

  async remove(id: string): Promise<void> {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }
}

class SqliteEvents {
  constructor(private readonly db: DatabaseSync) {}

  async append(e: DomainEvent): Promise<void> {
    this.db.prepare(
      'INSERT INTO events (ts, kind, entity, entity_id, payload_json) VALUES (?, ?, ?, ?, ?)',
    ).run(e.ts, e.kind, e.entity, e.entityId, e.payload !== undefined ? JSON.stringify(e.payload) : null);
  }

  async since(tsIso: string, limit?: number): Promise<DomainEvent[]> {
    const rows = this.db.prepare(
      'SELECT * FROM events WHERE ts >= ? ORDER BY id LIMIT ?',
    ).all(tsIso, limit ?? -1) as Row[];
    return rows.map(eventFromRow);
  }
}

/** Repos que llegan con SPEC-078: cualquier método lanza NotImplemented. */
function notImplementedRepo<T>(name: string): T {
  return new Proxy({}, {
    get(_target, prop) {
      return () => {
        throw new Error(`SqliteRegistry.${name}.${String(prop)}: not implemented in phase 1 (SPEC-078)`);
      };
    },
  }) as T;
}

export class SqliteRegistry implements RegistryPort {
  readonly projects: Repo<Project> & { byPath(path: string): Promise<Project | null> };
  readonly events: { append(e: DomainEvent): Promise<void>; since(tsIso: string, limit?: number): Promise<DomainEvent[]> };
  readonly harnesses = notImplementedRepo<RegistryPort['harnesses']>('harnesses');
  readonly teams = notImplementedRepo<Repo<Team>>('teams');
  readonly tasks = notImplementedRepo<RegistryPort['tasks']>('tasks');
  readonly sessions = notImplementedRepo<RegistryPort['sessions']>('sessions');
  readonly approvals = notImplementedRepo<RegistryPort['approvals']>('approvals');

  private readonly db: DatabaseSync;

  constructor(dbPath: string = defaultDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.applyMigrations();
    this.projects = new SqliteProjectsRepo(this.db);
    this.events = new SqliteEvents(this.db);
  }

  /** Aplica las migraciones inlineadas de daemon-core con tabla de control schema_migrations. */
  private applyMigrations(): void {
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);',
    );
    const applied = new Set(
      (this.db.prepare('SELECT id FROM schema_migrations').all() as Row[]).map((r) => r.id as number),
    );
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      this.db.exec(migration.sql);
      this.db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.id, migration.name, new Date().toISOString());
    }
  }

  close(): void {
    this.db.close();
  }
}
