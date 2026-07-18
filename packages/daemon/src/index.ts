/**
 * @cristiancorreau/forge-daemon — adaptadores de infraestructura del plano de
 * control FORGE v4 (SPEC-077) + servidor `forged serve`.
 *
 * Dirección de dependencia del monorepo: cli → daemon → daemon-core → schemas.
 * PROHIBIDO importar desde packages/cli.
 */
export { SqliteRegistry } from './infra/sqlite-registry.js';
export { FsManifest } from './infra/fs-manifest.js';
export { GitVcs } from './infra/git-vcs.js';
export { SystemClock, ForgeIds, LocalEventBus } from './infra/support.js';
export { startManifestWatcher } from './infra/manifest-watcher.js';
export type { ManifestWatcherHandle } from './infra/manifest-watcher.js';
export { forgeHome, defaultDbPath, daemonJsonPath } from './infra/forge-home.js';
export { createProjectsDeps, normalizeProjectPath } from './deps.js';
export type { ProjectsDepsHandle } from './deps.js';
export { startServer, resolvePort, DEFAULT_PORT } from './api/server.js';
export type { ServerOptions, ServerHandle } from './api/server.js';
export { createProjectsRoutes, apiError } from './api/projects.js';
export type { RouteResult, ApiErrorBody } from './api/projects.js';

// Re-export del dominio (daemon-core) para consumidores con una sola
// dependencia (packages/cli hace import() dinámico solo de este paquete).
export {
  addProject, removeProject, listProjects, scanForProjects, refreshProject,
  registerProject, ProjectError, DomainError, DuplicateProjectPathError,
} from '@cristiancorreau/forge-daemon-core';
export type {
  Project, ProjectMetadata, ProjectsDeps, ScanCandidate, ProjectErrorCode,
  ManifestPort, ManifestResult, ProjectManifest, RegistryPort, VcsPort,
} from '@cristiancorreau/forge-daemon-core';
