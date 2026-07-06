/** Errores tipados del dominio (SPEC-076 § 4). */

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class DuplicateProjectPathError extends DomainError {
  constructor(path: string) {
    super('DUPLICATE_PROJECT_PATH', `A project is already registered at path: ${path}`);
  }
}

export class ProjectNotFoundError extends DomainError {
  constructor(projectId: string) {
    super('PROJECT_NOT_FOUND', `Project not found: ${projectId}`);
  }
}

export class TaskNotFoundError extends DomainError {
  constructor(taskId: string) {
    super('TASK_NOT_FOUND', `Task not found: ${taskId}`);
  }
}

export class HarnessNotFoundError extends DomainError {
  constructor(harnessId: string) {
    super('HARNESS_NOT_FOUND', `Harness not found: ${harnessId}`);
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super('INVALID_TRANSITION', `Invalid task status transition: ${from} -> ${to}`);
  }
}
