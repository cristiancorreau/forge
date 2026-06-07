/**
 * forge interactive panel — OpenTUI full-screen UI (Bun runtime only).
 *
 * Five navigable sections (Configuración, Monitoreo, Skills, Hooks, Templates)
 * built on the same panel pattern as tui/dashboard.ts. All data comes from the
 * non-interactive layer (lib/panel-data.ts + runAudit/runDoctor) so the logic is
 * shared with the @clack fallback and the test suite. See SPEC-033.
 */
// @ts-nocheck — OpenTUI types; Bun-only module
import {
  createCliRenderer,
  BoxRenderable,
  Text,
  SelectRenderable,
  InputRenderable,
  t,
  fg,
  bold as otBold,
  dim as otDim,
} from '@opentui/core';
import { VERSION } from '../version.js';
import { tuiBorderChars } from '../ui/ascii.js';
import { FORGE_BANNER } from '../ui/banner.js';
import { THEME, bannerRowColor } from '../ui/theme.js';
import { t } from '../lib/i18n.js';
import { resolveForgeRoot } from '../lib/paths.js';
import { runAudit } from '../commands/audit.js';
import { runDoctor } from '../commands/doctor.js';
import {
  searchSkills, listInstalledHooks, listTemplates, getConfigSummary,
} from '../lib/panel-data.js';
import {
  searchCatalog, installItem,
} from '../lib/catalog-install.js';

function restoreTerminal(): void {
  try {
    process.stdout.write(
      '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l' +
      '\x1b[?1004l' + '\x1b[?2004l' + '\x1b[?1049l' + '\x1b[?25h',
    );
  } catch {}
}

const C = THEME;
const boldCol = (hex: string, s: string) => fg(hex)(otBold(s));
const dimLeaf = (s: string) => otDim(s);
type Part = string | any;
type Row = Part | Part[];
const buildLines = (rows: Row[]) => {
  const strings: any[] = []; const values: any[] = []; let pending = '';
  rows.forEach((row, ri) => {
    if (ri > 0) pending += '\n';
    const parts = Array.isArray(row) ? row : [row];
    for (const part of parts) {
      if (typeof part === 'string') pending += part;
      else { strings.push(pending); pending = ''; values.push(part); }
    }
  });
  strings.push(pending);
  (strings as any).raw = [...strings];
  if (values.length === 0) return t`${pending}`;
  return (t as any)(strings, ...values);
};
const o = (name: string, value: string, description = '') => ({ name, value, description });

function forgeRootOrNull(): string | null {
  try { return resolveForgeRoot(); } catch { return null; }
}

export async function runPanel(root: string): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  try {
    await runPanelLoop(renderer, root);
  } finally {
    try { renderer.destroy(); } catch {}
    restoreTerminal();
  }
}

