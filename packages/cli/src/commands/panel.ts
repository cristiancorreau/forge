import { join } from 'path';
import { spawnSync } from 'child_process';
import * as p from '@clack/prompts';
import { resolveForgeRoot } from '../lib/paths.js';
import { findProjectYaml } from '../lib/yaml.js';
import { runAudit } from './audit.js';
import { runDoctor } from './doctor.js';
import {
  searchSkills, listInstalledHooks, listTemplates, getConfigSummary,
  type SkillRow,
} from '../lib/panel-data.js';
import {
  searchCatalog, installItem, type CatalogItem,
} from '../lib/catalog-install.js';
import { bold, dim, green, cyan, gray, yellow, red, icons } from '../ui/colors.js';
import { box } from '../ui/box.js';

const HELP = `Usage: forge panel

Open the interactive forge panel: a navigable view of the project's
configuration, monitoring (audit + doctor), skill search, a catalog
searcher+installer (skills/profiles/templates), hooks and templates.

Runs full-screen under Bun (OpenTUI). On plain Node it falls back to a menu
that prints each section. With no project.yaml it still works (showing the
catalog), but it is most useful inside a configured project.

Options:
  -h, --help   Show this help
`;

// OpenTUI panels require Bun runtime.
const isBun = typeof (globalThis as any).Bun !== 'undefined';

/** Locate a usable `bun` binary: PATH first, then standard install locations. */
function findBun(): string | null {
  const candidates = [
    'bun',
    join(process.env.HOME ?? '', '.bun', 'bin', 'bun'),
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
  ];
  for (const bin of candidates) {
    try {
      const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 2000 });
      if (r.status === 0) return bin;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * If running under Node with a TTY, re-launch the CLI under Bun (if available)
 * so the OpenTUI panel can render. Returns false if it couldn't re-launch (the
 * caller then uses the @clack fallback); exits the process if it did.
 */
function tryReLaunchWithBun(): boolean {
  if (isBun) return false;
  if (process.env.FORGE_NO_BUN === '1') return false;
  if (process.env.FORGE_BUN_RELAUNCH === '1') return false; // already relaunched
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const bun = findBun();
  if (!bun) return false;
  const cliPath = new URL('../cli.js', import.meta.url).pathname;
  const result = spawnSync(bun, [cliPath, 'panel'], {
    stdio: 'inherit',
    env: { ...process.env, FORGE_BUN_RELAUNCH: '1' },
  });
  process.exit(result.status ?? 0);
}

function forgeRootOrNull(): string | null {
  try { return resolveForgeRoot(); } catch { return null; }
}

// ─── Node fallback (@clack/prompts) ───────────────────────────────────────────

function printConfigSection(root: string): void {
  const c = getConfigSummary(root);
  if (!c.found) {
    console.log(dim('  No se encontró project.yaml en este directorio.'));
    console.log(dim('  Ejecutá ') + cyan('forge init') + dim(' para configurar el proyecto.'));
    return;
  }
  const lines: string[] = [];
  lines.push(`${bold('Proyecto')}   ${c.name}`);
  lines.push(`${bold('Mode')}       ${c.mode}    ${bold('Lenguaje')} ${c.language}`);
  if (c.stack.length) {
    lines.push('');
    lines.push(bold('Stack'));
    for (const { key, value } of c.stack) lines.push(`  ${gray(key.padEnd(16))} ${value}`);
  }
  lines.push('');
  lines.push(bold('Agentes'));
  lines.push(`  ${gray('active'.padEnd(16))} ${c.agentsActive.join(', ') || dim('—')}`);
  if (c.agentsSpecialized.length) lines.push(`  ${gray('specialized'.padEnd(16))} ${c.agentsSpecialized.join(', ')}`);
  if (c.agentsCompliance.length) lines.push(`  ${gray('compliance'.padEnd(16))} ${c.agentsCompliance.join(', ')}`);
  if (c.profiles.length) lines.push(`  ${gray('profiles'.padEnd(16))} ${c.profiles.join(', ')}`);
  lines.push('');
  lines.push(`${bold('Skills')}     ${c.skills.join(', ') || dim('ninguna')}`);
  lines.push(`${bold('Runtimes')}   ${c.runtimes.join(', ') || dim('ninguno')}`);
  if (c.compliance.length) lines.push(`${bold('Compliance')} ${c.compliance.join(', ')}`);
  if (c.deploy) lines.push(`${bold('Deploy')}     ${c.deploy.provider ?? '—'}${c.deploy.url ? '  ' + c.deploy.url : ''}`);
  console.log(box('Configuración', lines));
  console.log(dim(`  Fuente: ${c.yamlPath}`));
}

