import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';
import { generateClaudeMd } from '../lib/generators/claude-code.js';
import { generateAgentsMd } from '../lib/generators/opencode.js';
import { generateCodexAgentsMd } from '../lib/generators/codex.js';
import {
  generateKiroProduct, generateKiroStructure,
  generateKiroAgents, generateKiroCommands, generateKiroBranchGuardHook
} from '../lib/generators/kiro.js';
import { bold, dim, green, red, yellow, cyan, gray } from '../ui/colors.js';
import { createSpinner } from '../ui/spinner.js';

const HELP = `Usage: forge generate [options]

Generate runtime configuration files from project.yaml.
Auto-detects active runtimes by filesystem markers.

Options:
  --runtime <name>   Generate for: claude-code, opencode, codex, kiro, all
  --dry-run          Show what would be generated without writing files
  --force            Overwrite existing files without prompting
  -h, --help         Show this help

Examples:
  forge generate                       # auto-detect runtimes
  forge generate --runtime claude-code
  forge generate --runtime all --dry-run
`;

type Runtime = 'claude-code' | 'opencode' | 'codex' | 'kiro';

function detectRuntimes(root: string, config: ReturnType<typeof loadProjectYaml>): Runtime[] {
  const declared = config.runtimes?.active;
  if (declared && declared.length > 0) return declared as Runtime[];

  const active: Runtime[] = [];
  if (existsSync(join(root, '.claude'))) active.push('claude-code');
  if (existsSync(join(root, '.opencode'))) active.push('opencode');
  if (existsSync(join(root, '.kiro'))) active.push('kiro');
  const hasAgentsMd = existsSync(join(root, 'AGENTS.md'));
  const hasClaudeOrOpencode = active.includes('claude-code') || active.includes('opencode');
  if (hasAgentsMd && !hasClaudeOrOpencode) active.push('codex');
  return active;
}

function writeFile(path: string, content: string, dryRun: boolean, force: boolean): string {
  if (dryRun) return 'DRY-RUN';
  if (existsSync(path) && !force) return 'SKIP (usa --force para sobreescribir)';
  writeFileSync(path, content, 'utf-8');
  return 'OK';
}

