/**
 * @cristiancorreau/forge-daemon-core — dominio puro del plano de control
 * FORGE v4 (SPEC-076). Sin imports de node:/bun:/sqlite/http: toda
 * integración externa entra por puertos. Fakes en memoria en './testing'.
 */

// Tipos de entidades (re-export del contrato neutral, SPEC-075)
export * from './types.js';

// Puertos
export type { Repo, RegistryPort } from './ports/registry.js';
export type { SessionPort } from './ports/session.js';
export type { RuntimeCommand, RuntimeEvent, RuntimePort, RuntimeProvider } from './ports/runtime.js';
export type { MemoryPort } from './ports/memory.js';
export type { ApprovalPort } from './ports/approval.js';
export type { VcsPort } from './ports/vcs.js';
export type { EventBus } from './ports/event-bus.js';
export type { ClockPort } from './ports/clock.js';
export type { IdPort } from './ports/id.js';

// Dominio puro
export { canTransition } from './domain/task-status.js';
export { sessionName } from './domain/session-name.js';
export {
  DomainError, DuplicateProjectPathError, ProjectNotFoundError,
  TaskNotFoundError, HarnessNotFoundError, InvalidTransitionError,
} from './domain/errors.js';

// Casos de uso
export { registerProject } from './usecases/register-project.js';
export { createTask } from './usecases/create-task.js';
export { openSession } from './usecases/open-session.js';
export { reconcileOnBoot } from './usecases/reconcile-on-boot.js';

// Migraciones (SQL inlineado — generado desde migrations/*.sql)
export { MIGRATIONS } from './db/migrations.generated.js';
export type { Migration } from './db/migrations.generated.js';
