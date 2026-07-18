/**
 * Manifest watcher (SPEC-077 § 3): fs.watch sobre el directorio contenedor de
 * cada project.yaml registrado (no sobre el archivo: editores que escriben con
 * tmp+rename rompen watchers de archivo), debounce 300 ms, y en cada cambio
 * invoca refreshProject (idempotente: un evento de más no corrompe estado).
 *
 * Detecta alta/baja de proyectos suscribiéndose a project.added /
 * project.removed en el EventBus.
 */
import { watch, type FSWatcher } from 'node:fs';
import type { ProjectsDeps } from '@cristiancorreau/forge-daemon-core';
import { listProjects, refreshProject } from '@cristiancorreau/forge-daemon-core';

const DEBOUNCE_MS = 300;

export interface ManifestWatcherHandle {
  /** Ids de proyectos actualmente observados (para tests/diagnóstico). */
  watchedIds(): string[];
  close(): void;
}

export async function startManifestWatcher(
  deps: ProjectsDeps,
  opts: { debounceMs?: number } = {},
): Promise<ManifestWatcherHandle> {
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
  const watchers = new Map<string, FSWatcher>();
  const timers = new Map<string, NodeJS.Timeout>();
  let closed = false;

  const scheduleRefresh = (projectId: string): void => {
    if (closed) return;
    const pending = timers.get(projectId);
    if (pending) clearTimeout(pending);
    timers.set(projectId, setTimeout(() => {
      timers.delete(projectId);
      // refresh idempotente; errores no deben tumbar el watcher
      void refreshProject(deps, { id: projectId }).catch(() => {});
    }, debounceMs));
  };

  const watchProject = (projectId: string, projectPath: string): void => {
    if (closed || watchers.has(projectId)) return;
    try {
      const watcher = watch(projectPath, (_eventType, filename) => {
        // filename puede ser null en algunas plataformas: refrescar igual
        if (filename === null || filename === 'project.yaml') scheduleRefresh(projectId);
      });
      watcher.on('error', () => {
        // directorio borrado/renombrado: el próximo refresh lo marcará missing
        watcher.close();
        watchers.delete(projectId);
        scheduleRefresh(projectId);
      });
      watchers.set(projectId, watcher);
    } catch {
      // path inexistente al arrancar: queda sin watcher; status missing via refresh
      scheduleRefresh(projectId);
    }
  };

  const unwatchProject = (projectId: string): void => {
    watchers.get(projectId)?.close();
    watchers.delete(projectId);
    const pending = timers.get(projectId);
    if (pending) clearTimeout(pending);
    timers.delete(projectId);
  };

  for (const project of await listProjects(deps)) {
    watchProject(project.id, project.path);
  }

  const unsubscribe = deps.bus.subscribe(['project.added', 'project.removed'], (e) => {
    if (e.kind === 'project.removed') {
      unwatchProject(e.entityId);
      return;
    }
    const path = (e.payload as { path?: string } | undefined)?.path;
    if (typeof path === 'string') watchProject(e.entityId, path);
  });

  return {
    watchedIds: () => [...watchers.keys()],
    close: () => {
      closed = true;
      unsubscribe();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
