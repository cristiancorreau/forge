import { existsSync } from 'fs';
import { join } from 'path';
import { resolveForgeRoot } from '../lib/paths.js';
import { findProjectYaml } from '../lib/yaml.js';
import { bold, dim, green, red, yellow, cyan, icons, gray } from '../ui/colors.js';
import { box } from '../ui/box.js';

export async function doctor(_args: string[]): Promise<number> {
  let ok = true;
  const lines: string[] = [];

  console.log(cyan(bold('forge doctor')) + dim(' — environment check') + '\n');

  // Node.js version
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split('.').map(Number);
  if (major >= 18) {
    const line = `${icons.ok} Node.js ${nodeVersion}`;
    console.log('  ' + line);
    lines.push(line);
  } else {
    const line = `${icons.error} Node.js ${nodeVersion} — se requiere >= 18`;
    console.log('  ' + line);
    lines.push(line);
    ok = false;
  }

  // forge root
  try {
    const root = resolveForgeRoot();
    const rootLine = `${icons.ok} forge root encontrado`;
    console.log('  ' + rootLine);
    lines.push(rootLine);

    // Core assets
    const coreOk = existsSync(join(root, 'core', 'agents'))
      && existsSync(join(root, 'core', 'schemas'))
      && existsSync(join(root, 'scripts'));
    if (coreOk) {
      const assetsLine = `${icons.ok} forge assets: completos`;
      console.log('  ' + assetsLine);
      lines.push(assetsLine);
    } else {
      const assetsLine = `${icons.error} forge assets: incompletos — reinstalar con npx @cristiancorreau/forge`;
      console.log('  ' + assetsLine);
      lines.push(assetsLine);
      ok = false;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const line = `${icons.error} forge root: ${msg}`;
    console.log('  ' + line);
    lines.push(line);
    ok = false;
  }

  // project.yaml
  const projectYaml = findProjectYaml(process.cwd());
  if (projectYaml) {
    const line = `${icons.ok} project.yaml: ${projectYaml}`;
    console.log('  ' + line);
    lines.push(line);
  } else {
    const line = `${icons.skip} project.yaml: no encontrado (ejecutar forge init)`;
    console.log('  ' + line);
    lines.push(line);
  }

  // .claude / AGENTS.md / .kiro
  const cwd = process.cwd();
  const hasClaude = existsSync(join(cwd, '.claude'));
  const hasAgents = existsSync(join(cwd, 'AGENTS.md'));
  const hasKiro = existsSync(join(cwd, '.kiro'));

  if (hasClaude) {
    const line = `${icons.ok} runtime: Claude Code (.claude/)`;
    console.log('  ' + line);
    lines.push(line);
  }
  if (hasAgents && !hasClaude) {
    const line = `${icons.ok} runtime: OpenCode / Codex (AGENTS.md)`;
    console.log('  ' + line);
    lines.push(line);
  }
  if (hasKiro) {
    const line = `${icons.ok} runtime: Kiro (.kiro/)`;
    console.log('  ' + line);
    lines.push(line);
  }
  if (!hasClaude && !hasAgents && !hasKiro) {
    const line = `${icons.skip} runtime: no detectado (ejecutar forge init)`;
    console.log('  ' + line);
    lines.push(line);
  }

  console.log('');

  if (ok) {
    const summaryLine = green('All checks passed.');
    console.log(box('forge doctor', [...lines, '', summaryLine]));
  } else {
    const failed = lines.filter(l => l.includes('✗'));
    const summaryLine = red('Algunos checks fallaron. Ver detalles arriba.');
    console.log(box('forge doctor', [...lines, '', summaryLine]));
    void failed;
  }

  return ok ? 0 : 1;
}
