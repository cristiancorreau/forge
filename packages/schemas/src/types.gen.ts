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

/**
 * Modelo resuelto de un proyecto forge, emitido por `forge export --json` (SPEC-083 P2). Manifiesto machine-readable que un orquestador (mingako) puede consumir para inyectar agentes, skills y MCP servers en su runtime.
 */
export interface ProjectExport {
  schemaVersion: "1";
  project: {
    name: string;
    path: string;
    mode?: string;
    runtimes: string[];
    profiles: string[];
  };
  agents: {
    name: string;
    description: string;
    scope?: string;
    tools?: string[];
    model?: string;
    skills?: string[];
    mcpServers?: string[];
    sourceFile: string;
  }[];
  commands: {
    name: string;
    sourceFile: string;
  }[];
  skills: string[];
  mcpServers: {
    name: string;
    autoApprove?: string[];
  }[];
  perRuntime?: {
    [k: string]: {
      label: string;
      kind: "native" | "rules";
      surfaces: string[];
    };
  };
}

/**
 * Política MCP efectiva de un proyecto forge, emitida por `forge generate` en .forge/mcp-policy.json (SPEC-083 P5). Default-deny: toda tool no listada en autoApprove requiere aprobación. Un orquestador (mingako) la consume para sandboxing y approval gates sin re-derivarla de project.yaml.
 */
export interface McpPolicy {
  schemaVersion: "1";
  generatedBy: string;
  project: string;
  defaultPolicy: "deny";
  servers: {
    name: string;
    autoApprove: string[];
  }[];
  notes?: string;
}

/**
 * Discovery file ~/.forge/daemon.json written by the local orchestrator daemon (mingako) with mode 0600 and read by the pre-approval-gate.js hook to reach the approvals endpoint at http://127.0.0.1:<port>. Forge owns this shape; mingako owns the runtime semantics (SPEC-081 / SPEC-083 P6).
 */
export interface DaemonDiscovery {
  pid: number;
  port: number;
  token: string;
  startedAt: string;
}

// Union types de enums, derivados de las entidades (única fuente: schemas/)
export type TaskStatus = Task['status'];
export type SessionStatus = Session['status'];
export type HarnessStatus = Harness['status'];
export type ApprovalKind = Approval['kind'];
export type ApprovalResolution = NonNullable<Approval['resolution']>;
export type EventEntity = Event['entity'];