export async function generate(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const runtimeIdx = args.indexOf('--runtime');
  const runtimeArg = runtimeIdx !== -1 ? args[runtimeIdx + 1] : null;

  const yamlPath = findProjectYaml(process.cwd());
  if (!yamlPath) {
    console.error('ERROR: No se encontró project.yaml\n  forge init para inicializar el proyecto');
    return 1;
  }

  let config: ReturnType<typeof loadProjectYaml>;
  try {
    config = loadProjectYaml(yamlPath);
  } catch (e: unknown) {
    console.error(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const root = join(yamlPath, '..');
  const projectName = config.project.name ?? 'Proyecto';

  console.log(cyan(bold('forge generate')) + dim(' — ' + projectName) + '\n');
  if (dryRun) console.log(dim('  Modo: DRY-RUN (no escribe archivos)') + '\n');

  let runtimesToRun: Runtime[];
  if (runtimeArg === 'all') {
    runtimesToRun = ['claude-code', 'opencode', 'codex', 'kiro'];
  } else if (runtimeArg) {
    runtimesToRun = [runtimeArg as Runtime];
  } else {
    runtimesToRun = detectRuntimes(root, config);
    if (runtimesToRun.length === 0) {
      console.log('  No se detectaron runtimes activos.');
      console.log('  Usar forge init --runtime <nombre> o agregar runtimes.active en project.yaml');
      return 0;
    }
  }

  // Build spinner items: one entry per runtime (kiro gets a summary entry)
  const spinnerItems = runtimesToRun.map(rt => ({
    runtime: rt,
    file: rt === 'kiro' ? '.kiro/steering/' : rt === 'claude-code' ? 'CLAUDE.md' : 'AGENTS.md',
  }));
  const spinner = createSpinner(spinnerItems);
  spinner.start();

  const results: Array<{ runtime: string; file: string; status: string }> = [];

  for (const runtime of runtimesToRun) {
    spinner.update(runtime, 'running');
    try {
      if (runtime === 'claude-code') {
        mkdirSync(join(root, '.claude'), { recursive: true });
        const claudeMdPath = join(root, 'CLAUDE.md');
        const status = writeFile(claudeMdPath, generateClaudeMd(config), dryRun, force);
        results.push({ runtime, file: 'CLAUDE.md', status });
        spinner.update(runtime, status.startsWith('SKIP') ? 'skip' : 'done', 'CLAUDE.md');

      } else if (runtime === 'opencode') {
        mkdirSync(join(root, '.opencode'), { recursive: true });
        const status = writeFile(join(root, 'AGENTS.md'), generateAgentsMd(config), dryRun, force);
        results.push({ runtime, file: 'AGENTS.md', status });
        spinner.update(runtime, status.startsWith('SKIP') ? 'skip' : 'done', 'AGENTS.md');

      } else if (runtime === 'codex') {
        const status = writeFile(join(root, 'AGENTS.md'), generateCodexAgentsMd(config), dryRun, force);
        results.push({ runtime, file: 'AGENTS.md', status });
        spinner.update(runtime, status.startsWith('SKIP') ? 'skip' : 'done', 'AGENTS.md');

      } else if (runtime === 'kiro') {
        const kiroDir = join(root, '.kiro', 'steering');
        const kiroHooks = join(root, '.kiro', 'hooks');
        mkdirSync(kiroDir, { recursive: true });
        mkdirSync(kiroHooks, { recursive: true });

        const files: Array<[string, string]> = [
          [join(kiroDir, 'product.md'), generateKiroProduct(config)],
          [join(kiroDir, 'structure.md'), generateKiroStructure(config)],
          [join(kiroDir, 'agents.md'), generateKiroAgents(config)],
          [join(kiroDir, 'commands.md'), generateKiroCommands(config.deploy?.provider ?? 'tu plataforma de deploy')],
          [join(kiroHooks, 'pre-edit-branch-guard.json'), generateKiroBranchGuardHook()],
        ];
        let kiroOk = 0;
        let kiroSkip = 0;
        for (const [path, content] of files) {
          const status = writeFile(path, content, dryRun, force);
          results.push({ runtime, file: path.replace(root + '/', ''), status });
          if (status.startsWith('SKIP')) kiroSkip++; else kiroOk++;
        }
        const kiroSummary = `.kiro/steering/ (${files.length} archivos)`;
        spinner.update(runtime, kiroSkip === files.length ? 'skip' : 'done', kiroSummary);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ runtime, file: '—', status: `ERROR: ${msg}` });
      spinner.update(runtime, 'error');
    }
  }

  spinner.stop();
  console.log('');

  // Print final results table with colors
  for (const r of results) {
    const rt = r.runtime.padEnd(12);
    let statusStr: string;
    if (r.status === 'OK' || r.status === 'DRY-RUN') {
      statusStr = green(r.status);
    } else if (r.status.startsWith('SKIP')) {
      statusStr = yellow(dim(r.status));
    } else {
      statusStr = red(r.status);
    }
    console.log(`  ${rt}  ${gray(r.file)}   ${statusStr}`);
  }
  console.log('');

  const hasErrors = results.some(r => r.status.startsWith('ERROR'));
  const hasSkips = results.some(r => r.status.startsWith('SKIP'));
  const okCount = results.filter(r => r.status === 'OK' || r.status === 'DRY-RUN').length;

  if (hasErrors) {
    console.log(red('  Algunos archivos fallaron. Ver detalles arriba.'));
  } else if (hasSkips && okCount === 0) {
    console.log(yellow('  Archivos existentes sin cambios. Usa --force para sobreescribir.'));
  } else {
    console.log(green(`  ${okCount} archivo(s) generado(s) correctamente.`));
  }
  console.log('');

  return hasErrors ? 1 : 0;
}
