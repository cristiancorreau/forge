/**
 * forge interactive panel — OpenTUI full-screen UI (Bun runtime only).
 *
 * Five navigable sections (Configuración, Monitoreo, Skills, Hooks, Templates)
 * built on the same panel pattern as tui/dashboard.ts. All data comes from the
 * non-interactive layer (lib/panel-data.ts + runAudit/runDoctor) so the logic is
 * shared with the @clack fallback and the test suite. See SPEC-033.
 *
 * SPEC-059 PR1: mode state machine + single KEYMAP source of truth.
 * SPEC-059 PR3: runner / log pane (LOG mode).
 * SPEC-059 PR4: command palette ':' (PALETTE mode).
 * Modes: NAV | FILTER | PALETTE | CONFIRM | LOG
 *   - NAV:     default; section navigation + all shortcuts
 *   - FILTER:  typing in the catalog/skills search input
 *   - PALETTE: command palette overlay (PR4)
 *   - CONFIRM:  (reserved for future destructive action confirmation)
 *   - LOG:      runner log pane (PR3)
 */
// @ts-nocheck — OpenTUI types; Bun-only module
import {
  createCliRenderer,
  BoxRenderable,
  Text,
  SelectRenderable,
  InputRenderable,
  t as otText,
  fg,
  bold as otBold,
  dim as otDim,
} from '@opentui/core';
// ScrollBoxRenderable is used for the log pane when available (SPEC-059 PR3).
// The import is intentionally deferred to avoid a hard failure on older builds.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ScrollBoxRenderable: any;
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
import {
  COMMANDS, fuzzyMatch, logBuffer, runPanelCommand,
  type PanelCommand,
} from '../lib/panel-commands.js';

// ── Mode state machine ──────────────────────────────────────────────────────
/** Panel interaction modes (SPEC-059). */
export type PanelMode = 'NAV' | 'FILTER' | 'PALETTE' | 'CONFIRM' | 'LOG';

// ── KEYMAP — single source of truth ────────────────────────────────────────
/** One key binding entry: what key, what label to show, what action name. */
interface KeyBinding {
  key: string;
  label: string;
  action: string;
  /** Modes in which this binding is active (undefined = all modes). */
  modes?: PanelMode[];
  /** Sections where this binding applies (undefined = all sections). */
  sections?: string[];
}

/**
 * KEYMAP — the single source of truth for (a) the dispatcher,
 * (b) the footer contextual text, (c) the ? help overlay.
 */
const KEYMAP: { global: KeyBinding[]; bySection: Record<string, KeyBinding[]> } = {
  global: [
    { key: '↑↓',  label: 'Section',      action: 'nav-section',    modes: ['NAV'] },
    { key: 'Tab', label: 'Focus',         action: 'cycle-focus',    modes: ['NAV', 'FILTER'] },
    { key: 'Enter', label: 'Open/Install', action: 'confirm',       modes: ['NAV', 'FILTER'] },
    { key: ':',   label: 'Command palette', action: 'open-palette', modes: ['NAV'] },
    { key: '?',   label: 'Help',          action: 'toggle-help',    modes: ['NAV'] },
    { key: 'q/Esc', label: 'Quit',        action: 'quit',           modes: ['NAV'] },
    { key: 'Esc', label: 'Back to nav',   action: 'escape-filter',  modes: ['FILTER'] },
    { key: 'Enter', label: 'Run command', action: 'palette-run',    modes: ['PALETTE'] },
    { key: 'Esc', label: 'Close palette', action: 'escape-palette', modes: ['PALETTE'] },
    { key: 'Esc', label: 'Close log',     action: 'escape-log',     modes: ['LOG'] },
  ],
  bySection: {
    catalog: [
      { key: 'Type', label: 'Filter',    action: 'filter-input', modes: ['NAV'] },
      { key: 'Tab',  label: 'input→list→nav', action: 'cycle-focus', modes: ['NAV', 'FILTER'] },
      { key: 'Enter', label: 'Install',  action: 'install-item', modes: ['NAV', 'FILTER'] },
    ],
    skills: [
      { key: 'Type', label: 'Filter', action: 'filter-input', modes: ['NAV'] },
    ],
  },
};

