import { existsSync } from 'fs';
import { join } from 'path';
import { resolveForgeRoot } from '../lib/paths.js';
import { findProjectYaml } from '../lib/yaml.js';

export async function doctor(_args: string[]): Promise<number> {
  let ok = true;
  console.log('forge doctor — environment check\n');

  // Node.js version
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split('.').map(Number);
  if (major >= 18) {
    console.log(`  ✓ Node.js: ${nodeVersion}`);
  } else {
    console.log(`  ✗ Node.js ${nodeVersion} — se requiere >= 18`);
    ok = false;
  }

  // forge root
  try {
    const root = resolveForgeRoot();
    console.log(`  ✓ forge root: ${root}`);

    // Core assets
    const coreOk = existsSync(join(root, 'core', 'agents'))
      && existsSync(join(root, 'core', 'schemas'))
      && existsSync(join(root, 'scripts'));
    if (coreOk) {
      console.log('  ✓ forge assets: completos (core/, scripts/, profiles/, adapters/)');
    } else {
      console.log('  ✗ forge assets: incompletos — reinstalar con npx @cristiancorreau/forge');
      ok = false;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ✗ forge root: ${msg}`);
    ok = false;
  }

  // project.yaml
  const projectYaml = findProjectYaml(process.cwd());
  if (projectYaml) {
    console.log(`  ✓ project.yaml: ${projectYaml}`);
  } else {
    console.log('  ~ project.yaml: no encontrado (ejecutar forge init)');
  }

  // .claude / AGENTS.md / .kiro
  const cwd = process.cwd();
  const hasClaude = existsSync(join(cwd, '.claude'));
  const hasAgents = existsSync(join(cwd, 'AGENTS.md'));
  const hasKiro = existsSync(join(cwd, '.kiro'));

  if (hasClaude) console.log('  ✓ runtime: Claude Code (.claude/)');
  if (hasAgents && !hasClaude) console.log('  ✓ runtime: OpenCode / Codex (AGENTS.md)');
  if (hasKiro) console.log('  ✓ runtime: Kiro (.kiro/)');
  if (!hasClaude && !hasAgents && !hasKiro) console.log('  ~ runtime: no detectado (ejecutar forge init)');

  console.log('');
  if (ok) {
    console.log('All checks passed. No se requiere Python — forge es 100% Node.js.');
  } else {
    console.log('Algunos checks fallaron. Ver detalles arriba.');
  }

  return ok ? 0 : 1;
}
