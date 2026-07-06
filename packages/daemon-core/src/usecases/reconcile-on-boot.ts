/**
 * reconcileOnBoot (SPEC-076 § 5, SPEC-074 § Gestor de sesiones tmux):
 *   a) toda sesión tmux con prefijo 'forge:' sin fila 'running' → kill
 *      (evento 'session.reaped');
 *   b) toda fila 'running' sin tmux vivo → status 'orphaned', endedAt=nowIso,
 *      y su task → 'orphaned' si no le quedan sesiones activas
 *      (evento 'session.orphaned').
 */
import type { RegistryPort } from '../ports/registry.js';
import type { SessionPort } from '../ports/session.js';
import type { ClockPort } from '../ports/clock.js';
import type { EventBus } from '../ports/event-bus.js';
import type { Session, Task, DomainEvent } from '../types.js';
import { canTransition } from '../domain/task-status.js';

export async function reconcileOnBoot(
  deps: { registry: RegistryPort; sessions: SessionPort; clock: ClockPort; bus: EventBus },
): Promise<{ killedTmux: string[]; orphanedSessions: string[] }> {
  const now = deps.clock.nowIso();
  const live = await deps.sessions.listLive('forge:');
  const running = await deps.registry.sessions.active();
  const runningNames = new Set(
    running.map((s) => s.tmuxSession).filter((n): n is string => typeof n === 'string'),
  );

  const emit = async (kind: string, entityId: string, payload?: Record<string, unknown>) => {
    const event: DomainEvent = { ts: now, kind, entity: 'session', entityId, ...(payload ? { payload } : {}) };
    await deps.registry.events.append(event);
    deps.bus.publish(event);
  };

  // a) tmux vivas sin fila 'running' → kill
  const killedTmux: string[] = [];
  for (const name of live) {
    if (!runningNames.has(name)) {
      await deps.sessions.kill(name);
      killedTmux.push(name);
      await emit('session.reaped', name, { tmuxSession: name });
    }
  }

  // b) filas 'running' sin tmux vivo → orphaned
  const liveSet = new Set(live);
  const orphanedSessions: string[] = [];
  for (const row of running) {
    if (row.tmuxSession && liveSet.has(row.tmuxSession)) continue;

    const orphaned: Session = { ...row, status: 'orphaned', endedAt: now };
    await deps.registry.sessions.update(orphaned);
    orphanedSessions.push(row.id);
    await emit('session.orphaned', row.id, { taskId: row.taskId });

    const siblings = await deps.registry.sessions.byTask(row.taskId);
    const stillActive = siblings.some((s) => s.status === 'running');
    if (!stillActive) {
      const task = await deps.registry.tasks.byId(row.taskId);
      if (task && task.status !== 'orphaned' && canTransition(task.status, 'orphaned')) {
        const orphanedTask: Task = { ...task, status: 'orphaned', updatedAt: now };
        await deps.registry.tasks.update(orphanedTask);
      }
    }
  }

  return { killedTmux, orphanedSessions };
}
