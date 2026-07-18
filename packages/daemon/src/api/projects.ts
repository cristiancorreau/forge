/**
 * Rutas /api/v1/projects (SPEC-077 § 5, contrato de error y prefijo de
 * SPEC-082). Handlers finos: validan entrada, llaman a un caso de uso y
 * serializan. Prohibido importar sqlite/git/fs aquí (misma regla de lint que
 * protege a daemon-core en SPEC-082): la normalización de rutas se inyecta.
 */
import type { ProjectsDeps } from '@cristiancorreau/forge-daemon-core';
import { addProject, listProjects, removeProject, ProjectError } from '@cristiancorreau/forge-daemon-core';

export interface RouteResult {
  status: number;
  body?: unknown;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export const apiError = (code: string, message: string): ApiErrorBody => ({ error: { code, message } });

const PROJECTS = '/api/v1/projects';

/**
 * Devuelve un handler que resuelve rutas de projects, o null si la ruta no
 * es de este módulo. Nunca lanza errores de dominio: los mapea al contrato
 * { error: { code, message } } sin stack (SPEC-082 § 6).
 */
export function createProjectsRoutes(
  deps: ProjectsDeps,
  normalizePath: (path: string) => string,
) {
  return async function handle(method: string, pathname: string, body: unknown): Promise<RouteResult | null> {
    if (pathname === PROJECTS || pathname === `${PROJECTS}/`) {
      if (method === 'GET') {
        return { status: 200, body: { projects: await listProjects(deps) } };
      }
      if (method === 'POST') {
        const rawPath = (body as { path?: unknown } | null | undefined)?.path;
        if (typeof rawPath !== 'string' || rawPath.length === 0) {
          return { status: 422, body: apiError('validation_failed', 'body must be { path: string }') };
        }
        try {
          const project = await addProject(deps, { path: normalizePath(rawPath) });
          return { status: 201, body: project };
        } catch (e: unknown) {
          if (e instanceof ProjectError) {
            return { status: 422, body: apiError('unprocessable', e.message) };
          }
          throw e;
        }
      }
      return { status: 405, body: apiError('validation_failed', `method ${method} not allowed`) };
    }

    const match = pathname.match(/^\/api\/v1\/projects\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (method === 'GET') {
        const project = await deps.registry.projects.byId(id);
        return project
          ? { status: 200, body: project }
          : { status: 404, body: apiError('not_found', `project not found: ${id}`) };
      }
      if (method === 'DELETE') {
        const removed = await removeProject(deps, { ref: id });
        return removed
          ? { status: 204 }
          : { status: 404, body: apiError('not_found', `project not found: ${id}`) };
      }
      return { status: 405, body: apiError('validation_failed', `method ${method} not allowed`) };
    }

    return null;
  };
}
