import { existsSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';
import { generateClaudeMd } from '../lib/generators/claude-code.js';
import { generateAgentsMd, generateSharedPreCommitHook, nestedAgentsSurfaces } from '../lib/generators/opencode.js';
import { generateCodexAgentsMd } from '../lib/generators/codex.js';
import {
  generateKiroProduct, generateKiroStructure,
  generateKiroAgents, generateKiroCommands, generateKiroBranchGuardHook,
  generateKiroBashCheckHook, generateKiroPostTurnHook
} from '../lib/generators/kiro.js';
import { getRuntime, runtimeIds, stateSurfaces } from '../lib/generators/registry.js';
import { bold, dim, green, red, yellow, cyan, gray } from '../ui/colors.js';
import { createSpinner } from '../ui/spinner.js';

const ALL_RUNTIME_IDS = runtimeIds();

const HELP = `Usage: forge generate [options]

Generate runtime configuration files from project.yaml.
Auto-detects active runtimes by filesystem markers.

Options:
  --runtime <name>   Generate for: ${ALL_RUNTIME_IDS.join(', ')}, all
  --dry-run          Show what would be generated without writing files
  --force            Overwrite existing files without prompting
  -h, --help         Show this help

Examples:
  forge generate                       # auto-detect runtimes
  forge generate --runtime claude-code
  forge generate --runtime all --dry-run
`;

/** Filesystem markers for auto-detecting native runtimes. */
const RUNTIME_MARKERS: Record<string, string> = {
  'claude-code': '.claude',
  'opencode': '.opencode',
  'kiro': '.kiro',
  'cursor': '.cursor',
  'windsurf': '.windsurf',
  'continue': '.continue',
  'roo': '.roo',
  'augment': '.augment',
  'zed': '.zed',
};

function detectRuntimes(root: string, config: ReturnType<typeof loadProjectYaml>): string[] {
  const declared = config.runtimes?.active;
  if (declared && declared.length > 0) return declared;

  const active: string[] = [];
  for (const [id, marker] of Object.entries(RUNTIME_MARKERS)) {
    if (existsSync(join(root, marker))) active.push(id);
  }
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

// Write an executable file (e.g. a git hook), chmod 0o755 so it can run.
function writeExecutable(path: string, content: string, dryRun: boolean, force: boolean): string {
  const status = writeFile(path, content, dryRun, force);
  if (status === 'OK') chmodSync(path, 0o755);
  return status;
}

// Generate the shared .githooks/pre-commit fallback used by runtimes without
// native blocking hooks (OpenCode, Codex). Returns the result row.
function writeSharedGitHook(
  root: string, runtime: string, dryRun: boolean, force: boolean,
): { runtime: string; file: string; status: string } {
  const githooksDir = join(root, '.githooks');
  if (!dryRun) mkdirSync(githooksDir, { recursive: true });
  const hookPath = join(githooksDir, 'pre-commit');
  const status = writeExecutable(hookPath, generateSharedPreCommitHook(), dryRun, force);
  return { runtime, file: '.githooks/pre-commit', status };
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

  let runtimesToRun: string[];
  if (runtimeArg === 'all') {
    runtimesToRun = ALL_RUNTIME_IDS;
  } else if (runtimeArg) {
    runtimesToRun = [runtimeArg];
  } else {
    runtimesToRun = detectRuntimes(root, config);
    if (runtimesToRun.length === 0) {
      console.log('  No se detectaron runtimes activos.');
      console.log('  Usar forge init --runtime <nombre> o agregar runtimes.active en project.yaml');
      return 0;
    }
  }

  // Build spinner items: one entry per runtime (kiro gets a summary entry)
  const spinnerItems = runtimesToRun.map(rt => {
    let file = 'AGENTS.md';
    if (rt === 'kiro') file = '.kiro/steering/';
    else if (rt === 'claude-code') file = 'CLAUDE.md';
    else {
      const desc = getRuntime(rt);
      if (desc) file = desc.surfaces({ project: { name: '', mode: 'standard' } })[0]?.path ?? file;
    }
    return { runtime: rt, file };
  });
  const spinner = createSpinner(spinnerItems);
  spinner.start();

  const results: Array<{ runtime: string; file: string; status: string }> = [];

  for (const runtime of runtimesToRun) {
    spinner.update(runtime, 'running');
    try {
      if (runtime === 'claude-code') {
        // claude-code: rich native installation (mkdir + CLAUDE.md)
        mkdirSync(join(root, '.claude'), { recursive: true });
        const claudeMdPath = join(root, 'CLAUDE.md');
        const status = writeFile(claudeMdPath, generateClaudeMd(config), dryRun, force);
        results.push({ runtime, file: 'CLAUDE.md', status });
        spinner.update(runtime, status.startsWith('SKIP') ? 'skip' : 'done', 'CLAUDE.md');

      } else if (runtime === 'opencode') {
        // opencode: AGENTS.md + shared git hook fallback
        mkdirSync(join(root, '.opencode'), { recursive: true });
        const status = writeFile(join(root, 'AGENTS.md'), generateAgentsMd(config), dryRun, force);
        results.push({ runtime, file: 'AGENTS.md', status });
        for (const s of nestedAgentsSurfaces(config)) {
          const absPath = join(root, s.path);
          if (!dryRun) mkdirSync(dirname(absPath), { recursive: true });
          results.push({ runtime, file: s.path, status: writeFile(absPath, s.content, dryRun, force) });
        }
        results.push(writeSharedGitHook(root, runtime, dryRun, force));
        spinner.update(runtime, status.startsWith('SKIP') ? 'skip' : 'done', 'AGENTS.md + .githooks/');

      } else if (runtime === 'codex') {
        // codex: AGENTS.md + shared git hook fallback
        const status = writeFile(join(root, 'AGENTS.md'), generateCodexAgentsMd(config), dryRun, force);
        results.push({ runtime, file: 'AGENTS.md', status });
        for (const s of nestedAgentsSurfaces(config)) {
          const absPath = join(root, s.path);
          if (!dryRun) mkdirSync(dirname(absPath), { recursive: true });
          results.push({ runtime, file: s.path, status: writeFile(absPath, s.content, dryRun, force) });
        }
        results.push(writeSharedGitHook(root, runtime, dryRun, force));
        spinner.update(runtime, status.startsWith('SKIP') ? 'skip' : 'done', 'AGENTS.md + .githooks/');

      } else if (runtime === 'kiro') {
        // kiro: rich multi-file installation under .kiro/
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
          [join(kiroHooks, 'pre-bash-check.json'), generateKiroBashCheckHook()],
          [join(kiroHooks, 'post-turn-check.json'), generateKiroPostTurnHook()],
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

      } else {
        // Rules-based runtimes: look up the registry and write each surface.
        const descriptor = getRuntime(runtime);
        if (!descriptor) {
          results.push({ runtime, file: '—', status: `ERROR: runtime desconocido '${runtime}'` });
          spinner.update(runtime, 'error');
          continue;
        }
        const surfaces = descriptor.surfaces(config);
        let anyOk = false;
        let allSkip = true;
        for (const surface of surfaces) {
          const absPath = join(root, surface.path);
          // Ensure parent directory exists for nested paths (e.g. .cursor/rules/)
          if (!dryRun) mkdirSync(dirname(absPath), { recursive: true });
          const status = surface.executable
            ? writeExecutable(absPath, surface.content, dryRun, force)
            : writeFile(absPath, surface.content, dryRun, force);
          results.push({ runtime, file: surface.path, status });
          if (!status.startsWith('SKIP')) { anyOk = true; allSkip = false; }
          if (status.startsWith('ERROR')) { allSkip = false; }
        }
        const primaryFile = surfaces[0]?.path ?? '—';
        spinner.update(runtime, allSkip ? 'skip' : anyOk ? 'done' : 'error', primaryFile);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ runtime, file: '—', status: `ERROR: ${msg}` });
      spinner.update(runtime, 'error');
    }
  }

  spinner.stop();
  console.log('');

  // Runtime-agnostic state artifact (SPEC-062): emit .forge/state/{STATE,PLAN,CONTEXT}.md
  // once, derived from project.yaml + docs/specs/. Re-anchors context for any runtime.
  try {
    const specsDir = join(root, config.paths?.specs ?? 'docs/specs');
    const stateDir = join(root, '.forge', 'state');
    if (!dryRun) mkdirSync(stateDir, { recursive: true });
    for (const surface of stateSurfaces(config, specsDir)) {
      const absPath = join(root, surface.path);
      const status = writeFile(absPath, surface.content, dryRun, force);
      results.push({ runtime: 'state', file: surface.path, status });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ runtime: 'state', file: '.forge/state/', status: `ERROR: ${msg}` });
  }

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
