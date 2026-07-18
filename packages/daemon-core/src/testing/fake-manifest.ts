/** FakeManifest — ManifestPort en memoria (SPEC-077). */
import type { ManifestPort, ManifestResult, ProjectManifest } from '../ports/manifest.js';

export class FakeManifest implements ManifestPort {
  /** path (directorio) → resultado a devolver por load(). Ausente = missing. */
  readonly results = new Map<string, ManifestResult>();
  /** Registro de llamadas, para asserts. */
  readonly loaded: string[] = [];
  readonly scanned: Array<{ roots: string[]; maxDepth: number }> = [];

  /** Azúcar: marca `path` como manifest válido. */
  setOk(path: string, manifest: ProjectManifest): void {
    this.results.set(path, { status: 'ok', manifest });
  }

  /** Azúcar: marca `path` como manifest inválido. */
  setInvalid(path: string, error: string): void {
    this.results.set(path, { status: 'invalid', error });
  }

  /** Azúcar: elimina el manifest (load volverá a 'missing'). */
  setMissing(path: string): void {
    this.results.delete(path);
  }

  async load(path: string): Promise<ManifestResult> {
    this.loaded.push(path);
    return this.results.get(path) ?? { status: 'missing' };
  }

  /** Paths conocidos bajo algún root, respetando maxDepth (segmentos relativos). */
  async scan(roots: string[], maxDepth: number): Promise<string[]> {
    this.scanned.push({ roots, maxDepth });
    const out: string[] = [];
    for (const path of this.results.keys()) {
      for (const root of roots) {
        if (path !== root && !path.startsWith(root.endsWith('/') ? root : `${root}/`)) continue;
        const rel = path === root ? '' : path.slice(root.length).replace(/^\//, '');
        const depth = rel === '' ? 0 : rel.split('/').length;
        if (depth <= maxDepth) {
          out.push(path);
          break;
        }
      }
    }
    return out.sort();
  }
}
