/**
 * openSession (SPEC-076 § 5):
 *   1) valida task y harness;
 *   2) si task.worktreePath es null, crea worktree (branch `forge/{taskId}`,
 *      base task.baseSha ?? vcs.currentSha) y actualiza la task;
 *   3) sessions.open con sessionName(...) y runtimes.get(...).buildCommand(...);
 *   4) persiste session status='running', task → 'running' (via canTransition);
 *   5) evento 'session.opened'.
 */
import type { RegistryPort } from '../ports/registry.js';
import type { SessionPort } from '../ports/session.js';
import type { RuntimeProvider } from '../ports/runtime.js';
import type { VcsPort } from '../ports/vcs.js';
import type { ClockPort } from '../ports/clock.js';
import type { IdPort } from '../ports/id.js';
import type { EventBus } from '../ports/event-bus.js';
import type { Session, Task, DomainEvent } from '../types.js';
import {
  DomainError, TaskNotFoundError, HarnessNotFoundError,
  ProjectNotFoundError, InvalidTransitionError,
} from '../domain/errors.js';
import { canTransition } from '../domain/task-status.js';
import { sessionName } from '../domain/session-name.js';

export async function openSession(
  deps: { registry: RegistryPort; sessions: SessionPort; runtimes: RuntimeProvider;
          vcs: VcsPort; clock: ClockPort; ids: IdPort; bus: EventBus },
  input: { taskId: string; harnessId: string; roleName: string; prompt: string },
): Promise<Session> {
  let task = await deps.registry.tasks.byId(input.taskId);
  if (!task) throw new TaskNotFoundError(input.taskId);

  const harness = await deps.registry.harnesses.byId(input.harnessId);
  if (!harness) throw new HarnessNotFoundError(input.harnessId);

  const project = await deps.registry.projects.byId(task.projectId);
  if (!project) throw new ProjectNotFoundError(task.projectId);

  const runtime = deps.runtimes.get(harness.runtime);
  if (!runtime) {
    throw new DomainError('RUNTIME_NOT_AVAILABLE', `No runtime driver for: ${harness.runtime}`);
  }

  const now = deps.clock.nowIso();

  if (!task.worktreePath) {
    const baseSha = task.baseSha ?? await deps.vcs.currentSha(project.path);
    const worktreePath = await deps.vcs.createWorktree(project.path, `forge/${task.id}`, baseSha);
    task = { ...task, worktreePath, baseSha, updatedAt: now };
    await deps.registry.tasks.update(task);
  }

  const name = sessionName(project.name, task.id, input.roleName);
  const command = runtime.buildCommand({
    harness, task, roleName: input.roleName, prompt: input.prompt,
  });
  await deps.sessions.open({ name, cwd: task.worktreePath as string, command });

  const session: Session = {
    id: deps.ids.newId(),
    taskId: task.id,
    harnessId: harness.id,
    roleName: input.roleName,
    tmuxSession: name,
    status: 'running',
    startedAt: now,
    tokensIn: 0,
    tokensOut: 0,
  };
  await deps.registry.sessions.insert(session);

  if (task.status !== 'running') {
    if (!canTransition(task.status, 'running')) {
      throw new InvalidTransitionError(task.status, 'running');
    }
    const runningTask: Task = { ...task, status: 'running', updatedAt: now };
    await deps.registry.tasks.update(runningTask);
  }

  const event: DomainEvent = {
    ts: now,
    kind: 'session.opened',
    entity: 'session',
    entityId: session.id,
    payload: { taskId: task.id, harnessId: harness.id, tmuxSession: name },
  };
  await deps.registry.events.append(event);
  deps.bus.publish(event);

  return session;
}
