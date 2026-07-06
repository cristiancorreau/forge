/** InMemoryRegistry — RegistryPort con Maps por tabla (SPEC-076 § 6). */
import type { RegistryPort, Repo } from '../ports/registry.js';
import type {
  Project, Harness, Team, Task, Session, Approval, TaskStatus, DomainEvent,
} from '../types.js';

class InMemoryRepo<T extends { id: string }> implements Repo<T> {
  protected readonly rows = new Map<string, T>();

  async insert(row: T): Promise<void> {
    this.rows.set(row.id, structuredClone(row));
  }

  async byId(id: string): Promise<T | null> {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : null;
  }

  async list(): Promise<T[]> {
    return [...this.rows.values()].map((r) => structuredClone(r));
  }

  async update(row: T): Promise<void> {
    this.rows.set(row.id, structuredClone(row));
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }

  protected filter(pred: (row: T) => boolean): Promise<T[]> {
    return Promise.resolve([...this.rows.values()].filter(pred).map((r) => structuredClone(r)));
  }
}

class ProjectsRepo extends InMemoryRepo<Project> {
  async byPath(path: string): Promise<Project | null> {
    return (await this.filter((p) => p.path === path))[0] ?? null;
  }
}

class HarnessesRepo extends InMemoryRepo<Harness> {
  async available(nowIso: string): Promise<Harness[]> {
    return this.filter(
      (h) => h.status === 'active'
        || (h.status === 'rate_limited' && !!h.rateLimitedUntil && h.rateLimitedUntil <= nowIso),
    );
  }
}

class TasksRepo extends InMemoryRepo<Task> {
  async byProject(projectId: string): Promise<Task[]> {
    return this.filter((t) => t.projectId === projectId);
  }

  async byStatus(status: TaskStatus): Promise<Task[]> {
    return this.filter((t) => t.status === status);
  }
}

class SessionsRepo extends InMemoryRepo<Session> {
  async active(): Promise<Session[]> {
    return this.filter((s) => s.status === 'running');
  }

  async byTask(taskId: string): Promise<Session[]> {
    return this.filter((s) => s.taskId === taskId);
  }
}

class ApprovalsRepo extends InMemoryRepo<Approval> {
  async pending(): Promise<Approval[]> {
    return this.filter((a) => a.resolution === undefined);
  }
}

class InMemoryEvents {
  readonly appended: DomainEvent[] = [];
  private nextId = 1;

  async append(e: DomainEvent): Promise<void> {
    this.appended.push({ ...structuredClone(e), id: e.id ?? this.nextId++ });
  }

  async since(tsIso: string, limit?: number): Promise<DomainEvent[]> {
    const out = this.appended.filter((e) => e.ts >= tsIso).map((e) => structuredClone(e));
    return limit === undefined ? out : out.slice(0, limit);
  }
}

export class InMemoryRegistry implements RegistryPort {
  readonly projects = new ProjectsRepo();
  readonly harnesses = new HarnessesRepo();
  readonly teams = new InMemoryRepo<Team>();
  readonly tasks = new TasksRepo();
  readonly sessions = new SessionsRepo();
  readonly approvals = new ApprovalsRepo();
  readonly events = new InMemoryEvents();
}
