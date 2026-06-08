/**
 * forge post-install dashboard — OpenTUI panels (Bun runtime only).
 * Navigable sections explaining the project, agents, SDD workflow, skills,
 * runtimes (with install commands) and detected tech icons.
 */
// @ts-nocheck — OpenTUI types; Bun-only module
import {
  createCliRenderer,
  BoxRenderable,
  Text,
  SelectRenderable,
  t,
  fg,
  bold as otBold,
  dim as otDim,
} from '@opentui/core';
import { VERSION } from '../version.js';
import { runtimeIds } from '../lib/generators/registry.js';
import { tuiBorderChars } from '../ui/ascii.js';
import { FORGE_BANNER } from '../ui/banner.js';
import { THEME, bannerRowColor } from '../ui/theme.js';

/**
 * Restore the terminal to a sane state. OpenTUI enables alt-screen, mouse
 * reporting, focus tracking and bracketed paste on `createCliRenderer`; if the
 * renderer ever fails to clean up (a throw, a partial init), those modes leak
 * into the user's shell as ANSI garbage. We always emit the reset sequences as
 * a belt-and-suspenders safeguard after destroying the renderer.
 */
function restoreTerminal(): void {
  try {
    process.stdout.write(
      '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l' + // disable mouse reporting
      '\x1b[?1004l' +                                   // disable focus tracking
      '\x1b[?2004l' +                                   // disable bracketed paste
      '\x1b[?1049l' +                                   // leave alt screen
      '\x1b[?25h'                                       // show cursor
    );
  } catch {}
}

export interface DashboardData {
  projectName: string;
  runtime: 'claude-code' | 'opencode' | 'codex' | 'kiro';
  mode: string;
  language: string;
  agents: string[];
  profiles: string[];
  stack: {
    backend?: string; frontend?: string; database?: string;
    orm?: string; testing?: string[]; packageManager?: string;
  };
}

// ─── Palette + styled-text helpers (same rules as wizard) ────────────────────
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

// ─── Static data ──────────────────────────────────────────────────────────────
const AGENT_INFO: Record<string, { tier: number; role: string; when: string; model: string }> = {
  'orchestrator':        { tier: 1, model: 'opus',   role: 'Lead — coordina el team, delega y sintetiza', when: 'Inicio de toda sesión no trivial' },
  'backend-engineer':    { tier: 1, model: 'sonnet', role: 'Implementa API, DB y lógica de negocio',      when: 'Cambios en backend / endpoints' },
  'api-engineer':        { tier: 2, model: 'sonnet', role: 'API específica al stack',                     when: 'Endpoints en el stack del profile' },
  'frontend-engineer':   { tier: 1, model: 'sonnet', role: 'Implementa UI, componentes y páginas',        when: 'Cambios en frontend' },
  'admin-engineer':      { tier: 2, model: 'sonnet', role: 'UI de administración (Next.js + shadcn)',     when: 'Dashboards / paneles internos' },
  'mobile-engineer':     { tier: 2, model: 'sonnet', role: 'Pantallas móviles (Expo / RN)',               when: 'Features móviles' },
  'fullstack-engineer':  { tier: 2, model: 'sonnet', role: 'Features end-to-end del stack',               when: 'Trabajo full-stack (Rails/Laravel)' },
  'test-engineer':       { tier: 1, model: 'sonnet', role: 'Tests unit / integración / E2E',              when: 'Tras implementar, antes de /ship' },
  'docs-writer':         { tier: 1, model: 'sonnet', role: 'Mantiene specs, ADRs y READMEs',              when: 'Al cerrar feature o cambiar contratos' },
  'compliance-reviewer': { tier: 1, model: 'opus',   role: 'Revisa PRs vs compliance — tiene veto',       when: 'Antes de mergear (enterprise)' },
  'security-auditor':    { tier: 1, model: 'opus',   role: 'Audita auth, inyección y dependencias',       when: 'Endpoints nuevos o cambios de auth' },
  'migration-specialist':{ tier: 2, model: 'sonnet', role: 'Migraciones de versión de framework',         when: 'Upgrades mayores (ej: L6→L13)' },
  'scanner-engineer':    { tier: 2, model: 'sonnet', role: 'Scraping / crawling estructurado',            when: 'Extracción de datos' },
};

