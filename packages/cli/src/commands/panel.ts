import { spawnSync } from 'child_process';
import * as p from '@clack/prompts';
import { resolveForgeRoot } from '../lib/paths.js';
import {
  findBun, resolveCliEntry, shouldRelaunchUnderBun, relaunchUnderBun, bunFallbackHint,
} from '../lib/bun.js';
import { findProjectYaml } from '../lib/yaml.js';
import { runAudit } from './audit.js';
import { runDoctor } from './doctor.js';
import {
  searchSkills, listInstalledHooks, listTemplates, getConfigSummary, getSkillCategories,
  getProjectState,
  type SkillRow,
} from '../lib/panel-data.js';
import {
  searchCatalog, installItem, uninstallItem, enableSkill, disableSkill, installHook,
  type CatalogItem,
} from '../lib/catalog-install.js';
import { bold, dim, green, cyan, gray, yellow, red, icons } from '../ui/colors.js';
import { box } from '../ui/box.js';
import { forgeBanner } from '../ui/banner.js';
import { VERSION } from '../version.js';

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

/**
 * If running under Node with a TTY, re-launch the CLI under Bun (if available)
 * so the OpenTUI panel can render. Returns false if it couldn't re-launch (the
 * caller then uses the @clack fallback); exits the process if it did.
 *
 * The decision (platform gates, Windows terminal capability, the
 * FORGE_NO_BUN/FORGE_FORCE_BUN overrides, the FORGE_BUN_RELAUNCH guard) lives in
 * the shared, unit-tested lib/bun.ts helper so init and panel stay in sync.
 */
function tryReLaunchWithBun(): boolean {
  if (isBun) return false;
  const isTTY = !!(process.stdin.isTTY && process.stdout.isTTY);
  const bun = findBun();
  if (!shouldRelaunchUnderBun({ bunPath: bun, isTTY, alreadyBun: isBun })) {
    return false;
  }
  // fileURLToPath (not URL.pathname) so the entry path is valid on Windows.
  const cliPath = resolveCliEntry(import.meta.url);
  process.exit(relaunchUnderBun(bun as string, cliPath, ['panel']));
}

function forgeRootOrNull(): string | null {
  try { return resolveForgeRoot(); } catch { return null; }
}

/**
 * FORGE banner + tagline for the Node panel fallback (interactive menu and the
 * non-interactive snapshot). Mirrors the static header / wizard banner so the
 * "no Bun" experience is uniform. Respects FORGE_ASCII (block glyphs degrade to
 * the ASCII banner) and NO_COLOR (the colors helper disables ANSI).
 */
function printPanelBanner(subtitle: string): void {
  const banner = forgeBanner().map(l => cyan(l)).join('\n');
  process.stdout.write(
    '\n' + banner + '\n' +
    bold('forge panel') + dim('  ·  ' + subtitle) + dim('  v' + VERSION) + '\n\n',
  );
}

/**
 * A consistent section heading for the row-based sections (Skills, Catálogo) that
 * aren't wrapped in a box(). Mirrors the `► title` style of the static header.
 */
function sectionTitle(title: string, subtitle = ''): void {
  console.log(cyan(bold('► ' + title)) + (subtitle ? dim('  ' + subtitle) : '') + '\n');
}

// ─── Node fallback (@clack/prompts) ───────────────────────────────────────────

/**
 * Print the Home section (SPEC-059 PR6) in the @clack fallback.
 * Uses getProjectState with no audit/doctor (optimistic, fast) for the snapshot.
 */
