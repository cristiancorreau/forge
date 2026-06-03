import { existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { resolveForgeRoot } from '../lib/paths.js';
import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';
import { bold, dim, green, red, yellow, cyan, icons, gray } from '../ui/colors.js';
import { box } from '../ui/box.js';
import { RUNTIMES } from '../lib/catalog.js';
import type { ProjectYaml } from '../lib/yaml.js';

interface RuntimeProbe {
  installed: boolean;
  version?: string;
}

/**
 * Probe a runtime by running its `cmd` (e.g. `claude --version`) with a short
 * timeout. Returns whether the binary is installed and the captured version.
 */
function probeRuntime(cmd: string[]): RuntimeProbe {
  const [bin, ...rest] = cmd;
  if (!bin) return { installed: false };
  try {
    const res = spawnSync(bin, rest, {
      timeout: 2000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (res.error || res.status === null || res.status !== 0) {
      // status null => killed by timeout or signal; non-zero => failed
      if (res.error || res.status === null) return { installed: false };
    }
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
    const firstLine = out.split('\n')[0]?.trim();
    return { installed: true, version: firstLine || undefined };
  } catch {
    return { installed: false };
  }
}

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
  let config: ProjectYaml | null = null;
  if (projectYaml) {
    const line = `${icons.ok} project.yaml: ${projectYaml}`;
    console.log('  ' + line);
    lines.push(line);
    try {
      config = loadProjectYaml(projectYaml);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const parseLine = `${icons.error} project.yaml: error al parsear — ${msg}`;
      console.log('  ' + parseLine);
      lines.push(parseLine);
      ok = false;
    }
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

  // ── Runtimes instalados (detección en vivo) ──────────────────────────────
  console.log('\n' + bold('Runtimes instalados'));
  const active = config?.runtimes?.active ?? [];
  const activeSet = new Set(active);
  for (const rt of RUNTIMES) {
    const isActive = activeSet.has(rt.id);
    const activeTag = isActive ? ' ' + cyan('● active') : '';
    const probe = probeRuntime(rt.cmd);
    if (probe.installed) {
      const ver = probe.version ? ' ' + gray(`(${probe.version})`) : '';
      const line = `${icons.ok} ${rt.label}${ver}${activeTag}`;
      console.log('  ' + line);
      lines.push(`${icons.ok} ${rt.label} instalado`);
    } else {
      const line = `${yellow('○')} ${rt.label}${dim(' — ausente')} ${dim('install: ' + rt.install)}${activeTag}`;
      console.log('  ' + line);
      lines.push(`${yellow('○')} ${rt.label} ausente`);
      // Un runtime marcado como activo pero no instalado es un fallo.
      if (isActive) {
        const warn = `${icons.error} ${rt.label} está marcado como activo pero no está instalado`;
        console.log('  ' + warn);
        lines.push(warn);
        ok = false;
      }
    }
  }

  // ── Completitud del project.yaml v2 ──────────────────────────────────────
  if (config) {
    console.log('\n' + bold('project.yaml (v2)'));

    // Campos requeridos
    if (config.project?.mode) {
      const line = `${icons.ok} project.mode: ${config.project.mode}`;
      console.log('  ' + line);
      lines.push(line);
    } else {
      const line = `${icons.error} project.mode: ausente (requerido)`;
      console.log('  ' + line);
      lines.push(line);
      ok = false;
    }

    if (active.length > 0) {
      const line = `${icons.ok} runtimes.active: ${active.join(', ')}`;
      console.log('  ' + line);
      lines.push(line);
    } else {
      const line = `${icons.error} runtimes.active: ausente (requerido en v2)`;
      console.log('  ' + line);
      lines.push(line);
      ok = false;
    }

    // Secciones recomendadas
    const recommended: Array<[keyof ProjectYaml, string]> = [
      ['deploy', 'deploy.provider + smoke_tests'],
      ['rules', 'guardrails del proyecto'],
    ];
    for (const [key, hint] of recommended) {
      if (config[key]) {
        const line = `${icons.ok} sección '${String(key)}' presente`;
        console.log('  ' + line);
        lines.push(line);
      } else {
        const line = `${icons.warn} sección '${String(key)}' ausente — recomendada (${hint})`;
        console.log('  ' + line);
        lines.push(line);
      }
    }
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