const WORKFLOW = [
  ['1', '/session-start', 'Carga project.yaml + estado, abre la sesión'],
  ['2', '/plan',          'Convierte la idea en una spec (docs/specs/)'],
  ['3', '/work',          'Implementa la spec; orchestrator delega'],
  ['4', '/review',        'Revisión de código + security/compliance'],
  ['5', '/ship',          'PR + deploy-check; no cierra hasta READY'],
  ['6', '/session-close', 'Resume el trabajo, actualiza notas, cierra'],
];

const SKILLS = [
  ['/spec',           'Redacta specs siguiendo la plantilla forge',         'antes de escribir una spec'],
  ['/new-feature',    'Checklist de feature de plan a deploy',              '"nueva feature", "implementar"'],
  ['/security-audit', 'Checklist de seguridad para endpoints y auth',       '"auditar seguridad"'],
  ['/db-migrate',     'Migración segura (Prisma/Drizzle/AR/Alembic/Goose)', '"migrar schema"'],
  ['/browser-test',   'Verifica UI en navegador y captura evidencia',       '"screenshot de", "open <url>"'],
  ['/local2prod',     'Deploy a prod; no termina hasta READY/SUCCESS',      '"publicar", "deploy"'],
  ['/wiki-ingest',    'Ingesta una fuente al wiki del proyecto',            '"agregar al wiki"'],
  ['/wiki-query',     'Responde citando el wiki del proyecto',              '"¿qué dice el wiki sobre…"'],
  ['/wiki-lint',      'Verifica integridad del wiki (links, huérfanos)',    '"verificar wiki"'],
  ['/aitmpl-search',  'Busca en el catálogo de frameworks/MCP/profiles',    '"buscar templates/MCP"'],
];

const RUNTIMES = [
  { id: 'claude-code', label: 'Claude Code', cmd: ['claude', '--version'],   install: 'npm i -g @anthropic-ai/claude-code' },
  { id: 'opencode',    label: 'OpenCode',    cmd: ['opencode', '--version'], install: 'npm i -g opencode-ai' },
  { id: 'codex',       label: 'Codex CLI',   cmd: ['codex', '--version'],    install: 'npm i -g @openai/codex' },
  { id: 'kiro',        label: 'Kiro IDE',    cmd: ['kiro', '--version'],     install: 'descargar desde kiro.dev' },
];