function printHomeSection(root: string): void {
  const state = getProjectState(root);
  const nextActionMap: Record<string, string> = {
    empty:             'forge init — inicializar forge en este proyecto',
    brownfield:        'forge adopt — incorporar forge a este codebase',
    configured:        'forge recommend — obtener recomendaciones de skills',
    healthy:           'forge audit — ejecutar una auditoría del proyecto',
    'needs-attention': 'forge doctor — diagnosticar problemas del entorno',
  };
  const stateLabelMap: Record<string, string> = {
    empty:             'Proyecto no configurado',
    brownfield:        'Proyecto existente — forge no configurado',
    configured:        'Configurado — sin skills activas',
    healthy:           'Saludable',
    'needs-attention': 'Requiere atención',
  };
  const cfg = getConfigSummary(root);
  const lines: string[] = [];
  lines.push(`Estado: ${stateLabelMap[state] ?? state}`);
  lines.push(`Próxima acción: ${nextActionMap[state] ?? ''}`);
  lines.push('');
  lines.push(bold('Pulso del proyecto'));
  lines.push(`  Skills activas: ${cfg.found ? cfg.skills.length : '—'}`);
  lines.push(`  Runtimes:       ${cfg.found ? (cfg.runtimes.join(', ') || '—') : '—'}`);
  lines.push(`  Proyecto:       ${cfg.found ? cfg.name : '—'}`);
  console.log(box('Inicio', lines));
}

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
    const activeBadge = r.active ? green(' [active]') : '';
    console.log(`  ${mark} ${cyan(r.command.padEnd(width))}  ${gray('[' + r.category + ']')}${activeBadge} ${r.purpose}`);
    console.log(`    ${' '.repeat(width)}  ${dim('trigger: ' + r.trigger)}`);
  }
  const active = rows.filter(r => r.active).length;
  console.log('\n' + dim(`  ${rows.length} skill(s) · ${active} activa(s) en project.yaml`));
}

async function skillsSearchSection(root: string): Promise<void> {
  const categories = getSkillCategories(root);
  const catChoice = await p.select({
    message: 'Filtrar por categoría',
    options: [
      { value: '', label: 'Todas las categorías' },
      ...categories.map(c => ({ value: c, label: c })),
    ],
  });
  if (p.isCancel(catChoice)) return;

  const q = await p.text({
    message: 'Buscar skills (nombre, comando, trigger) — Enter para ver todas',
    placeholder: 'wiki, deploy, security…',
  });
  if (p.isCancel(q)) return;

  const selectedCat = String(catChoice ?? '') || undefined;
  console.log('');
  sectionTitle('Skills', selectedCat ? `categoría: ${selectedCat}` : '');
  const rows = searchSkills(String(q ?? ''), root, selectedCat);
  printSkillRows(rows);
  if (rows.length === 0) return;

  // Offer enable/disable actions on the found skills.
  const action = await p.select({
    message: '¿Qué acción querés realizar?',
    options: [
      { value: 'enable',  label: 'Activar una skill',    hint: 'agrega a skills: en project.yaml' },
      { value: 'disable', label: 'Desactivar una skill', hint: 'quita de skills: en project.yaml' },
      { value: 'none',    label: 'Volver sin cambios' },
    ],
  });
  if (p.isCancel(action) || action === 'none') return;

  const candidates = action === 'enable'
    ? rows.filter(r => !r.active)
    : rows.filter(r => r.active);

  if (candidates.length === 0) {
    console.log(dim(action === 'enable'
      ? '  Todas las skills de la búsqueda ya están activas.'
      : '  Ninguna de las skills de la búsqueda está activa.'));
    return;
  }

  const pick = await p.select({
    message: action === 'enable' ? '¿Qué skill querés activar?' : '¿Qué skill querés desactivar?',
    options: [
      ...candidates.map(r => ({ value: r.id, label: r.command, hint: r.purpose })),
      { value: '__cancel__', label: 'Cancelar' },
    ],
  });
  if (p.isCancel(pick) || pick === '__cancel__') return;

  const forgeRoot = forgeRootOrNull();
  const res = action === 'enable'
    ? enableSkill(root, forgeRoot, String(pick))
    : disableSkill(root, String(pick));
  if (res.ok) {
    console.log('  ' + green(icons.ok) + ' ' + res.message);
    for (const f of res.changed) console.log('    ' + dim('→ ' + f));
  } else {
    console.log('  ' + red('✗') + ' ' + res.message);
  }
}

// The panel only renders installable rows (skill/profile/template); other unified
// types fall back to their own name.
const TYPE_TAG: Partial<Record<CatalogItem['type'], string>> = {
  skill: 'skill', profile: 'profile', template: 'template',
};

/** Color for the type badge — cyan=skill, yellow=profile, green=template, gray=others. */
function typeColor(type: CatalogItem['type']): (s: string) => string {
  if (type === 'skill') return cyan;
  if (type === 'profile') return yellow;
  if (type === 'template') return green;
  return gray;
}

