import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the forge root directory in priority order:
 * 1. FORGE_HOME env var
 * 2. assets/ next to the compiled CLI (npm package mode)
 * 3. Walk up from __dirname looking for forge.py (dev mode / legacy .agentic/)
 * 4. .agentic/ or forge/ in cwd (consumer project with submodule)
 */
export function resolveForgeRoot(): string {
  if (process.env.FORGE_HOME) {
    const p = process.env.FORGE_HOME;
    if (existsSync(join(p, 'forge.py'))) return p;
    throw new Error(`FORGE_HOME="${p}" does not contain forge.py`);
  }

  // npm package mode: assets/ is next to dist/
  const assetsPath = join(__dirname, '..', 'assets');
  if (existsSync(join(assetsPath, 'forge.py'))) return assetsPath;

  // dev mode: walk up from __dirname to find forge.py
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'forge.py'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // consumer project: look for .agentic/ or forge/ from cwd
  for (const candidate of ['.agentic', 'forge']) {
    const p = join(process.cwd(), candidate);
    if (existsSync(join(p, 'forge.py'))) return p;
  }

  throw new Error(
    'forge root not found. Set FORGE_HOME or install via: npx @cristiancorreau/forge'
  );
}

export function resolveScript(name: string): string {
  const root = resolveForgeRoot();
  const scriptPath = join(root, 'scripts', name);
  if (!existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }
  return scriptPath;
}
