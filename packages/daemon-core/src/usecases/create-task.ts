/** createTask (SPEC-076 § 5). status inicial: 'backlog'. */
import type { RegistryPort } from '../ports/registry.js';
import type { ClockPort } from '../ports/clock.js';
import type { IdPort } from '../ports/id.js';
import type { EventBus } from '../ports/event-bus.js';
import type { Task, DomainEvent } from '../types.js';
import { ProjectNotFoundError } from '../domain/errors.js';

export async function createTask(
  deps: { registry: RegistryPort; clock: ClockPort; ids: IdPort; bus: EventBus },
  input: { projectId: string; title: string; teamId?: string; specRef?: string },
): Promise<Task> {
  const project = await deps.registry.projects.byId(input.projectId);
  if (!project) throw new ProjectNotFoundError(input.projectId);

  const now = deps.clock.nowIso();
  const task: Task = {
    id: deps.ids.newId(),
    projectId: input.projectId,
    title: input.title,
    ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
    ...(input.specRef !== undefined ? { specRef: input.specRef } : {}),
    status: 'backlog',
    createdAt: now,
    updatedAt: now,
  };
  await deps.registry.tasks.insert(task);

  const event: DomainEvent = {
    ts: now,
    kind: 'task.created',
    entity: 'task',
    entityId: task.id,
    payload: { projectId: task.projectId, title: task.title },
  };
  await deps.registry.events.append(event);
  deps.bus.publish(event);

  return task;
}