type IconEntry = { emoji: string; nerd: string; color: string; label: string };
const TECH_ICONS: Record<string, IconEntry> = {
  typescript: { emoji: '🟦', nerd: '', color: '#3178c6', label: 'TypeScript' },
  javascript: { emoji: '🟨', nerd: '', color: '#f7df1e', label: 'JavaScript' },
  python:     { emoji: '🐍', nerd: '', color: '#3776ab', label: 'Python' },
  ruby:       { emoji: '💎', nerd: '', color: '#cc342d', label: 'Ruby' },
  go:         { emoji: '🐹', nerd: '', color: '#00add8', label: 'Go' },
  php:        { emoji: '🐘', nerd: '', color: '#777bb4', label: 'PHP' },
  hono:       { emoji: '🔥', nerd: '', color: '#e36002', label: 'Hono' },
  express:    { emoji: '🚂', nerd: '', color: '#68a063', label: 'Express' },
  nestjs:     { emoji: '🐈', nerd: '', color: '#e0234e', label: 'NestJS' },
  fastify:    { emoji: '⚡', nerd: '', color: '#ffffff', label: 'Fastify' },
  fastapi:    { emoji: '⚡', nerd: '', color: '#009688', label: 'FastAPI' },
  django:     { emoji: '🎸', nerd: '', color: '#092e20', label: 'Django' },
  rails:      { emoji: '🛤️', nerd: '', color: '#cc0000', label: 'Rails' },
  laravel:    { emoji: '🅻', nerd: '', color: '#ff2d20', label: 'Laravel' },
  'go-gin':   { emoji: '🍸', nerd: '', color: '#00add8', label: 'Gin' },
  nextjs:     { emoji: '▲',  nerd: '', color: '#ffffff', label: 'Next.js' },
  astro:      { emoji: '🚀', nerd: '', color: '#ff5d01', label: 'Astro' },
  nuxt:       { emoji: '💚', nerd: '', color: '#00dc82', label: 'Nuxt' },
  sveltekit:  { emoji: '🧡', nerd: '', color: '#ff3e00', label: 'SvelteKit' },
  postgresql: { emoji: '🐘', nerd: '', color: '#336791', label: 'PostgreSQL' },
  mysql:      { emoji: '🐬', nerd: '', color: '#4479a1', label: 'MySQL' },
  sqlite:     { emoji: '🪶', nerd: '', color: '#003b57', label: 'SQLite' },
  drizzle:    { emoji: '🌧️', nerd: '', color: '#c5f74f', label: 'Drizzle ORM' },
  prisma:     { emoji: '◭',  nerd: '', color: '#2d3748', label: 'Prisma' },
  typeorm:    { emoji: '🗃️', nerd: '', color: '#fe0902', label: 'TypeORM' },
  sqlalchemy: { emoji: '🧪', nerd: '', color: '#d71f00', label: 'SQLAlchemy' },
  vitest:     { emoji: '⚡', nerd: '', color: '#6e9f18', label: 'Vitest' },
  jest:       { emoji: '🤡', nerd: '', color: '#c21325', label: 'Jest' },
  playwright: { emoji: '🎭', nerd: '', color: '#2ead33', label: 'Playwright' },
  cypress:    { emoji: '🌲', nerd: '', color: '#17202c', label: 'Cypress' },
  pytest:     { emoji: '🧪', nerd: '', color: '#3776ab', label: 'pytest' },
  pnpm:       { emoji: '📦', nerd: '', color: '#f9ad00', label: 'pnpm' },
  npm:        { emoji: '📦', nerd: '', color: '#cb3837', label: 'npm' },
  yarn:       { emoji: '📦', nerd: '', color: '#2c8ebb', label: 'yarn' },
  bun:        { emoji: '🥟', nerd: '', color: '#fbf0df', label: 'bun' },
};

function iconMode(): 'nerd' | 'emoji' {
  if (process.env.FORGE_ICONS === 'nerd') return 'nerd';
  if (process.env.FORGE_ICONS === 'emoji') return 'emoji';
  const tp = process.env.TERM_PROGRAM ?? '';
  if (/ghostty|wezterm|kitty|iterm/i.test(tp)) return 'nerd';
  return 'emoji';
}
const pickIcon = (key: string, mode: 'nerd' | 'emoji') => {
  const e = TECH_ICONS[key];
  if (!e) return mode === 'nerd' ? '' : '▫';
  return mode === 'nerd' ? e.nerd : e.emoji;
};

// Live runtime detection (cached)
let runtimeStatus: Record<string, { installed: boolean; version: string }> | null = null;
function detectRuntimes(): Record<string, { installed: boolean; version: string }> {
  if (runtimeStatus) return runtimeStatus;
  const result: Record<string, { installed: boolean; version: string }> = {};
  for (const rt of RUNTIMES) {
    try {
      const proc = (globalThis as any).Bun.spawnSync(rt.cmd, { stdout: 'pipe', stderr: 'pipe' });
      const out = (proc.stdout ? new TextDecoder().decode(proc.stdout) : '').trim();
      result[rt.id] = { installed: proc.exitCode === 0, version: out.split(/\r?\n/)[0].slice(0, 20) };
    } catch {
      result[rt.id] = { installed: false, version: '' };
    }
  }
  runtimeStatus = result;
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function runPostInstallDashboard(data: DashboardData): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  try {
    await runDashboardLoop(renderer, data);
  } finally {
    // Always tear down — even if the section renderers throw — so the terminal
    // never leaks alt-screen / mouse-reporting modes into the shell.
    try { renderer.destroy(); } catch {}
    restoreTerminal();
  }
}