/** Build the footer string for the current mode + section. */
function buildFooterText(mode: PanelMode, section: string): string {
  if (mode === 'FILTER') return t('panel.footer.filter');
  if (mode === 'PALETTE') return t('panel.footer.palette');
  if (mode === 'LOG') return t('panel.footer.log');
  // NAV mode: show contextual bindings
  return t('panel.footer.nav');
}

/** Build the help overlay content lines from KEYMAP. */
function buildHelpLines(section: string): string[] {
  const lines: string[] = [];
  lines.push(t('panel.help.title'));
  lines.push('');
  lines.push('  Global');
  for (const b of KEYMAP.global) {
    lines.push(`    [${b.key}]  ${b.label}`);
  }
  const secBindings = KEYMAP.bySection[section];
  if (secBindings && secBindings.length > 0) {
    lines.push('');
    lines.push('  This section');
    for (const b of secBindings) {
      lines.push(`    [${b.key}]  ${b.label}`);
    }
  }
  lines.push('');
  lines.push('  ' + t('panel.help.close'));
  return lines;
}

// ── Adaptor for the private OpenTUI key API ─────────────────────────────────
/** Single coupling point for the private OpenTUI `_internalKeyInput` API. */
function onKey(renderer: any, handler: (key: any) => void): void {
  try { renderer._internalKeyInput.onInternal('keypress', handler); } catch {}
}
function offKey(renderer: any, handler: (key: any) => void): void {
  try { renderer._internalKeyInput?.offInternal?.('keypress', handler); } catch {}
}

