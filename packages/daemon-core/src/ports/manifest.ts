/**
 * ManifestPort — lectura y descubrimiento de project.yaml (SPEC-077 § 2).
 * La implementación filesystem (js-yaml + BFS) vive en packages/daemon
 * (fs-manifest.ts); aquí solo el contrato puro.
 */
import type { ProjectMetadata } from '../types.js';

/** Subconjunto del project.yaml que el registro cachea en Project.metadata. */
export interface ProjectManifest {
  name: string;
  profile?: string;
  metadata: ProjectMetadata;
}

export type ManifestResult =
  | { status: 'ok'; manifest: ProjectManifest }
  | { status: 'missing' }
  | { status: 'invalid'; error: string };

export interface ManifestPort {
  /** Lee y parsea `<path>/project.yaml`. Nunca lanza: el estado viaja en el resultado. */
  load(path: string): Promise<ManifestResult>;
  /** Rutas (directorios) que contienen un project.yaml, BFS hasta maxDepth. */
  scan(roots: string[], maxDepth: number): Promise<string[]>;
}