async function runDashboardLoop(renderer: any, data: DashboardData): Promise<void> {
  const icons = iconMode();

  const W = renderer.root.width ?? process.stdout.columns ?? 120;
  const H = renderer.root.height ?? process.stdout.rows ?? 40;
  // Header holds the 6-line FORGE banner + a status line → 7 rows + border.
  const HEADER_H = 9, BOTTOM_H = 2;
  const BODY_H = H - HEADER_H - BOTTOM_H - 2;
  const LEFT_W = Math.max(26, Math.floor(W * 0.28));
  const RIGHT_W = W - LEFT_W - 1;

  // Header
  const header = new BoxRenderable(renderer, {
    id: 'hdr', position: 'absolute', left: 0, top: 0, width: W, height: HEADER_H,
    border: true, customBorderChars: tuiBorderChars(), borderStyle: 'double', borderColor: C.cyan, backgroundColor: C.bg,
    flexDirection: 'column', paddingLeft: 1, paddingTop: 0,
  });
  // FORGE banner (cyan) + single status line.
  header.add(Text({ id: 'hdr-t', content: buildLines([
    ...FORGE_BANNER.map((l, i) => fg(bannerRowColor(i))(l)),
    [otDim('v' + VERSION + '  '), fg(C.green)('✔ installed'), otDim(' · ' + data.runtime + ' · ' + data.mode + ' · '), fg(C.muted)(data.projectName)],
  ]) }));
  renderer.root.add(header);

  // Nav (left) — SelectRenderable
  const navPanel = new BoxRenderable(renderer, {
    id: 'nav', position: 'absolute', left: 0, top: HEADER_H + 1, width: LEFT_W, height: BODY_H,
    border: true, customBorderChars: tuiBorderChars(), borderStyle: 'single', borderColor: C.dim, backgroundColor: C.bgPanel,
    title: ' Sections ', flexDirection: 'column', paddingLeft: 1, paddingTop: 1,
  });
  renderer.root.add(navPanel);

  const SECTIONS = [
    o('Overview',       'overview', 'qué es forge'),
    o('Your agents',    'agents',   `${data.agents.length} instalados`),
    o('Workflow (SDD)', 'workflow', 'spec → ship'),
    o('Skills',         'skills',   'disponibles + triggers'),
    o('Runtimes',       'runtimes', 'instalados / faltantes'),
    o('Icons / Tech',   'tech',     'stack detectado'),
  ];

  const nav = new SelectRenderable(renderer, {
    id: 'nav-sel', width: LEFT_W - 4, height: BODY_H - 3,
    options: SECTIONS, selectedIndex: 0,
    itemSpacing: 1, showScrollIndicator: true,
    // Highlighted (cursor) row gets the bright background; others stay on panel.
    backgroundColor: C.bgPanel, focusedBackgroundColor: C.bgPanel, focusedTextColor: C.white,
    selectedBackgroundColor: '#1e3a5f', selectedTextColor: C.yellow,
    showDescription: true, descriptionColor: C.muted, selectedDescriptionColor: C.cyan,
  });
  navPanel.add(nav);

  // Content (right)
  const content = new BoxRenderable(renderer, {
    id: 'cnt', position: 'absolute', left: LEFT_W + 1, top: HEADER_H + 1, width: RIGHT_W, height: BODY_H,
    border: true, customBorderChars: tuiBorderChars(), borderStyle: 'single', borderColor: C.cyan, backgroundColor: C.bg,
    flexDirection: 'column', paddingLeft: 1, paddingRight: 1, paddingTop: 1,
  });
  renderer.root.add(content);

  // Bottom
  const bottom = new BoxRenderable(renderer, {
    id: 'btm', position: 'absolute', left: 0, top: H - BOTTOM_H, width: W, height: BOTTOM_H,
    backgroundColor: C.bgPanel, paddingLeft: 1,
  });
  bottom.add(Text({ id: 'btm-t', content: buildLines([dimLeaf('[↑↓] Sección   [Enter] Abrir   [q/Esc] Salir al shell')]) }));
  renderer.root.add(bottom);

  // ── Section renderers ──
  function clearContent() {
    for (const child of [...content.getChildren()]) {
      try { content.remove(child.id ?? ''); } catch {}
    }
  }

  function rowsOverview(): Row[] {
    return [
      boldCol(C.white, 'forge — configura cualquier proyecto para agentes IA'),
      '',
      fg(C.muted)('Convierte un repo en un entorno donde agentes especializados'),
      fg(C.muted)('trabajan con guardrails, memoria y un workflow estructurado (SDD).'),
      '',
      boldCol(C.cyan, 'Los 5 layers:'),
      ['  ', fg(C.cyan)('◆ '), boldCol(C.yellow, 'Memory'),       '       ', fg(C.muted)('project.yaml + CLAUDE.md → contexto')],
      ['  ', fg(C.cyan)('◆ '), boldCol(C.yellow, 'Knowledge'),    '    ', fg(C.muted)('docs/specs, wiki, architecture.rules')],
      ['  ', fg(C.cyan)('◆ '), boldCol(C.yellow, 'Guardrail'),    '    ', fg(C.muted)('hooks → impiden cambios fuera de scope')],
      ['  ', fg(C.cyan)('◆ '), boldCol(C.yellow, 'Delegation'),   '   ', fg(C.muted)('agentes tier-1/2 con scope acotado')],
      ['  ', fg(C.cyan)('◆ '), boldCol(C.yellow, 'Distribution'), ' ', fg(C.muted)(`1 project.yaml → ${runtimeIds().length} runtimes`)],
      '',
      ['Modo: ', boldCol(C.green, data.mode), fg(C.muted)('   ·   Lenguaje: '), boldCol(C.white, data.language), fg(C.muted)('   ·   Runtime: '), boldCol(C.cyan, data.runtime)],
    ];
  }

  function rowsAgents(): Row[] {
    const rows: Row[] = [boldCol(C.white, `Agentes instalados (${data.agents.length})`), ''];
    for (const a of data.agents) {
      const info = AGENT_INFO[a];
      const tier = info?.tier ?? 2;
      const badge = tier === 1 ? fg(C.cyan)('[core]   ') : fg(C.yellow)('[profile]');
      const model = info?.model ?? '';
      rows.push(['  ', badge, ' ', boldCol(C.white, a)]);
      rows.push(['         ', fg(C.muted)(info?.role ?? 'Agente de stack'), model ? dimLeaf('   · ' + model) : '']);
      rows.push(['         ', fg(C.green)('usar: '), fg(C.muted)(info?.when ?? 'según el stack del profile')]);
    }
    return rows;
  }

  function rowsWorkflow(): Row[] {
    const rows: Row[] = [boldCol(C.white, 'Flujo Spec-Driven Development (SDD)'), ''];
    for (const [n, cmd, desc] of WORKFLOW) {
      rows.push(['  ', boldCol(C.cyan, ` ${n} `), ' ', boldCol(C.yellow, (cmd as string).padEnd(16)), fg(C.muted)(desc as string)]);
    }
    rows.push('');
    rows.push(boldCol(C.white, 'Atajos:'));
    rows.push(['  ', boldCol(C.yellow, '/new-feature'.padEnd(16)), fg(C.muted)('orquesta plan → work → review → ship')]);
    rows.push(['  ', boldCol(C.yellow, '/deploy-check'.padEnd(16)), fg(C.muted)('valida deploy en estado READY')]);
    return rows;
  }

  function rowsSkills(): Row[] {
    const rows: Row[] = [boldCol(C.white, 'Skills disponibles'), ''];
    for (const [cmd, desc, trig] of SKILLS) {
      rows.push(['  ', boldCol(C.cyan, (cmd as string).padEnd(16)), fg(C.white)(desc as string)]);
      rows.push(['                  ', dimLeaf('trigger: ' + trig)]);
    }
    return rows;
  }

  function rowsRuntimes(): Row[] {
    const status = detectRuntimes();
    const rows: Row[] = [boldCol(C.white, 'Runtimes de IA'), ''];
    for (const rt of RUNTIMES) {
      const st = status[rt.id];
      const active = rt.id === data.runtime;
      if (st?.installed) {
        rows.push(['  ', fg(C.green)('✔ '), boldCol(C.white, rt.label.padEnd(14)), dimLeaf(st.version || 'instalado'), active ? fg(C.cyan)('   ● active') : '']);
      } else {
        rows.push(['  ', fg(C.muted)('○ '), fg(C.muted)(rt.label.padEnd(14)), dimLeaf('no instalado'), active ? fg(C.cyan)('   ● active') : '']);
        rows.push(['      ', fg(C.yellow)('install: '), dimLeaf(rt.install)]);
      }
    }
    rows.push('');
    rows.push(dimLeaf('Copiá el comando install para agregar un runtime.'));
    return rows;
  }

  function rowsTech(): Row[] {
    const rows: Row[] = [boldCol(C.white, 'Stack detectado'), ''];
    const add = (key: string | undefined, role: string) => {
      if (!key) return;
      const e = TECH_ICONS[key];
      const ic = pickIcon(key, icons);
      const label = e?.label ?? key;
      const color = e?.color ?? C.white;
      rows.push(['  ', boldCol(color, ic + ' '), '  ', boldCol(C.white, label.padEnd(16)), fg(C.muted)(role)]);
    };
    add(data.language, 'lenguaje principal');
    add(data.stack.backend, 'backend');
    add(data.stack.frontend, 'frontend');
    add(data.stack.database, 'database');
    add(data.stack.orm, 'orm');
    for (const tf of data.stack.testing ?? []) add(tf, 'testing');
    add(data.stack.packageManager, 'package manager');
    if (rows.length === 2) rows.push(fg(C.muted)('(sin stack detectado en project.yaml)'));
    rows.push('');
    rows.push(dimLeaf(icons === 'emoji' ? 'FORGE_ICONS=nerd para glifos Nerd Font' : 'usando glifos Nerd Font'));
    return rows;
  }

  function renderSection(idx: number) {
    clearContent();
    let rows: Row[];
    switch (SECTIONS[idx].value) {
      case 'overview': rows = rowsOverview(); break;
      case 'agents':   rows = rowsAgents(); break;
      case 'workflow': rows = rowsWorkflow(); break;
      case 'skills':   rows = rowsSkills(); break;
      case 'runtimes': rows = rowsRuntimes(); break;
      case 'tech':     rows = rowsTech(); break;
      default:         rows = rowsOverview();
    }
    // Truncate to fit the body height
    const maxRows = BODY_H - 2;
    if (rows.length > maxRows) {
      rows = rows.slice(0, maxRows - 1);
      rows.push(dimLeaf(`… +${0} more (scroll no disponible)`));
    }
    content.add(Text({ id: 'sec', content: buildLines(rows) }));
  }

  // Initial render
  renderSection(0);
  nav.focus();

  // OpenTUI's SelectRenderable emits (index, option) and exposes no
  // `selectedIndex` getter (only a setter + getSelectedIndex()). Reading
  // `nav.selectedIndex` returned undefined → every section rendered as index 0,
  // so the right panel never changed. Use the emitted index instead, falling
  // back to getSelectedIndex().
  const sectionIdx = (idx: any): number =>
    typeof idx === 'number' ? idx : (nav.getSelectedIndex?.() ?? 0);
  // selectionChanged → live update while navigating with ↑↓.
  // itemSelected → update on Enter.
  nav.on('selectionChanged', (idx: any) => renderSection(sectionIdx(idx)));
  nav.on('itemSelected',     (idx: any) => renderSection(sectionIdx(idx)));

  // Exit on q / Esc. Teardown (renderer.destroy + terminal restore) happens in
  // the caller's finally block, so the handler only detaches itself + resolves.
  return new Promise<void>((resolve) => {
    const handler = (key: any) => {
      const name = (key?.name ?? '').toLowerCase();
      if (name === 'q' || name === 'escape') {
        try { renderer._internalKeyInput?.offInternal?.('keypress', handler); } catch {}
        resolve();
      }
    };
    try { renderer._internalKeyInput.onInternal('keypress', handler); } catch {}
  });
}