function printMonitorSection(root: string): void {
  const a = runAudit(root);
  const d = runDoctor(root);
  const lines: string[] = [];
  lines.push(
    `Audit: ${green(a.summary.ok + ' OK')} · ${cyan(a.summary.info + ' info')} · ` +
    `${yellow(a.summary.warnings + ' warn')} · ${red(a.summary.errors + ' ✗')}`,
  );
  lines.push(`Hooks instalados: ${a.hooksInstalled}`);
  lines.push(`Manifest: ${a.manifestStatus}`);
  lines.push('');
  lines.push(`Node ${d.nodeVersion} · forge root ${d.forgeRootOk ? green('ok') : red('no')} · assets ${d.assetsOk ? green('ok') : red('faltan')}`);
  lines.push(`Runtimes detectados: ${d.runtimesDetected.join(', ') || dim('ninguno')}`);
  lines.push('');
  lines.push(bold('Runtimes'));
  for (const rt of d.runtimes) {
    const mark = rt.installed ? icons.ok : gray('○');
    const tag = rt.active ? cyan(' ● active') : '';
    const ver = rt.installed && rt.version ? dim(' ' + rt.version) : (rt.installed ? '' : dim(' — ausente'));
    lines.push(`  ${mark} ${rt.label.padEnd(14)}${ver}${tag}`);
  }
  console.log(box(d.ok && a.summary.errors === 0 ? 'Monitoreo — todo en orden' : 'Monitoreo', lines));
}

function printSkillRows(rows: SkillRow[]): void {
  if (rows.length === 0) { console.log(dim('  Sin resultados.')); return; }
  const width = Math.max(...rows.map(r => r.command.length));
  for (const r of rows) {
    const mark = r.active ? icons.ok : gray('·');
    console.log(`  ${mark} ${cyan(r.command.padEnd(width))}  ${gray('[' + r.category + ']')} ${r.purpose}`);
    console.log(`    ${' '.repeat(width)}  ${dim('trigger: ' + r.trigger)}`);
  }
  const active = rows.filter(r => r.active).length;
  console.log('\n' + dim(`  ${rows.length} skill(s) · ${active} activa(s) en project.yaml`));
}

async function skillsSearchSection(root: string): Promise<void> {
  const q = await p.text({
    message: 'Buscar skills (nombre, categoría, comando, trigger) — Enter para ver todas',
    placeholder: 'wiki, deploy, security…',
  });
  if (p.isCancel(q)) return;
  printSkillRows(searchSkills(String(q ?? ''), root));
}

const TYPE_TAG: Record<CatalogItem['type'], string> = {
  skill: 'skill', profile: 'profile', template: 'template',
};

function printCatalogRows(items: CatalogItem[]): void {
  if (items.length === 0) { console.log(dim('  Sin resultados.')); return; }
  const width = Math.max(...items.map(i => i.label.length));
  for (const it of items) {
    const mark = it.installed ? green('✓') : gray('·');
    const tag = gray('[' + TYPE_TAG[it.type] + ']');
    const state = it.installed ? dim(' (ya instalado)') : '';
    console.log(`  ${mark} ${cyan(it.label.padEnd(width))}  ${tag} ${it.description}${state}`);
  }
  const installed = items.filter(i => i.installed).length;
  console.log('\n' + dim(`  ${items.length} ítem(s) · ${installed} ya instalado(s)`));
}

/**
 * Interactive catalog search → select → install in the @clack fallback. Lets
 * the user filter installable items (skills/profiles/templates), pick one and
 * install it (with a confirm). Idempotent and YAML-safe via the data layer.
 */
async function catalogSearchInstallSection(root: string): Promise<void> {
  const q = await p.text({
    message: 'Buscar en el catálogo (skills, profiles, templates) — Enter para ver todo',
    placeholder: 'wiki, hono, spec…',
  });
  if (p.isCancel(q)) return;

  const forgeRoot = forgeRootOrNull();
  const items = searchCatalog(forgeRoot, root, String(q ?? ''));
  printCatalogRows(items);
  if (items.length === 0) return;

  const installable = items.filter(i => !i.installed);
  if (installable.length === 0) {
    console.log('\n' + dim('  Todos los resultados ya están instalados.'));
    return;
  }

  const pick = await p.select({
    message: '¿Qué querés instalar/activar?',
    options: [
      ...installable.map(i => ({
        value: `${i.type}:${i.id}`,
        label: `${i.label} ${gray('[' + TYPE_TAG[i.type] + ']')}`,
        hint: i.description,
      })),
      { value: '__cancel__', label: 'Cancelar' },
    ],
  });
  if (p.isCancel(pick) || pick === '__cancel__') return;

  const chosen = installable.find(i => `${i.type}:${i.id}` === pick);
  if (!chosen) return;

  const confirm = await p.confirm({
    message: `Instalar ${chosen.label} (${TYPE_TAG[chosen.type]})?`,
  });
  if (p.isCancel(confirm) || !confirm) { console.log(dim('  Cancelado.')); return; }

  const res = installItem(root, forgeRoot, { type: chosen.type, id: chosen.id });
  if (res.ok) {
    console.log('  ' + green(icons.ok) + ' ' + res.message);
    for (const f of res.changed) console.log('    ' + dim('→ ' + f));
  } else {
    console.log('  ' + red('✗') + ' ' + res.message);
  }
}

