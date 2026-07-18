/**
 * Composición default de ProjectsDeps sobre $FORGE_HOME (SPEC-077).
 * La usan `forged serve` y el CLI (`forge projects …`, local-first: opera la
 * DB directamente sin daemon corriendo — WAL + busy_timeout resuelven la
 * convivencia).
 */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProjectsDeps } from '@cristiancorreau/forge-daemon-core';
import { SqliteRegistry } from './infra/sqlite-registry.js';
import { FsManifest } from './infra/fs-manifest.js';
import { GitVcs } from './infra/git-vcs.js';
import { SystemClock, ForgeIds, LocalEventBus } from './infra/support.js';

export interface ProjectsDepsHandle {
  deps: ProjectsDeps;
  close(): void;
}

export function createProjectsDeps(dbPath?: string): ProjectsDepsHandle {
  const registry = new SqliteRegistry(dbPath);
  const deps: ProjectsDeps = {
    registry,
    manifests: new FsManifest(),
    vcs: new GitVcs(),
    clock: new SystemClock(),
    ids: new ForgeIds('prj'),
    bus: new LocalEventBus(),
  };
  return { deps, close: () => registry.close() };
}

/**
 * Normaliza la ruta de un proyecto: absoluta, symlinks resueltos (realpath) y
 * sin slash final (regla de unicidad de SPEC-077 § 1). Si la ruta no existe,
 * cae a resolve() — el manifest saldrá missing aguas arriba.
 */
export function normalizeProjectPath(input: string): string {
  const absolute = resolve(input);
  let normalized: string;
  try {
    normalized = realpathSync(absolute);
  } catch {
    normalized = absolute;
  }
  return normalized !== '/' ? normalized.replace(/\/+$/, '') : normalized;
}
