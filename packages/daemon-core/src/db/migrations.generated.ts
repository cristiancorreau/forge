/* GENERADO por scripts/build-migrations.mjs — NO EDITAR.
 * Fuente de verdad: migrations/*.sql (SPEC-076). */

export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: ReadonlyArray<Migration> = [
  {
    id: 1,
    name: "001-init",
    sql: `-- 001-init — FORGE v4 control plane, esquema inicial (SPEC-076 § 7, SPEC-074 § Modelo de datos)
-- DDL plano aplicable a una SQLite vacía. La tabla de control schema_migrations
-- y la ejecución son responsabilidad del runner en packages/daemon (SPEC-078).

CREATE TABLE projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  path         TEXT NOT NULL UNIQUE,
  vcs_remote   TEXT,
  profile      TEXT,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE harnesses (
  id                 TEXT PRIMARY KEY,
  runtime            TEXT NOT NULL,
  label              TEXT NOT NULL,
  home_dir           TEXT NOT NULL,
  priority           INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL CHECK (status IN ('active','rate_limited','disabled')),
  rate_limited_until TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE teams (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT
);

CREATE TABLE team_roles (
  id                TEXT PRIMARY KEY,
  team_id           TEXT NOT NULL REFERENCES teams(id),
  role_name         TEXT NOT NULL,
  runtime_pref      TEXT,
  system_prompt_ref TEXT,
  tier_permissions  TEXT
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  team_id       TEXT REFERENCES teams(id),
  title         TEXT NOT NULL,
  spec_ref      TEXT,
  status        TEXT NOT NULL CHECK (status IN ('backlog','queued','running','needs_input','review','done','failed','orphaned')),
  worktree_path TEXT,
  base_sha      TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id),
  harness_id     TEXT NOT NULL REFERENCES harnesses(id),
  role_name      TEXT,
  tmux_session   TEXT,
  transcript_ref TEXT,
  status         TEXT NOT NULL CHECK (status IN ('running','done','failed','orphaned')),
  started_at     TEXT NOT NULL,
  ended_at       TEXT,
  tokens_in      INTEGER NOT NULL DEFAULT 0,
  tokens_out     INTEGER NOT NULL DEFAULT 0,
  handoff_from   TEXT
);

CREATE TABLE approvals (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  kind         TEXT NOT NULL CHECK (kind IN ('tool_use','plan_review','question')),
  payload_json TEXT NOT NULL,
  resolution   TEXT CHECK (resolution IN ('approved','denied','timeout')),
  resolved_at  TEXT
);

CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,
  kind         TEXT NOT NULL,
  entity       TEXT NOT NULL CHECK (entity IN ('project','harness','team','team_role','task','session','approval')),
  entity_id    TEXT NOT NULL,
  payload_json TEXT
);

CREATE INDEX idx_tasks_project      ON tasks (project_id);
CREATE INDEX idx_tasks_status       ON tasks (status);
CREATE INDEX idx_sessions_task      ON sessions (task_id);
CREATE INDEX idx_sessions_status    ON sessions (status);
CREATE INDEX idx_events_ts          ON events (ts);
CREATE INDEX idx_approvals_session  ON approvals (session_id);
`,
  },
  {
    id: 2,
    name: "002-projects-metadata",
    sql: `-- 002-projects-metadata — registro multi-proyecto (SPEC-077 § 4)
-- Agrega el subconjunto cacheado de project.yaml (metadata_json) y el estado
-- del proyecto (active | missing | invalid) a la tabla projects.
-- No crea índice de path: el UNIQUE (projects.path) ya viene de 001-init.sql.

ALTER TABLE projects ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','missing','invalid'));
`,
  },
];