function printHooksSection(root: string): void {
  const hooks = listInstalledHooks(root, forgeRootOrNull());
  if (hooks.length === 0) { console.log(dim('  No hay hooks en el registry ni en .claude/hooks/.')); return; }
  const truncate = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const lines: string[] = [];
  for (const h of hooks) {
    const mark = h.installed ? icons.ok : gray('○');
    const matcher = h.matcher ? ` ${dim('matcher=' + h.matcher)}` : '';
    lines.push(`${mark} ${bold(h.hook.padEnd(22))} ${cyan(h.event)}${matcher} ${gray('[' + h.mode + ']')}`);
    if (h.description) lines.push(`  ${dim(truncate(h.description))}`);
  }
  console.log(box('Hooks', lines));
  console.log(dim('  ✓ instalado en .claude/hooks/   ○ declarado en el registry pero no instalado'));
}

function printTemplatesSection(): void {
  const templates = listTemplates(forgeRootOrNull());
  if (templates.length === 0) { console.log(dim('  No se encontraron templates (forge root ausente).')); return; }
  const lines: string[] = [];
  let lastCat = '';
  for (const t of templates) {
    if (t.category !== lastCat) { lines.push(bold(t.category)); lastCat = t.category; }
    lines.push(`  ${cyan(t.name.padEnd(26))} ${dim(t.description)}`);
  }
  console.log(box('Templates', lines));
}

/**
 * Non-interactive snapshot: print every section once. Used when there is no TTY
 * (piped/CI) so the panel never crashes and still surfaces useful information.
 */
function printStaticSnapshot(root: string): number {
  console.log(cyan(bold('forge panel')) + dim(' — snapshot (sin TTY interactiva)') + '\n');
  printConfigSection(root);
  console.log('');
  printMonitorSection(root);
  console.log('');
  printSkillRows(searchSkills('', root));
  console.log('');
  console.log(cyan(bold('Catálogo — buscar e instalar')) + dim(' (skills · profiles · templates)') + '\n');
  printCatalogRows(searchCatalog(forgeRootOrNull(), root, ''));
  console.log('');
  printHooksSection(root);
  console.log('');
  printTemplatesSection();
  return 0;
}

async function runClackFallback(root: string): Promise<number> {
  // No interactive TTY → print a one-shot snapshot instead of prompting (which
  // would throw ERR_TTY_INIT_FAILED on a /dev/null or piped stdin).
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return printStaticSnapshot(root);
  }

  p.intro(' forge panel ');
  if (!findProjectYaml(root)) {
    p.note('No hay project.yaml en este directorio. El panel muestra el catálogo\nglobal; ejecutá `forge init` para configurar el proyecto.', 'Aviso');
  }

  // Loop until the user picks Salir.
  for (;;) {
    const choice = await p.select({
      message: '¿Qué querés ver?',
      options: [
        { value: 'config',    label: 'Configuración', hint: 'resumen de project.yaml' },
        { value: 'monitor',   label: 'Monitoreo',     hint: 'audit + doctor' },
        { value: 'skills',    label: 'Skills',        hint: 'buscar en el catálogo' },
        { value: 'catalog',   label: 'Catálogo — buscar e instalar', hint: 'skills · profiles · templates' },
        { value: 'hooks',     label: 'Hooks',         hint: 'instalados + registry' },
        { value: 'templates', label: 'Templates',     hint: 'wiki / spec / modes' },
        { value: 'editor',    label: 'Abrir project.yaml en $EDITOR' },
        { value: 'exit',      label: 'Salir' },
      ],
    });
    if (p.isCancel(choice) || choice === 'exit') break;

    console.log('');
    switch (choice) {
      case 'config':    printConfigSection(root); break;
      case 'monitor':   printMonitorSection(root); break;
      case 'skills':    await skillsSearchSection(root); break;
      case 'catalog':   await catalogSearchInstallSection(root); break;
      case 'hooks':     printHooksSection(root); break;
      case 'templates': printTemplatesSection(); break;
      case 'editor':    openEditor(root); break;
    }
    console.log('');
  }

  p.outro('Listo.');
  return 0;
}

function openEditor(root: string): void {
  const yamlPath = findProjectYaml(root);
  if (!yamlPath) { console.log(dim('  No hay project.yaml para abrir.')); return; }
  const editor = process.env.EDITOR || process.env.VISUAL;
  if (!editor) { console.log(dim('  $EDITOR no definido. Ruta: ') + yamlPath); return; }
  spawnSync(editor, [yamlPath], { stdio: 'inherit' });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function panel(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const root = process.cwd();

  // Full-screen OpenTUI under Bun.
  if (isBun && process.stdout.isTTY) {
    try {
      const { runPanel } = await import('../tui/panel.js');
      await runPanel(root);
      return 0;
    } catch {
      // fall through to the clack fallback
    }
  }

  // On Node with Bun installed + a TTY, re-launch under Bun for OpenTUI.
  if (!isBun && process.stdout.isTTY) {
    tryReLaunchWithBun(); // exits the process on success
  }

  // Node fallback (no Bun, or not a TTY): @clack menu.
  return runClackFallback(root);
}
