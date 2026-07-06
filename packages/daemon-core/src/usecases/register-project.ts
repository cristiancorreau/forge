/**
 * registerProject (SPEC-076 § 5) — el parsing de project.yaml lo hace el
 * adapter en packages/daemon; aquí solo dominio puro.
 */
import type { RegistryPort } from '../ports/registry.js';
import type { ClockPort } from '../ports/clock.js';
import type { IdPort } from '../ports/id.js';
import type { EventBus } from '../ports/event-bus.js';
import type { Project, DomainEvent } from '../types.js';
import { DuplicateProjectPathError } from '../domain/errors.js';

export async function registerProject(
  deps: { registry: RegistryPort; clock: ClockPort; ids: IdPort; bus: EventBus },
  input: { path: string; name: string; profile: string; vcsRemote?: string },
): Promise<Project> {
  const existing = await deps.registry.projects.byPath(input.path);
  if (existing) throw new DuplicateProjectPathError(input.path);

  const project: Project = {
    id: deps.ids.newId(),
    name: input.name,
    path: input.path,
    profile: input.profile,
    ...(input.vcsRemote !== undefined ? { vcsRemote: input.vcsRemote } : {}),
    createdAt: deps.clock.nowIso(),
  };
  await deps.registry.projects.insert(project);

  const event: DomainEvent = {
    ts: deps.clock.nowIso(),
    kind: 'project.registered',
    entity: 'project',
    entityId: project.id,
    payload: { name: project.name, path: project.path },
  };
  await deps.registry.events.append(event);
  deps.bus.publish(event);

  return project;
}