function printCatalogRows(items: CatalogItem[]): void {
  if (items.length === 0) { console.log(dim('  Sin resultados.')); return; }
  const width = Math.max(...items.map(i => i.label.length));
  for (const it of items) {
    const mark = it.installed ? green('✓') : gray('·');
    const typeLabel = TYPE_TAG[it.type] ?? it.type;
    const tag = typeColor(it.type)('[' + typeLabel + ']');
    const installedBadge = it.installed ? green(' [instalado]') : '';
    console.log(`  ${mark} ${cyan(it.label.padEnd(width))}  ${tag}${installedBadge} ${it.description}`);
  }
  const installed = items.filter(i => i.installed).length;
  console.log('\n' + dim(`  ${items.length} ítem(s) · ${installed} ya instalado(s)`));
}

/**
 * Interactive catalog search → select → install or uninstall in the @clack
 * fallback. Lets the user filter installable items (skills/profiles/templates),
 * pick one and install or uninstall it. Idempotent and YAML-safe via the data layer.
 */
async function catalogSearchInstallSection(root: string): Promise<void> {
  const q = await p.text({
    message: 'Buscar en el catálogo (skills, profiles, templates) — Enter para ver todo',
    placeholder: 'wiki, hono, spec…',
  });
  if (p.isCancel(q)) return;

  const forgeRoot = forgeRootOrNull();
  const items = searchCatalog(forgeRoot, root, String(q ?? ''));
  console.log('');
  sectionTitle('Catálogo', '(skills · profiles · templates)');
  printCatalogRows(items);
  if (items.length === 0) return;

  const installable = items.filter(i => i.installable && !i.installed);
  const installed = items.filter(i => i.installable && i.installed);

  if (installable.length === 0 && installed.length === 0) return;

  // Choose action first when both options are available.
  let actionMode: 'install' | 'uninstall' = 'install';
  if (installed.length > 0) {
    const actionPick = await p.select({
      message: '¿Qué querés hacer?',
      options: [
        ...(installable.length > 0 ? [{ value: 'install',   label: 'Instalar/activar',   hint: 'agrega al proyecto' }] : []),
        ...(installed.length  > 0 ? [{ value: 'uninstall', label: 'Desinstalar/desactivar', hint: 'quita del proyecto' }] : []),
        { value: '__cancel__', label: 'Cancelar' },
      ],
    });
    if (p.isCancel(actionPick) || actionPick === '__cancel__') return;
    actionMode = actionPick as 'install' | 'uninstall';
  }

  const candidates = actionMode === 'install' ? installable : installed;
  if (candidates.length === 0) {
    console.log('\n' + dim(actionMode === 'install'
      ? '  Todos los resultados ya están instalados.'
      : '  Ninguno de los resultados está instalado.'));
    return;
  }

  const pick = await p.select({
    message: actionMode === 'install' ? '¿Qué querés instalar/activar?' : '¿Qué querés desinstalar?',
    options: [
      ...candidates.map(i => ({
        value: `${i.type}:${i.id}`,
        label: `${i.label} ${typeColor(i.type)('[' + (TYPE_TAG[i.type] ?? i.type) + ']')}`,
        hint: i.description,
      })),
      { value: '__cancel__', label: 'Cancelar' },
    ],
  });
  if (p.isCancel(pick) || pick === '__cancel__') return;

  const chosen = candidates.find(i => `${i.type}:${i.id}` === pick);
  if (!chosen) return;

  // Show full description of the chosen item before confirming.
  const typeLabel = TYPE_TAG[chosen.type] ?? chosen.type;
  p.note(
    `${bold(chosen.label)} ${typeColor(chosen.type)('[' + typeLabel + ']')}\n` +
    chosen.description,
    'Detalle del ítem',
  );

  const confirmMsg = actionMode === 'install'
    ? `Instalar ${chosen.label} (${typeLabel})?`
    : `Desinstalar ${chosen.label} (${typeLabel})?`;
  const confirm = await p.confirm({ message: confirmMsg });
  if (p.isCancel(confirm) || !confirm) { console.log(dim('  Cancelado.')); return; }

  const res = actionMode === 'install'
    ? installItem(root, forgeRoot, { type: chosen.type, id: chosen.id })
    : uninstallItem(root, forgeRoot, { type: chosen.type, id: chosen.id });
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

/**
 * Interactive hook installer in the @clack fallback. Lists uninstalled hooks
 * from the registry, lets the user pick one and installs it idempotently.
 */
async function hookInstallSection(root: string): Promise<void> {
  const forgeRoot = forgeRootOrNull();
  if (!forgeRoot) { console.log(dim('  forge root no disponible para instalar hooks.')); return; }

  const hooks = listInstalledHooks(root, forgeRoot);
  const uninstalled = hooks.filter(h => !h.installed && h.mode !== 'unknown');
  if (uninstalled.length === 0) {
    console.log(dim('  Todos los hooks del registry ya están instalados.'));
    return;
  }

  const pick = await p.select({
    message: '¿Qué hook querés instalar?',
    options: [
      ...uninstalled.map(h => ({
        value: h.hook,
        label: `${h.hook} ${gray('[' + h.mode + ']')}`,
        hint: h.description || h.event,
      })),
      { value: '__cancel__', label: 'Cancelar' },
    ],
  });
  if (p.isCancel(pick) || pick === '__cancel__') return;

  const res = installHook(root, forgeRoot, String(pick));
  if (res.ok) {
    console.log('  ' + green(icons.ok) + ' ' + res.message);
    for (const f of res.changed) console.log('    ' + dim('→ ' + f));
  } else {
    console.log('  ' + red('✗') + ' ' + res.message);
  }
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
  printPanelBanner('snapshot (sin TTY interactiva)');
  printHomeSection(root);
  console.log('');
  printConfigSection(root);
  console.log('');
  printMonitorSection(root);
  console.log('');
  sectionTitle('Skills', '(catálogo de la CLI)');
  printSkillRows(searchSkills('', root));
  console.log('');
  sectionTitle('Catálogo — buscar e instalar', '(skills · profiles · templates)');
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

  printPanelBanner('panel interactivo');
  p.intro(cyan(' forge panel '));
  if (!findProjectYaml(root)) {
    p.note('No hay project.yaml en este directorio. El panel muestra el catálogo\nglobal; ejecutá `forge init` para configurar el proyecto.', 'Aviso');
  }

  // Loop until the user picks Salir.
  for (;;) {
    const choice = await p.select({
      message: '¿Qué querés ver?',
      options: [
        { value: 'home',      label: 'Inicio',        hint: 'estado del proyecto + próxima acción' },
        { value: 'config',    label: 'Configuración', hint: 'resumen de project.yaml' },
        { value: 'monitor',   label: 'Monitoreo',     hint: 'audit + doctor' },
        { value: 'skills',    label: 'Skills',        hint: 'buscar en el catálogo' },
        { value: 'catalog',   label: 'Catálogo — buscar e instalar', hint: 'skills · profiles · templates' },
        { value: 'hooks',        label: 'Hooks',                 hint: 'instalados + registry' },
        { value: 'hooks-install', label: 'Instalar un hook',    hint: 'instala desde el registry' },
        { value: 'templates', label: 'Templates',     hint: 'wiki / spec / modes' },
        { value: 'editor',    label: 'Abrir project.yaml en $EDITOR' },
        { value: 'exit',      label: 'Salir' },
      ],
    });
    if (p.isCancel(choice) || choice === 'exit') break;

    console.log('');
    switch (choice) {
      case 'home':      printHomeSection(root); break;
      case 'config':    printConfigSection(root); break;
      case 'monitor':   printMonitorSection(root); break;
      case 'skills':    await skillsSearchSection(root); break;
      case 'catalog':   await catalogSearchInstallSection(root); break;
      case 'hooks':         printHooksSection(root); break;
      case 'hooks-install': await hookInstallSection(root); break;
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

  // On Node with a capable terminal + Bun installed, re-launch under Bun for
  // OpenTUI. Exits the process on success; returns false → Node fallback below.
  if (!isBun && process.stdout.isTTY) {
    tryReLaunchWithBun();
    // Didn't relaunch (no Bun, gated, or already relaunched) → nudge toward the
    // full panel (once, TTY-only, not under Bun, not when opted out).
    const isTTY = !!(process.stdin.isTTY && process.stdout.isTTY);
    const hint = bunFallbackHint({ isTTY, alreadyBun: isBun });
    if (hint) console.log(dim('  ' + hint));
  }

  // Node fallback (no Bun, or not a TTY): @clack menu.
  return runClackFallback(root);
}