async function runPanelLoop(renderer: any, root: string): Promise<void> {
  const forgeRoot = forgeRootOrNull();

  const W = renderer.root.width ?? process.stdout.columns ?? 120;
  const H = renderer.root.height ?? process.stdout.rows ?? 40;
  const HEADER_H = 9, BOTTOM_H = 2;
  const BODY_H = H - HEADER_H - BOTTOM_H - 2;
  const LEFT_W = Math.max(28, Math.floor(W * 0.28));
  const RIGHT_W = W - LEFT_W - 1;

  const cfg = getConfigSummary(root);

  // Header
  const header = new BoxRenderable(renderer, {
    id: 'hdr', position: 'absolute', left: 0, top: 0, width: W, height: HEADER_H,
    border: true, customBorderChars: tuiBorderChars(), borderStyle: 'double', borderColor: C.cyan, backgroundColor: C.bg,
    flexDirection: 'column', paddingLeft: 1, paddingTop: 0,
  });
  header.add(Text({ id: 'hdr-t', content: buildLines([
    ...FORGE_BANNER.map((l, i) => fg(bannerRowColor(i))(l)),
    [otDim('v' + VERSION + '  panel  '), cfg.found ? fg(C.green)('● ' + cfg.name) : fg(C.muted)('sin project.yaml'),
     cfg.found ? otDim('  · ' + cfg.mode + ' · ' + cfg.language) : ''],
  ]) }));
  renderer.root.add(header);

  // Nav (left)
  const navPanel = new BoxRenderable(renderer, {
    id: 'nav', position: 'absolute', left: 0, top: HEADER_H + 1, width: LEFT_W, height: BODY_H,
    border: true, customBorderChars: tuiBorderChars(), borderStyle: 'single', borderColor: C.dim, backgroundColor: C.bgPanel,
    title: t('panel.title'), flexDirection: 'column', paddingLeft: 1, paddingTop: 1,
  });
  renderer.root.add(navPanel);

  const SECTIONS = [
    o(t('panel.sec.config'),    'config',    t('panel.sec.config.desc')),
    o(t('panel.sec.monitor'),   'monitor',   t('panel.sec.monitor.desc')),
    o(t('panel.sec.skills'),    'skills',    t('panel.sec.skills.desc')),
    o(t('panel.sec.catalog'),   'catalog',   t('panel.sec.catalog.desc')),
    o(t('panel.sec.hooks'),     'hooks',     t('panel.sec.hooks.desc')),
    o(t('panel.sec.templates'), 'templates', t('panel.sec.templates.desc')),
  ];

  const nav = new SelectRenderable(renderer, {
    id: 'nav-sel', width: LEFT_W - 4, height: BODY_H - 3,
    options: SECTIONS, selectedIndex: 0,
    itemSpacing: 1, showScrollIndicator: true,
    backgroundColor: C.bgPanel, focusedBackgroundColor: C.bgPanel, focusedTextColor: C.white,
    selectedBackgroundColor: C.bgFocus, selectedTextColor: C.yellow,
    showDescription: true, descriptionColor: C.muted, selectedDescriptionColor: C.cyan,
  });
  navPanel.add(nav);

  // Content (right) — flex column so the skills search input can sit above text.
  const content = new BoxRenderable(renderer, {
    id: 'cnt', position: 'absolute', left: LEFT_W + 1, top: HEADER_H + 1, width: RIGHT_W, height: BODY_H,
    border: true, customBorderChars: tuiBorderChars(), borderStyle: 'single', borderColor: C.cyan, backgroundColor: C.bg,
    flexDirection: 'column', gap: 1, paddingLeft: 1, paddingRight: 1, paddingTop: 1,
  });
  renderer.root.add(content);

  // Bottom
  const bottom = new BoxRenderable(renderer, {
    id: 'btm', position: 'absolute', left: 0, top: H - BOTTOM_H, width: W, height: BOTTOM_H,
    backgroundColor: C.bgPanel, paddingLeft: 1,
  });
  const bottomText = Text({ id: 'btm-t', content: buildLines([
    dimLeaf(t('panel.footer')),
  ]) });
  bottom.add(bottomText);
  renderer.root.add(bottom);

  let searchInput: any = null;   // active in the Skills section
  let catalogInput: any = null;  // active in the Catálogo section
  let catalogSelect: any = null; // results list in the Catálogo section
  let catalogResults: any[] = [];
  let catalogStatus = '';        // last install message

  function clearContent() {
    if (searchInput) { try { searchInput.blur(); } catch {} searchInput = null; }
    if (catalogInput) { try { catalogInput.blur(); } catch {} catalogInput = null; }
    if (catalogSelect) { try { catalogSelect.blur(); } catch {} catalogSelect = null; }
    for (const child of [...content.getChildren()]) {
      try { content.remove(child.id ?? ''); } catch {}
    }
  }

  const fitRows = (rows: Row[], reserve = 0): Row[] => {
    const maxRows = BODY_H - 2 - reserve;
    if (rows.length <= maxRows) return rows;
    const out = rows.slice(0, maxRows - 1);
    out.push(dimLeaf(`… +${rows.length - (maxRows - 1)} más`));
    return out;
  };

  // ── Section: Configuración ──
  function rowsConfig(): Row[] {
    if (!cfg.found) {
      return [
        boldCol(C.white, 'Configuración'), '',
        fg(C.muted)('No se encontró project.yaml en este directorio.'),
        ['Ejecutá ', boldCol(C.cyan, 'forge init'), fg(C.muted)(' para configurar el proyecto.')],
      ];
    }
    const rows: Row[] = [
      boldCol(C.white, cfg.name),
      ['  ', fg(C.muted)('mode '), boldCol(C.green, cfg.mode), fg(C.muted)('   lenguaje '), boldCol(C.white, cfg.language)],
      '',
    ];
    if (cfg.stack.length) {
      rows.push(boldCol(C.cyan, 'Stack'));
      for (const { key, value } of cfg.stack) rows.push(['  ', fg(C.muted)(key.padEnd(16)), fg(C.white)(value)]);
      rows.push('');
    }
    rows.push(boldCol(C.cyan, 'Agentes'));
    rows.push(['  ', fg(C.muted)('active'.padEnd(16)), fg(C.white)(cfg.agentsActive.join(', ') || '—')]);
    if (cfg.agentsSpecialized.length) rows.push(['  ', fg(C.muted)('specialized'.padEnd(16)), fg(C.white)(cfg.agentsSpecialized.join(', '))]);
    if (cfg.agentsCompliance.length) rows.push(['  ', fg(C.muted)('compliance'.padEnd(16)), fg(C.white)(cfg.agentsCompliance.join(', '))]);
    if (cfg.profiles.length) rows.push(['  ', fg(C.muted)('profiles'.padEnd(16)), fg(C.white)(cfg.profiles.join(', '))]);
    rows.push('');
    rows.push(['  ', boldCol(C.cyan, 'Skills   '), fg(C.white)(cfg.skills.join(', ') || 'ninguna')]);
    rows.push(['  ', boldCol(C.cyan, 'Runtimes '), fg(C.white)(cfg.runtimes.join(', ') || 'ninguno')]);
    if (cfg.compliance.length) rows.push(['  ', boldCol(C.cyan, 'Compliance '), fg(C.white)(cfg.compliance.join(', '))]);
    if (cfg.deploy) rows.push(['  ', boldCol(C.cyan, 'Deploy   '), fg(C.white)((cfg.deploy.provider ?? '—') + (cfg.deploy.url ? '  ' + cfg.deploy.url : ''))]);
    rows.push('');
    rows.push(dimLeaf('Vista de solo lectura — editá project.yaml para cambiar la config.'));
    return rows;
  }

  // ── Section: Monitoreo ──
  function rowsMonitor(): Row[] {
    const a = runAudit(root);
    const d = runDoctor(root);
    const rows: Row[] = [boldCol(C.white, 'Monitoreo'), ''];
    rows.push(['  ', fg(C.green)(a.summary.ok + ' OK'), fg(C.muted)('  ·  '), fg(C.cyan)(a.summary.info + ' info'),
      fg(C.muted)('  ·  '), fg(C.yellow)(a.summary.warnings + ' warn'), fg(C.muted)('  ·  '), fg(C.red)(a.summary.errors + ' ✗')]);
    rows.push(['  ', fg(C.muted)('hooks instalados '), fg(C.white)(String(a.hooksInstalled)),
      fg(C.muted)('   manifest '), fg(a.manifestStatus === 'ok' ? C.green : C.yellow)(a.manifestStatus)]);
    rows.push('');
    rows.push(['  ', fg(C.muted)('Node '), fg(C.white)(d.nodeVersion),
      fg(C.muted)('  forge root '), fg(d.forgeRootOk ? C.green : C.red)(d.forgeRootOk ? 'ok' : 'no'),
      fg(C.muted)('  assets '), fg(d.assetsOk ? C.green : C.red)(d.assetsOk ? 'ok' : 'faltan')]);
    rows.push(['  ', fg(C.muted)('runtimes detectados '), fg(C.white)(d.runtimesDetected.join(', ') || '—')]);
    rows.push('');
    rows.push(boldCol(C.cyan, 'Runtimes'));
    for (const rt of d.runtimes) {
      const mark = rt.installed ? fg(C.green)('✔ ') : fg(C.muted)('○ ');
      const tag = rt.active ? fg(C.cyan)('  ● active') : '';
      const ver = rt.installed ? dimLeaf(' ' + (rt.version || 'instalado')) : dimLeaf(' — ausente');
      rows.push(['  ', mark, fg(C.white)(rt.label.padEnd(14)), ver, tag]);
    }
    rows.push('');
    rows.push(dimLeaf('Equivale a forge audit + forge doctor.'));
    return rows;
  }

  // ── Section: Hooks ──
  function rowsHooks(): Row[] {
    const hooks = listInstalledHooks(root, forgeRoot);
    const rows: Row[] = [boldCol(C.white, 'Hooks'), ''];
    if (hooks.length === 0) {
      rows.push(fg(C.muted)('No hay hooks en el registry ni en .claude/hooks/.'));
      return rows;
    }
    for (const h of hooks) {
      const mark = h.installed ? fg(C.green)('✔ ') : fg(C.muted)('○ ');
      rows.push(['  ', mark, boldCol(C.white, h.hook.padEnd(22)), fg(C.cyan)(h.event),
        h.matcher ? dimLeaf('  matcher=' + h.matcher) : '', fg(C.muted)('  [' + h.mode + ']')]);
      if (h.description) rows.push(['        ', dimLeaf(h.description)]);
    }
    rows.push('');
    rows.push(dimLeaf('✔ instalado en .claude/hooks/   ○ en el registry pero no instalado'));
    return rows;
  }

  // ── Section: Templates ──
  function rowsTemplates(): Row[] {
    const templates = listTemplates(forgeRoot);
    const rows: Row[] = [boldCol(C.white, 'Templates'), ''];
    if (templates.length === 0) {
      rows.push(fg(C.muted)('No se encontraron templates (forge root ausente).'));
      return rows;
    }
    let lastCat = '';
    for (const tpl of templates) {
      if (tpl.category !== lastCat) { rows.push(boldCol(C.cyan, tpl.category)); lastCat = tpl.category; }
      rows.push(['  ', fg(C.white)(tpl.name.padEnd(26)), dimLeaf(tpl.description)]);
    }
    return rows;
  }

  // ── Section: Skills (with live search input) ──
  function renderSkills(query: string) {
    const results = searchSkills(query, root);
    // Drop the previous results text but keep the input.
    for (const child of [...content.getChildren()]) {
      if (child.id === 'skills-results' || child.id === 'skills-label') {
        try { content.remove(child.id); } catch {}
      }
    }
    const rows: Row[] = [];
    if (results.length === 0) {
      rows.push(fg(C.muted)('Sin resultados para "' + query + '".'));
    } else {
      for (const s of results) {
        const mark = s.active ? fg(C.green)('✔ ') : fg(C.muted)('· ');
        const activeBadge = s.active ? fg(C.green)(' [active]') : '';
        rows.push(['  ', mark, boldCol(C.cyan, s.command.padEnd(16)), fg(C.muted)('[' + s.category + ']'), activeBadge, fg(C.white)(' ' + s.purpose)]);
        rows.push(['                    ', dimLeaf('trigger: ' + s.trigger)]);
      }
    }
    const active = results.filter(r => r.active).length;
    const footer = dimLeaf(`${results.length} resultado(s) · ${active} activa(s) en project.yaml`);
    // 4 rows reserved: label + input + gaps.
    content.add(Text({ id: 'skills-results', content: buildLines(fitRows([...rows, '', footer], 4)) }));
  }

  function renderSkillsSection() {
    clearContent();
    content.add(Text({ id: 'skills-title', content: buildLines([
      boldCol(C.white, 'Skills'),
      dimLeaf('Skills del catálogo. Para instalar uno, usá la sección Catálogo.'),
    ]) }));
    // The live search input was removed (it stole focus / broke navigation).
    // The section now just lists every skill.
    renderSkills('');
  }

  // ── Section: Catálogo (search input + results Select + install on Enter) ──
  const TYPE_COL: Record<string, string> = { skill: C.cyan, profile: C.yellow, template: C.green };

  function refreshCatalogResults(query: string) {
    catalogResults = searchCatalog(forgeRoot, root, query);
    const options = catalogResults.map((it: any, i: number) => {
      const mark = it.installed ? '✓ ' : '  ';
      const typeColors: Record<string, string> = { skill: C.cyan, profile: C.yellow, template: C.green };
      const typeCol = typeColors[it.type] ?? C.muted;
      const tag = fg(typeCol)('[' + it.type + ']');
      const installedBadge = it.installed ? fg(C.green)(' [instalado]') : '';
      const desc = it.description.length > 80 ? it.description.slice(0, 79) + '…' : it.description;
      const state = it.installed ? ' · ya instalado' : '';
      return o(`${mark}${it.label}  ${tag}${installedBadge}`, String(i), desc + state);
    });
    if (catalogSelect) {
      try { catalogSelect.options = options.length ? options : [o('Sin resultados', '-1', '')]; } catch {}
    }
  }

  function installSelectedCatalogItem() {
    const idx = catalogSelect?.getSelectedIndex?.() ?? -1;
    const it = catalogResults[idx];
    if (!it) return;
    if (it.installed) { catalogStatus = `${it.label} ya estaba instalado.`; updateCatalogStatus(); return; }
    const res = installItem(root, forgeRoot, { type: it.type, id: it.id });
    catalogStatus = (res.ok ? '✓ ' : '✗ ') + res.message;
    // Refresh config summary + installed flags after a successful install.
    if (res.ok) {
      try { Object.assign(cfg, getConfigSummary(root)); } catch {}
      refreshCatalogResults(catalogInput?.value ?? '');
      try { catalogSelect.setSelectedIndex?.(Math.min(idx, catalogResults.length - 1)); } catch {}
    }
    updateCatalogStatus();
  }

  function updateCatalogStatus() {
    for (const child of [...content.getChildren()]) {
      if (child.id === 'catalog-status') { try { content.remove(child.id); } catch {} }
    }
    const installed = catalogResults.filter((r: any) => r.installed).length;
    content.add(Text({ id: 'catalog-status', content: buildLines([
      catalogStatus ? fg(catalogStatus.startsWith('✓') ? C.green : C.red)(catalogStatus) : '',
      dimLeaf(`${catalogResults.length} ítem(s) · ${installed} instalado(s)   [Enter] instalar el seleccionado`),
    ]) }));
  }

  function renderCatalogSection() {
    clearContent();
    catalogStatus = '';
    content.add(Text({ id: 'catalog-title', content: buildLines([
      boldCol(C.white, 'Catálogo — buscar e instalar'),
      dimLeaf('Skills, profiles y templates. Escribí para filtrar; Enter instala el seleccionado.'),
    ]) }));
    const input = new InputRenderable(renderer, {
      id: 'catalog-input', width: RIGHT_W - 4,
      backgroundColor: C.bgInput, focusedBackgroundColor: C.bgFocus, focusedTextColor: C.cyan,
      placeholder: 'wiki, hono, spec…', placeholderColor: C.muted,
    });
    content.add(input);
    catalogInput = input;

    const sel = new SelectRenderable(renderer, {
      id: 'catalog-sel', width: RIGHT_W - 4, height: Math.max(4, BODY_H - 9),
      options: [o('…', '0', '')], selectedIndex: 0,
      showScrollIndicator: true,
      backgroundColor: C.bg, focusedBackgroundColor: C.bg, focusedTextColor: C.white,
      selectedBackgroundColor: C.bgFocus, selectedTextColor: C.yellow,
      showDescription: true, descriptionColor: C.muted, selectedDescriptionColor: C.cyan,
    });
    content.add(sel);
    catalogSelect = sel;

    refreshCatalogResults('');
    updateCatalogStatus();

    input.on('input', () => refreshCatalogResults(input.value ?? ''));
    input.on('change', () => refreshCatalogResults(input.value ?? ''));
    sel.on('itemSelected', () => installSelectedCatalogItem());
    input.focus();
  }

  function renderSection(idx: number) {
    const value = SECTIONS[idx]?.value ?? 'config';
    if (value === 'skills') { renderSkillsSection(); return; }
    if (value === 'catalog') { renderCatalogSection(); return; }
    clearContent();
    let rows: Row[];
    switch (value) {
      case 'config':    rows = rowsConfig(); break;
      case 'monitor':   rows = rowsMonitor(); break;
      case 'hooks':     rows = rowsHooks(); break;
      case 'templates': rows = rowsTemplates(); break;
      default:          rows = rowsConfig();
    }
    content.add(Text({ id: 'sec', content: buildLines(fitRows(rows)) }));
  }

  renderSection(0);
  nav.focus();

  const sectionIdx = (idx: any): number =>
    typeof idx === 'number' ? idx : (nav.getSelectedIndex?.() ?? 0);
  nav.on('selectionChanged', (idx: any) => renderSection(sectionIdx(idx)));
  nav.on('itemSelected', (idx: any) => {
    const i = sectionIdx(idx);
    renderSection(i);
    // Enter on Skills/Catálogo focuses the search box so the user can type immediately.
    if (SECTIONS[i]?.value === 'skills' && searchInput) { try { searchInput.focus(); } catch {} }
    if (SECTIONS[i]?.value === 'catalog' && catalogInput) { try { catalogInput.focus(); } catch {} }
  });

  return new Promise<void>((resolve) => {
    const handler = (key: any) => {
      const name = (key?.name ?? '').toLowerCase();
      // When typing in a search box, let the input consume keys.
      const typingSkills = !!searchInput && searchInput.focused;
      const typingCatalog = !!catalogInput && catalogInput.focused;
      const inCatalogList = !!catalogSelect && catalogSelect.focused;
      const typing = typingSkills || typingCatalog;

      if (!typing && !inCatalogList && (name === 'q' || name === 'escape')) {
        try { renderer._internalKeyInput?.offInternal?.('keypress', handler); } catch {}
        resolve();
        return;
      }
      if ((typing || inCatalogList) && name === 'escape') {
        // Esc out of the active widget back to the nav.
        try { searchInput?.blur(); } catch {}
        try { catalogInput?.blur(); } catch {}
        try { catalogSelect?.blur(); } catch {}
        try { nav.focus(); } catch {}
        return;
      }
      // Tab cycles focus. Skills: nav ↔ input. Catálogo: input → list → nav → input.
      if (name === 'tab') {
        if (catalogInput || catalogSelect) {
          if (typingCatalog) { try { catalogInput.blur(); catalogSelect.focus(); } catch {} }
          else if (inCatalogList) { try { catalogSelect.blur(); nav.focus(); } catch {} }
          else { try { catalogInput?.focus(); } catch {} }
          return;
        }
        if (typingSkills) { try { searchInput.blur(); nav.focus(); } catch {} }
        else if (searchInput) { try { searchInput.focus(); } catch {} }
      }
    };
    try { renderer._internalKeyInput.onInternal('keypress', handler); } catch {}
  });
}
