/**
 * Máquina de estados de Task — pura (SPEC-076 § 4).
 * Enum idéntico al maestro SPEC-074: backlog | queued | running | needs_input
 * | review | done | failed | orphaned. `done` es terminal; `failed`/`orphaned`
 * solo pueden volver a `queued`.
 */
import type { TaskStatus } from '../types.js';

export type { TaskStatus };

const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  backlog: ['queued', 'running'],
  queued: ['running', 'backlog'],
  running: ['needs_input', 'review', 'done', 'failed', 'orphaned'],
  needs_input: ['running', 'failed'],
  review: ['running', 'done', 'failed'],
  done: [],
  failed: ['queued'],
  orphaned: ['queued'],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
