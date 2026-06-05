import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A directory is a forge root if it contains core/agents (the defining asset).
function isForgeRoot(dir: string): boolean {
  return existsSync(join(dir, 'core', 'agents'));
}

/**
 * Resolves the forge root directory in priority order:
 * 1. FORGE_HOME env var
 * 2. assets/ next to the compiled CLI (npm package mode)
 * 3. Walk up from __dirname (dev mode)
 * 4. forge/ in cwd (consumer project with a vendored forge root)
 */
export function resolveForgeRoot(): string {
  if (process.env.FORGE_HOME) {
    const p = process.env.FORGE_HOME;
    if (isForgeRoot(p)) return p;
    throw new Error(`FORGE_HOME="${p}" is not a forge root (missing core/agents)`);
  }

  // npm package mode: __dirname is dist/lib/, assets/ is at package root (two levels up)
  const assetsPath = join(__dirname, '..', '..', 'assets');
  if (isForgeRoot(assetsPath)) return assetsPath;

  // dev mode: walk up from __dirname to find the repo root
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (isForgeRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // consumer project: look for a vendored forge under forge/
  const vendored = join(process.cwd(), 'forge');
  if (isForgeRoot(vendored)) return vendored;

  throw new Error(
    'forge root not found. Set FORGE_HOME or install via: npx @cristiancorreau/forge'
  );
}
