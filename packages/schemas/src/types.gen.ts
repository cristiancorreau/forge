/* GENERADO por scripts/generate.mjs — NO EDITAR */
/* eslint-disable */

/**
 * A project registered in the FORGE v4 daemon registry. Distinct from the per-project project.yaml config contract (core/schemas/project.schema.json).
 */
export interface Project {
  id: string;
  name: string;
  path: string;
  vcsRemote?: string;
  profile?: string;
  createdAt: string;
  lastSeenAt?: string;
}

/**
 * A (runtime x account) execution target with an isolated HOME. runtime is a free string: the runtime catalog is validated by the daemon, not by the contract.
 */
export interface Harness {
  id: string;
  runtime: string;
  label: string;
  homeDir: string;
  priority: number;
  status: "active" | "rate_limited" | "disabled";
  rateLimitedUntil?: string;
  createdAt: string;
}

/**
 * An agent team template.
 */
export interface Team {
  id: string;
  name: string;
  description?: string;
}

/**
 * A role inside a team: preferred runtime, system prompt reference and tool tier permissions.
 */
export interface TeamRole {
  id: string;
  teamId: string;
  roleName: string;
  runtimePref?: string;
  systemPromptRef?: string;
  tierPermissions?: {
    allow?: string[];
    deny?: string[];
  };
}

/**
 * A unit of work on a project, executed by agent sessions in a git worktree.
 */
export interface Task {
  id: string;
  projectId: string;
  teamId?: string;
  title: string;
  specRef?: string;
  status: "backlog" | "queued" | "running" | "needs_input" | "review" | "done" | "failed" | "orphaned";
  worktreePath?: string;
  baseSha?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * An agent session running a task on a harness (tmux-managed).
 */
export interface Session {
  id: string;
  taskId: string;
  harnessId: string;
  roleName?: string;
  tmuxSession?: string;
  transcriptRef?: string;
  status: "starting" | "running" | "exited" | "failed" | "orphaned";
  startedAt: string;
  endedAt?: string;
  tokensIn: number;
  tokensOut: number;
  handoffFrom?: string;
}

/**
 * A permission request raised by an agent session, resolved from the UI.
 */
export interface Approval {
  id: string;
  sessionId: string;
  kind: "tool_use" | "plan_review" | "question";
  payload: {};
  resolution?: "approved" | "denied" | "timeout";
  resolvedAt?: string;
}

/**
 * Append-only domain event. id is the SQLite rowid assigned by the store.
 */
export interface Event {
  id: number;
  ts: string;
  kind: string;
  entity: "project" | "harness" | "team" | "team_role" | "task" | "session" | "approval";
  entityId: string;
  payload?: {};
}

// Union types de enums, derivados de las entidades (única fuente: schemas/)
export type TaskStatus = Task['status'];
export type SessionStatus = Session['status'];
export type HarnessStatus = Harness['status'];
export type ApprovalKind = Approval['kind'];
export type ApprovalResolution = NonNullable<Approval['resolution']>;
export type EventEntity = Event['entity'];
