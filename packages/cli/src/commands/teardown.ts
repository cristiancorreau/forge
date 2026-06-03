import { existsSync, rmSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createInterface } from 'readline';
import { findProjectYaml, projectRoot as yamlProjectRoot } from '../lib/yaml.js';
import { loadManifest } from '../lib/lock.js';
import { bold, dim, green, red, yellow, cyan, gray, icons } from '../ui/colors.js';
import { box } from '../ui/box.js';

const HELP = `Usage: forge teardown [options]

Cleanly uninstall forge from the current project. Removes the files that forge
installed (.claude/agents/, hooks, commands, settings.json, CLAUDE.md, .forge/,
architecture.rules) based on .forge/manifest.json, falling back to the standard
forge layout when no manifest is present.

Options:
  --dry-run       List what would be removed without deleting anything
  --keep-config   Preserve project.yaml (kept by default; flag is explicit)
  --yes, -y       Skip the confirmation prompt
  -h, --help      Show this help
`;

interface Target {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the project root, for display. */
  rel: string;
  isDir: boolean;
  /** Source of the target, for the report. */
  source: 'manifest' | 'standard';
}

/**
 * Standard forge layout — used to find leftovers even when the manifest is
 * missing or incomplete. Directories are removed recursively.
 */
const STANDARD_FILES = [
  '.claude/settings.json',
  '.claude/architecture.rules',
  'CLAUDE.md',
];

const STANDARD_DIRS = [
  '.claude/agents',
  '.claude/hooks',
  '.claude/commands',
  '.forge',
];

function relPath(root: string, abs: string): string {
  const r = relative(root, abs);
  return r === '' ? '.' : r;
}

/** Collects removal targets, de-duplicated by absolute path. */
function collectTargets(root: string, keepConfig: boolean): Target[] {
  const seen = new Set<string>();
  const targets: Target[] = [];

  const add = (abs: string, isDir: boolean, source: Target['source']): void => {
    if (seen.has(abs)) return;
    if (!existsSync(abs)) return;
    seen.add(abs);
    targets.push({ path: abs, rel: relPath(root, abs), isDir, source });
  };

  // 1. Manifest-driven: delete exactly what forge recorded installing.
  const manifest = loadManifest(root);
  if (manifest) {
    for (const file of Object.keys(manifest.files)) {
      if (keepConfig && (file === 'project.yaml' || file.endsWith('/project.yaml'))) continue;
      const abs = join(root, file);
      const isDir = existsSync(abs) && statSync(abs).isDirectory();
      add(abs, isDir, 'manifest');
    }
  }

  // 2. Standard layout — catches files not tracked by the manifest.
  for (const file of STANDARD_FILES) {
    add(join(root, file), false, 'standard');
  }
  for (const dir of STANDARD_DIRS) {
    add(join(root, dir), true, 'standard');
  }

  return targets;
}

/** True when the directory has no entries (so it is safe to remove). */
function isEmptyDir(abs: string): boolean {
  try {
    return readdirSync(abs).length === 0;
  } catch {
    return false;
  }
}

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<boolean>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

export async function teardown(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const dryRun = args.includes('--dry-run');
  const keepConfig = args.includes('--keep-config');
  const assumeYes = args.includes('--yes') || args.includes('-y');

  const yamlPath = findProjectYaml(process.cwd());
  if (!yamlPath) {
    console.error(red('ERROR: ') + 'No se encontró project.yaml — ¿estás dentro de un proyecto forge?');
    return 1;
  }
  const root = yamlProjectRoot(yamlPath);

  const targets = collectTargets(root, keepConfig);

  console.log(cyan(bold('forge teardown')) + (dryRun ? dim('  (dry-run)') : '') + '\n');

  if (targets.length === 0) {
    console.log('  ' + gray('Nada que eliminar — el proyecto ya está limpio de forge.'));
    console.log('\n' + box(green('Nada que hacer'), ['No se encontraron artefactos de forge.']));
    return 0;
  }

  // Preview: list every target.
  console.log(dim('Se eliminarán los siguientes artefactos de forge:') + '\n');
  for (const t of targets) {
    const kind = t.isDir ? dim('DIR ') : dim('FILE');
    const tag = t.source === 'manifest' ? gray('[manifest]') : gray('[standard]');
    console.log(`  ${red('-')} ${kind} ${bold(t.rel)} ${tag}`);
  }

  if (keepConfig) {
    console.log('\n  ' + cyan(icons.info) + ' ' + dim('project.yaml se conserva (--keep-config)'));
  }

  if (dryRun) {
    console.log('\n' + box(yellow('Dry-run'), [
      `${targets.length} artefacto(s) se eliminarían.`,
      'Nada fue modificado. Quita --dry-run para ejecutar.',
    ]));
    return 0;
  }

  // Confirmation, unless --yes.
  if (!assumeYes) {
    console.log('');
    const ok = await confirm(yellow('¿Eliminar estos artefactos? ') + dim('(y/N) '));
    if (!ok) {
      console.log('\n  ' + gray('Cancelado. Nada fue eliminado.'));
      return 0;
    }
  }

  console.log('');
  let removed = 0;
  let failed = 0;
  const skipped: string[] = [];

  for (const t of targets) {
    // Don't delete a non-empty .claude/agents/ etc. if it holds files forge
    // didn't install — only remove dirs that are empty after manifest deletions,
    // or dirs that are fully owned by forge (.forge).
    if (t.isDir && t.source === 'standard' && !isEmptyDir(t.path) && t.rel !== '.forge') {
      const remaining = readdirSync(t.path);
      skipped.push(`${t.rel} (retiene ${remaining.length} entrada(s) no instaladas por forge)`);
      continue;
    }

    try {
      rmSync(t.path, { recursive: true, force: true });
      const kind = t.isDir ? 'DIR ' : 'FILE';
      console.log(`  ${green(icons.ok)} ${dim('eliminado')} ${kind} ${bold(t.rel)}`);
      removed++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ${red(icons.error)} ${dim('falló')}     ${bold(t.rel)} ${dim(msg)}`);
      failed++;
    }
  }

  // Clean up .claude/ if it ended up empty.
  const claudeDir = join(root, '.claude');
  if (existsSync(claudeDir) && isEmptyDir(claudeDir)) {
    try {
      rmSync(claudeDir, { recursive: true, force: true });
      console.log(`  ${green(icons.ok)} ${dim('eliminado')} DIR  ${bold(relPath(root, claudeDir))} ${dim('(vacío)')}`);
      removed++;
    } catch {
      // best-effort
    }
  }

  for (const s of skipped) {
    console.log(`  ${yellow(icons.skip)} ${dim('conservado')} ${s}`);
  }

  const summary = `${green(String(removed) + ' eliminados')} · ${yellow(String(skipped.length) + ' conservados')} · ${red(String(failed) + ' fallidos')}`;
  const title = failed > 0 ? red('Teardown con errores') : green('Teardown completado');
  const lines = [summary];
  if (keepConfig) lines.push(dim('project.yaml conservado.'));
  lines.push(dim('Revisa CLAUDE.md/.git si quedaron referencias manuales a forge.'));
  console.log('\n' + box(title, lines));

  return failed > 0 ? 1 : 0;
}
