/**
 * RegistryPort — persistencia del registro (SPEC-076 § 3).
 * La implementación SQLite vive en packages/daemon (SPEC-078).
 */
import type {
  Project, Harness, Team, Task, Session, Approval, TaskStatus, DomainEvent,
} from '../types.js';

export interface Repo<T extends { id: string }> {
  insert(row: T): Promise<void>;
  byId(id: string): Promise<T | null>;
  list(): Promise<T[]>;
  update(row: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface RegistryPort {
  projects: Repo<Project> & { byPath(path: string): Promise<Project | null> };
  harnesses: Repo<Harness> & { available(nowIso: string): Promise<Harness[]> };
  teams: Repo<Team>;
  tasks: Repo<Task> & {
    byProject(projectId: string): Promise<Task[]>;
    byStatus(status: TaskStatus): Promise<Task[]>;
  };
  sessions: Repo<Session> & {
    active(): Promise<Session[]>;            // status = 'running'
    byTask(taskId: string): Promise<Session[]>;
  };
  approvals: Repo<Approval> & { pending(): Promise<Approval[]> };
  events: {
    append(e: DomainEvent): Promise<void>;   // append-only, sin update/remove
    since(tsIso: string, limit?: number): Promise<DomainEvent[]>;
  };
}
