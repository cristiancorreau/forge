/**
 * Casos de uso del registro multi-proyecto (SPEC-077 § 2).
 *
 * `addProject` COMPONE `registerProject` (SPEC-076), no lo redefine:
 * byPath → refreshProject si ya existe (idempotencia a nivel comando),
 * registerProject si no. El contrato de `DuplicateProjectPathError` de
 * `registerProject` queda intacto como primitiva.
 *
 * Eventos (igual que SPEC-076): cada caso de uso persiste via
 * `registry.events.append` Y publica via `bus.publish`.
 */
import type { RegistryPort } from '../ports/registry.js';
import type { ManifestPort, ProjectManifest } from '../ports/manifest.js';
import type { VcsPort } from '../ports/vcs.js';
import type { ClockPort } from '../ports/clock.js';
import type { IdPort } from '../ports/id.js';
import type { EventBus } from '../ports/event-bus.js';
import type { Project, DomainEvent } from '../types.js';
import { ProjectError } from '../domain/errors.js';
import { registerProject } from './register-project.js';

export interface ProjectsDeps {
  registry: RegistryPort;
  manifests: ManifestPort;
  vcs: VcsPort;
  clock: ClockPort;
  ids: IdPort;
  bus: EventBus;
}

export interface ScanCandidate {
  path: string;
  name: string | null;
  alreadyRegistered: boolean;
}

const DEFAULT_SCAN_DEPTH = 3;

async function emit(
  deps: Pick<ProjectsDeps, 'registry' | 'bus' | 'clock'>,
  kind: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const event: DomainEvent = {
    ts: deps.clock.nowIso(),
    kind,
    entity: 'project',
    entityId,
    payload,
  };
  await deps.registry.events.append(event);
  deps.bus.publish(event);
}

/**
 * Registra el proyecto en `input.path` (idempotente por composición):
 * - si ya existe (byPath) → delega en refreshProject (conserva id/createdAt);
 * - si no existe → valida el manifest (ProjectError si missing/invalid),
 *   llama a registerProject y completa metadata/status/lastSeenAt.
 */
export async function addProject(
  deps: ProjectsDeps,
  input: { path: string },
): Promise<Project> {
  const existing = await deps.registry.projects.byPath(input.path);
  if (existing) {
    const refreshed = await refreshProject(deps, { id: existing.id });
    // byPath acaba de devolverlo: refreshProject no puede retornar null.
    return refreshed ?? existing;
  }

  const result = await deps.manifests.load(input.path);
  if (result.status === 'missing') throw new ProjectError('manifest-missing', input.path);
  if (result.status === 'invalid') throw new ProjectError('manifest-invalid', result.error);

  const manifest: ProjectManifest = result.manifest;
  const vcsRemote = await deps.vcs.remoteUrl(input.path);

  const registered = await registerProject(deps, {
    path: input.path,
    name: manifest.name,
    profile: manifest.profile ?? '',
    ...(vcsRemote !== null ? { vcsRemote } : {}),
  });

  const project: Project = {
    ...registered,
    status: 'active',
    metadata: manifest.metadata,
    lastSeenAt: deps.clock.nowIso(),
  };
  await deps.registry.projects.update(project);

  await emit(deps, 'project.added', project.id, { name: project.name, path: project.path });
  return project;
}

/** Elimina por id o por path. Retorna false si la referencia no existe. */
export async function removeProject(
  deps: ProjectsDeps,
  input: { ref: string },
): Promise<boolean> {
  const project =
    (await deps.registry.projects.byId(input.ref))
    ?? (await deps.registry.projects.byPath(input.ref));
  if (!project) return false;

  await deps.registry.projects.remove(project.id);
  await emit(deps, 'project.removed', project.id, { name: project.name, path: project.path });
  return true;
}

export async function listProjects(deps: ProjectsDeps): Promise<Project[]> {
  return deps.registry.projects.list();
}

/**
 * Descubre candidatos con project.yaml bajo `roots` (BFS hasta maxDepth,
 * default 3). Solo lectura: no registra ni emite eventos.
 */
export async function scanForProjects(
  deps: ProjectsDeps,
  input: { roots: string[]; maxDepth?: number },
): Promise<ScanCandidate[]> {
  const paths = await deps.manifests.scan(input.roots, input.maxDepth ?? DEFAULT_SCAN_DEPTH);
  const candidates: ScanCandidate[] = [];
  for (const path of paths) {
    const result = await deps.manifests.load(path);
    candidates.push({
      path,
      name: result.status === 'ok' ? result.manifest.name : null,
      alreadyRegistered: (await deps.registry.projects.byPath(path)) !== null,
    });
  }
  return candidates;
}

/**
 * Recalcula metadata, status y lastSeenAt releyendo el manifest:
 * ok → active (actualiza name/profile/metadata); missing/invalid → degrada
 * el status conservando la última metadata conocida. Null si el id no existe.
 */
export async function refreshProject(
  deps: ProjectsDeps,
  input: { id: string },
): Promise<Project | null> {
  const project = await deps.registry.projects.byId(input.id);
  if (!project) return null;

  const result = await deps.manifests.load(project.path);
  const now = deps.clock.nowIso();

  let updated: Project;
  if (result.status === 'ok') {
    updated = {
      ...project,
      name: result.manifest.name,
      ...(result.manifest.profile !== undefined ? { profile: result.manifest.profile } : {}),
      metadata: result.manifest.metadata,
      status: 'active',
      lastSeenAt: now,
    };
  } else {
    updated = {
      ...project,
      status: result.status,
      lastSeenAt: now,
    };
  }

  await deps.registry.projects.update(updated);
  await emit(deps, 'project.updated', updated.id, {
    name: updated.name,
    path: updated.path,
    status: updated.status ?? 'active',
  });
  return updated;
}