// ── Terminal helpers ────────────────────────────────────────────────────────
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
  if (values.length === 0) return otText`${pending}`;
  return (otText as any)(strings, ...values);
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

  // ── Mode state ─────────────────────────────────────────────────────────────
  let mode: PanelMode = 'NAV';

  function getCurrentSection(): string {
    return SECTIONS[nav.getSelectedIndex?.() ?? 0]?.value ?? 'config';
  }

  function updateFooter(): void {
    const sec = getCurrentSection();
    const text = buildFooterText(mode, sec);
    try {
      bottom.remove('btm-t');
    } catch {}
    bottom.add(Text({ id: 'btm-t', content: buildLines([dimLeaf(text)]) }));
  }

  // ── Help overlay ────────────────────────────────────────────────────────────
  let helpOverlay: any = null;

  function showHelp(): void {
    if (helpOverlay) return;
    const sec = getCurrentSection();
    const lines = buildHelpLines(sec);
    const OW = Math.min(52, W - 4);
    const OH = lines.length + 2;
    const OL = Math.floor((W - OW) / 2);
    const OT = Math.floor((H - OH) / 2);
    helpOverlay = new BoxRenderable(renderer, {
      id: 'help-overlay',
      position: 'absolute',
      left: OL, top: OT, width: OW, height: OH,
      border: true,
      customBorderChars: tuiBorderChars(),
      borderStyle: 'double',
      borderColor: C.yellow,
      backgroundColor: C.bgPanel,
      flexDirection: 'column',
      paddingLeft: 1,
      paddingTop: 0,
      title: t('panel.help.title'),
    });
    helpOverlay.add(Text({
      id: 'help-content',
      content: buildLines(lines.map((l) => fg(C.white)(l))),
    }));
    renderer.root.add(helpOverlay);
  }

  function hideHelp(): void {
    if (!helpOverlay) return;
    try { renderer.root.remove('help-overlay'); } catch {}
    helpOverlay = null;
  }

  function toggleHelp(): void {
    if (helpOverlay) hideHelp(); else showHelp();
  }

  // ── Log pane (SPEC-059 PR3) ─────────────────────────────────────────────────
  let logOverlay: any = null;
  const LOG_MAX_LINES = Math.max(8, BODY_H - 6);

  function showLogPane(title: string, lines: string[], ok: boolean): void {
    hideLogPane();
    const statusLine = ok ? t('panel.log.done') : t('panel.log.error');
    const allLines = [t('panel.log.running'), '', ...lines, '', statusLine];
    const OW = Math.min(W - 4, Math.max(60, W - 8));
    const OH = Math.min(BODY_H - 2, allLines.length + 4);
    const OL = Math.floor((W - OW) / 2);
    const OT = HEADER_H + 1;
    logOverlay = new BoxRenderable(renderer, {
      id: 'log-overlay',
      position: 'absolute',
      left: OL, top: OT, width: OW, height: OH,
      border: true,
      customBorderChars: tuiBorderChars(),
      borderStyle: 'single',
      borderColor: ok ? C.green : C.red,
      backgroundColor: C.bg,
      flexDirection: 'column',
      paddingLeft: 1,
      paddingTop: 0,
      title: ' ' + title + ' ',
    });
    // Limit to window using logBuffer
    const buf = logBuffer(LOG_MAX_LINES);
    buf.append(allLines);
    const windowLines = buf.getWindow();
    logOverlay.add(Text({
      id: 'log-content',
      content: buildLines(windowLines.map((l) =>
        l === statusLine
          ? (ok ? fg(C.green)(l) : fg(C.red)(l))
          : fg(C.white)(l),
      )),
    }));
    logOverlay.add(Text({
      id: 'log-hint',
      content: buildLines([dimLeaf('[Esc] ' + t('panel.footer.log'))]),
    }));
    renderer.root.add(logOverlay);
    mode = 'LOG';
    updateFooter();
  }

  function hideLogPane(): void {
    if (!logOverlay) return;
    try { renderer.root.remove('log-overlay'); } catch {}
    logOverlay = null;
  }

  /**
   * Run a panel command and show its output in the log pane.
   * For delegated/writes-fs commands: close the panel with a shell hint.
   */
  async function runCommandInLog(cmd: PanelCommand): Promise<void> {
    const panelCtx = { root, forgeRoot: forgeRootOrNull() };
    const result = await runPanelCommand(cmd.id, panelCtx);
    if ('delegate' in result && result.delegate) {
      // Delegated: destroy panel + print hint
      try { renderer.destroy(); } catch {}
      restoreTerminal();
      process.stdout.write(
        '\n  ' + t('panel.log.delegate', { cmd: result.cmd }) + '\n\n',
      );
      return;
    }
    if ('needsApply' in result && result.needsApply) {
      const lines = [t('panel.log.needs-apply', { cmd: result.cmd })];
      showLogPane(cmd.name, lines, false);
      return;
    }
    // Pure result
    showLogPane(cmd.name, result.lines, result.ok);
  }

  // ── Command palette (SPEC-059 PR4) ──────────────────────────────────────────
  let paletteOverlay: any = null;
  let paletteInput: any = null;
  let paletteSelect: any = null;
  let paletteResults: PanelCommand[] = [...COMMANDS];

  function buildPaletteOptions(cmds: PanelCommand[]) {
    return cmds.map((c, i) => ({
      name: `${c.name.padEnd(20)} [${c.kind}]  ${c.desc.slice(0, 45)}`,
      value: String(i),
      description: c.aliases.length ? 'aliases: ' + c.aliases.join(', ') : '',
    }));
  }

  function showPalette(): void {
    if (paletteOverlay) return;
    // Blur background widgets to prevent focus leakage (SPEC-059 requirement)
    try { catalogInput?.blur(); } catch {}
    try { catalogSelect?.blur(); } catch {}
    try { nav.blur(); } catch {}

    const PW = Math.min(W - 4, Math.max(70, W - 8));
    const PH = Math.min(H - HEADER_H - BOTTOM_H - 4, 20);
    const PL = Math.floor((W - PW) / 2);
    const PT = HEADER_H + 2;

    paletteOverlay = new BoxRenderable(renderer, {
      id: 'palette-overlay',
      position: 'absolute',
      left: PL, top: PT, width: PW, height: PH,
      border: true,
      customBorderChars: tuiBorderChars(),
      borderStyle: 'single',
      borderColor: C.cyan,
      backgroundColor: C.bgPanel,
      flexDirection: 'column',
      paddingLeft: 1,
      paddingTop: 0,
      title: t('panel.palette.title'),
    });

    const inp = new InputRenderable(renderer, {
      id: 'palette-input', width: PW - 4,
      backgroundColor: C.bgInput, focusedBackgroundColor: C.bgFocus, focusedTextColor: C.cyan,
      placeholder: t('panel.palette.placeholder'), placeholderColor: C.muted,
    });
    paletteOverlay.add(inp);
    paletteInput = inp;

    paletteResults = [...COMMANDS];
    const sel = new SelectRenderable(renderer, {
      id: 'palette-sel', width: PW - 4, height: Math.max(4, PH - 5),
      options: buildPaletteOptions(paletteResults), selectedIndex: 0,
      showScrollIndicator: true,
      backgroundColor: C.bgPanel, focusedBackgroundColor: C.bgPanel, focusedTextColor: C.white,
      selectedBackgroundColor: C.bgFocus, selectedTextColor: C.yellow,
      showDescription: true, descriptionColor: C.muted, selectedDescriptionColor: C.cyan,
    });
    paletteOverlay.add(sel);
    paletteSelect = sel;

    renderer.root.add(paletteOverlay);
    mode = 'PALETTE';
    updateFooter();
    inp.focus();

    inp.on('input', () => {
      paletteResults = fuzzyMatch(inp.value ?? '', COMMANDS);
      try {
        sel.options = buildPaletteOptions(paletteResults);
      } catch {}
    });
    inp.on('change', () => {
      paletteResults = fuzzyMatch(inp.value ?? '', COMMANDS);
      try {
        sel.options = buildPaletteOptions(paletteResults);
      } catch {}
    });
  }

  function hidePalette(): void {
    if (!paletteOverlay) return;
    try { paletteInput?.blur(); } catch {}
    try { paletteSelect?.blur(); } catch {}
    try { renderer.root.remove('palette-overlay'); } catch {}
    paletteOverlay = null;
    paletteInput = null;
    paletteSelect = null;
  }

  async function runSelectedPaletteCommand(): Promise<void> {
    const idx = paletteSelect?.getSelectedIndex?.() ?? 0;
    const cmd = paletteResults[idx];
    if (!cmd) return;
    hidePalette();
    mode = 'NAV';
    // Restore nav focus before running (in case it's instant)
    try { nav.focus(); } catch {}
    updateFooter();
    await runCommandInLog(cmd);
  }

  // ── Section renderers (unchanged from original) ────────────────────────────
  let catalogInput: any = null;
  let catalogSelect: any = null;
  let catalogResults: any[] = [];
  let catalogStatus = '';

  function clearContent() {
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
  // SelectRenderable option names must be plain strings — the widget styles the
  // selected row itself. Interpolating fg()/styled fragments here renders as
  // "[object Object]" (regression fixed: keep tag/badge as plain text).
  function refreshCatalogResults(query: string) {
    catalogResults = searchCatalog(forgeRoot, root, query);
    const options = catalogResults.map((it: any, i: number) => {
      const mark = it.installed ? '✓ ' : '  ';
      const tag = '[' + it.type + ']';
      const installedBadge = it.installed ? ' [instalado]' : '';
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
    // Entering catalog section starts in FILTER mode (input focused)
    mode = 'FILTER';
    updateFooter();
  }

  function renderSection(idx: number) {
    // When switching sections, always reset to NAV mode first.
    mode = 'NAV';
    hideHelp();
    const value = SECTIONS[idx]?.value ?? 'config';
    if (value === 'skills') { renderSkillsSection(); updateFooter(); return; }
    if (value === 'catalog') { renderCatalogSection(); return; }  // renderCatalogSection sets mode
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
    updateFooter();
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
    if (SECTIONS[i]?.value === 'catalog' && catalogInput) { try { catalogInput.focus(); } catch {} }
  });

  // ── Key dispatcher — routed by mode (SPEC-059 PR1/PR3/PR4) ───────────────────
  return new Promise<void>((resolve) => {
    const handler = (key: any) => {
      const name = (key?.name ?? '').toLowerCase();
      const sequence = key?.sequence ?? '';

      // If the help overlay is open, only ? and Esc close it; everything else is blocked.
      if (helpOverlay) {
        if (name === '?' || name === 'escape') hideHelp();
        return;
      }

      // ── Mode: LOG ────────────────────────────────────────────────────────────
      if (mode === 'LOG') {
        if (name === 'escape') {
          hideLogPane();
          mode = 'NAV';
          try { nav.focus(); } catch {}
          updateFooter();
        }
        // All keys are blocked in LOG mode except Esc
        return;
      }

      // ── Mode: PALETTE ────────────────────────────────────────────────────────
      if (mode === 'PALETTE') {
        if (name === 'escape') {
          hidePalette();
          mode = 'NAV';
          try { nav.focus(); } catch {}
          updateFooter();
          return;
        }
        if (name === 'return' || name === 'enter') {
          // Run is async — fire and forget inside the handler
          runSelectedPaletteCommand().catch(() => {});
          return;
        }
        if (name === 'tab') {
          // Tab cycles: input → select → input
          const inFocused = paletteInput && paletteInput.focused;
          if (inFocused) {
            try { paletteInput.blur(); paletteSelect?.focus(); } catch {}
          } else {
            try { paletteSelect?.blur(); paletteInput?.focus(); } catch {}
          }
          return;
        }
        // All other keys are consumed by the focused palette widget naturally.
        return;
      }

      // ── Mode: FILTER (active input widget) ──────────────────────────────────
      if (mode === 'FILTER') {
        const inputFocused = (catalogInput && catalogInput.focused) || false;
        const listFocused  = (catalogSelect && catalogSelect.focused) || false;

        if (name === 'escape') {
          // Esc exits FILTER → NAV, focus back to nav
          try { catalogInput?.blur(); } catch {}
          try { catalogSelect?.blur(); } catch {}
          try { nav.focus(); } catch {}
          mode = 'NAV';
          updateFooter();
          return;
        }
        if (name === 'tab') {
          // Tab cycles: input → list → nav → input
          if (inputFocused) {
            try { catalogInput.blur(); catalogSelect.focus(); } catch {}
          } else if (listFocused) {
            try { catalogSelect.blur(); nav.focus(); } catch {}
            mode = 'NAV';
            updateFooter();
          } else {
            try { catalogInput?.focus(); } catch {}
            mode = 'FILTER';
            updateFooter();
          }
          return;
        }
        // All other keys are consumed by the focused widget naturally — no action needed.
        return;
      }

      // ── Mode: NAV (default) ─────────────────────────────────────────────────
      if (mode === 'NAV') {
        if (name === 'q' || name === 'escape') {
          offKey(renderer, handler);
          resolve();
          return;
        }
        if (name === '?') {
          toggleHelp();
          return;
        }
        // ':' key opens the command palette (SPEC-059 PR4)
        if (sequence === ':' || name === ':') {
          showPalette();
          return;
        }
        if (name === 'tab') {
          const sec = getCurrentSection();
          if (sec === 'catalog' && catalogInput) {
            try { catalogInput.focus(); } catch {}
            mode = 'FILTER';
            updateFooter();
          }
          return;
        }
        // No other NAV keys need interception — nav widget handles ↑↓/Enter.
        return;
      }

      // ── Mode: CONFIRM: reserved for future destructive action confirmation ──
    };
    onKey(renderer, handler);
  });
}
