/**
 * @cristiancorreau/forge-schemas — contratos neutrales del dominio FORGE v4.
 *
 * Fuente de verdad: schemas/*.schema.json (draft-07). Tipos y validadores
 * GENERADOS con `npm run generate` (SPEC-075). Este archivo es la API pública.
 */
import type {
  Project, Harness, Team, TeamRole, Task, Session, Approval, Event,
  TaskStatus,
} from './types.gen.js';
import {
  validateProject, validateHarness, validateTeam, validateTeamRole,
  validateTask, validateSession, validateApproval, validateEvent,
} from './validators.gen.mjs';
import type { ValidateFn } from './validators.gen.mjs';
import { SCHEMAS as GENERATED_SCHEMAS } from './schemas.gen.js';

export type {
  Project, ProjectMetadata, Harness, Team, TeamRole, Task, Session, Approval, Event,
  TaskStatus, SessionStatus, HarnessStatus, ApprovalKind,
  ApprovalResolution, EventEntity,
} from './types.gen.js';

export {
  validateProject, validateHarness, validateTeam, validateTeamRole,
  validateTask, validateSession, validateApproval, validateEvent,
} from './validators.gen.mjs';

export type EntityName = 'project' | 'harness' | 'team' | 'teamRole'
  | 'task' | 'session' | 'approval' | 'event';

/** Schemas crudos (JSON importado), para SPEC-076/082 y tooling externo. */
export const SCHEMAS: Readonly<Record<EntityName, object>> = GENERATED_SCHEMAS;

/** Enum de Task.status extraído del schema — única fuente, sin duplicar. */
export const TASK_STATUSES: readonly TaskStatus[] =
  GENERATED_SCHEMAS.task.properties.status.enum;

export class SchemaValidationError extends Error {
  readonly entity: EntityName;
  readonly errors: ReadonlyArray<{ instancePath: string; message: string }>;

  constructor(entity: EntityName, errors: ReadonlyArray<{ instancePath: string; message: string }>) {
    const detail = errors.map((e) => `${e.instancePath || '/'}: ${e.message}`).join('; ');
    super(`Invalid ${entity}: ${detail}`);
    this.name = 'SchemaValidationError';
    this.entity = entity;
    this.errors = errors;
  }
}

function parseWith<T>(entity: EntityName, validate: ValidateFn, data: unknown): T {
  if (validate(data)) return data as T;
  const errors = (validate.errors ?? []).map((e) => ({
    instancePath: e.instancePath,
    message: e.message ?? 'invalid',
  }));
  throw new SchemaValidationError(entity, errors);
}

/** parse<X>(data): valida y retorna tipado, o lanza SchemaValidationError. */
export function parseProject(data: unknown): Project {
  return parseWith<Project>('project', validateProject, data);
}
export function parseHarness(data: unknown): Harness {
  return parseWith<Harness>('harness', validateHarness, data);
}
export function parseTeam(data: unknown): Team {
  return parseWith<Team>('team', validateTeam, data);
}
export function parseTeamRole(data: unknown): TeamRole {
  return parseWith<TeamRole>('teamRole', validateTeamRole, data);
}
export function parseTask(data: unknown): Task {
  return parseWith<Task>('task', validateTask, data);
}
export function parseSession(data: unknown): Session {
  return parseWith<Session>('session', validateSession, data);
}
export function parseApproval(data: unknown): Approval {
  return parseWith<Approval>('approval', validateApproval, data);
}
export function parseEvent(data: unknown): Event {
  return parseWith<Event>('event', validateEvent, data);
}
