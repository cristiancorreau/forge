/**
 * FsManifest — ManifestPort sobre filesystem (SPEC-077 § 3).
 *
 * `load` parsea `<path>/project.yaml` con js-yaml (dependencia propia de este
 * paquete). PROHIBIDO importar desde packages/cli: la dirección de dependencia
 * del monorepo es cli → daemon, nunca al revés. El parser YAML duplicado es
 * deliberado (riesgo documentado en SPEC-077): ambos consumen el mismo
 * project.yaml y el contrato lo fija core/schemas/project.schema.json.
 *
 * `scan` recorre en anchura (BFS) hasta maxDepth (default 3 lo aplica el caso
 * de uso) e ignora node_modules, .git, vendor, dist, build.
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import type { ManifestPort, ManifestResult, ProjectMetadata } from '@cristiancorreau/forge-daemon-core';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'vendor', 'dist', 'build']);

interface RawProjectYaml {
  project?: { name?: unknown; language?: unknown; mode?: unknown };
  runtimes?: { active?: unknown };
  stack?: { backend?: unknown; frontend?: unknown; mobile?: unknown };
  paths?: { specs?: unknown };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

const strArray = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return out.length > 0 ? out : undefined;
};

export class FsManifest implements ManifestPort {
  async load(path: string): Promise<ManifestResult> {
    const file = join(path, 'project.yaml');
    if (!existsSync(file)) return { status: 'missing' };

    let doc: unknown;
    try {
      doc = parseYaml(readFileSync(file, 'utf-8'));
    } catch (e: unknown) {
      return { status: 'invalid', error: e instanceof Error ? e.message : String(e) };
    }
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
      return { status: 'invalid', error: 'project.yaml is empty or not a mapping' };
    }

    const raw = doc as RawProjectYaml;
    const name = str(raw.project?.name);
    if (!name) return { status: 'invalid', error: 'missing required field project.name' };

    const frameworks = strArray(
      [raw.stack?.backend, raw.stack?.frontend, raw.stack?.mobile].filter((v) => typeof v === 'string'),
    );
    const metadata: ProjectMetadata = {
      ...(str(raw.project?.language) !== undefined ? { language: str(raw.project?.language) } : {}),
      ...(strArray(raw.runtimes?.active) !== undefined ? { runtimes: strArray(raw.runtimes?.active) } : {}),
      ...(frameworks !== undefined ? { frameworks } : {}),
      ...(str(raw.paths?.specs) !== undefined ? { specsDir: str(raw.paths?.specs) } : {}),
    };

    const profile = str(raw.project?.mode);
    return {
      status: 'ok',
      manifest: { name, ...(profile !== undefined ? { profile } : {}), metadata },
    };
  }

  async scan(roots: string[], maxDepth: number): Promise<string[]> {
    const found = new Set<string>();
    for (const root of roots) {
      let start: string;
      try {
        start = realpathSync(resolve(root));
      } catch {
        continue; // root inexistente: se ignora
      }
      // BFS por niveles: root = profundidad 0.
      let level = [start];
      for (let depth = 0; depth <= maxDepth && level.length > 0; depth++) {
        const next: string[] = [];
        for (const dir of level) {
          if (existsSync(join(dir, 'project.yaml'))) found.add(dir);
          if (depth === maxDepth) continue;
          let entries;
          try {
            entries = readdirSync(dir, { withFileTypes: true });
          } catch {
            continue; // sin permisos o desaparecido en pleno scan
          }
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (IGNORED_DIRS.has(entry.name)) continue;
            next.push(join(dir, entry.name));
          }
        }
        level = next;
      }
    }
    return [...found].sort();
  }
}
