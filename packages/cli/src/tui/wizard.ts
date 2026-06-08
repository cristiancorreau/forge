/**
 * forge interactive wizard — OpenTUI panels (Bun runtime only).
 * Widgets are CHILDREN of panels (flex column layout), not absolute positioned.
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
import type { WizardResult } from '../lib/wizard.js';
import { tuiBorderChars } from '../ui/ascii.js';
import { detectStack } from '../lib/detect.js';
import { runtimeIds } from '../lib/generators/registry.js';
import { VERSION } from '../version.js';
import { FORGE_BANNER } from '../ui/banner.js';
import { THEME, bannerRowColor } from '../ui/theme.js';
import {
  type ProjectType,
  hasBackend, hasFrontend, hasMobile,
  backendFrameworksFor, frontendFrameworksFor, mobileFrameworksFor,
  deriveProjectLanguage,
} from '../lib/wizard-flow.js';

/**
 * Restore the terminal to a sane state. OpenTUI enables alt-screen, mouse
 * reporting, focus tracking and bracketed paste on `createCliRenderer`; if those
 * modes leak into the shell they show up as ANSI garbage. Always emit the reset
 * sequences after destroying the renderer as a safeguard.
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

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = THEME;

// OpenTUI native styled text — NEVER embed raw ANSI escape codes in Text content,
// OpenTUI computes layout width from the string and raw \x1b[...m sequences break it.
// Composing helpers like fg()(bold()) can yield a StyledText with undefined chunks;
// wrapping any value in t`${x}` normalizes it into a valid StyledText.
// bold + color as a single "leaf" styled value. Leaves (fg()/bold()/dim()) can
// be interpolated into a t-template; t-template RESULTS cannot (they stringify
// to "[object Object]"). So everything below builds ONE t() call from leaves.
const boldCol = (hex: string, s: string) => fg(hex)(otBold(s));
const dimLeaf = (s: string) => otDim(s);

type Part = string | any;          // string literal or leaf StyledText
type Row = Part | Part[];          // a line = one part or several parts

// Build a multi-line StyledText from rows of parts as a SINGLE tagged-template
// call. Newlines are inserted between rows; leaves become interpolated values.
const buildLines = (rows: Row[]) => {
  const strings: any[] = [];
  const values: any[] = [];
  let pending = '';
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

const STEPS = [
  'Project name','Project type',
  'Backend','Frontend','Mobile','Database','ORM',
  'Package manager','Testing','Mode','Runtime','Confirm',
];

// ─── Options ─────────────────────────────────────────────────────────────────
const o = (name: string, value: string, description = '') => ({ name, value, description });

const PROJECT_TYPES = [
  o('Solo Frontend', 'frontend', 'UI / SPA / SSR'),
  o('Solo Backend',  'backend',  'API / servicio'),
  o('Fullstack',     'fullstack','frontend + backend (pueden diferir)'),
  o('Mobile',        'mobile',   'app iOS/Android (Flutter, React Native)'),
];

// Per-side language pickers. Backend supports every language; frontend is
// TypeScript/JS today. The framework picker is FILTERED by the chosen language.
const BACKEND_LANGS = [
  o('TypeScript','typescript','Recommended'), o('Python','python',''),
  o('Java','java',''), o('Kotlin','kotlin',''), o('Rust','rust',''),
  o('Ruby','ruby',''), o('Go','go',''), o('PHP','php',''),
];
const FRONTEND_LANGS = [o('TypeScript / JavaScript','typescript','Recommended')];
const MOBILE_LANGS = [
  o('Dart','dart','Flutter'),
  o('TypeScript / JavaScript','typescript','React Native / Expo'),
];

const BACKEND_META: Record<string, { name: string; desc: string }> = {
  hono:    { name: 'Hono',    desc: 'Edge-ready, ultralight' },
  express: { name: 'Express', desc: 'The classic' },
  nestjs:  { name: 'NestJS',  desc: 'Enterprise' },
  fastify: { name: 'Fastify', desc: 'High performance' },
  fastapi: { name: 'FastAPI', desc: 'Async' },
  flask:   { name: 'Flask',   desc: 'Micro-framework' },
  django:  { name: 'Django',  desc: 'Batteries included' },
  springboot: { name: 'Spring Boot', desc: 'JVM, enterprise' },
  axum:    { name: 'Axum',    desc: 'Tokio, async' },
  actix:   { name: 'Actix-web', desc: 'High performance' },
  rocket:  { name: 'Rocket',  desc: 'Ergonomic' },
  rails:   { name: 'Rails',   desc: 'Full-stack' },
  'go-gin': { name: 'Gin',    desc: 'Fast router' },
  laravel: { name: 'Laravel', desc: 'Full-stack PHP' },
};
const FRONTEND_META: Record<string, { name: string; desc: string }> = {
  nextjs:    { name: 'Next.js',   desc: 'Fullstack React' },
  astro:     { name: 'Astro',     desc: 'Content-first' },
  sveltekit: { name: 'SvelteKit', desc: 'Svelte' },
  nuxt:      { name: 'Nuxt',      desc: 'Vue' },
};
const MOBILE_META: Record<string, { name: string; desc: string }> = {
  flutter:        { name: 'Flutter',      desc: 'Dart, cross-platform' },
  'react-native': { name: 'React Native', desc: 'TypeScript/JS' },
  expo:           { name: 'Expo',         desc: 'Managed React Native' },
};

/** Backend framework picker for a language + the "None / other" escape. */
function backendOptionsFor(language: string): any[] {
  const opts = backendFrameworksFor(language).map(v =>
    o(BACKEND_META[v]?.name ?? v, v, BACKEND_META[v]?.desc ?? ''));
  opts.push(o('None / other', 'none', ''));
  return opts;
}
function frontendOptionsFor(language: string): any[] {
  const opts = frontendFrameworksFor(language).map(v =>
    o(FRONTEND_META[v]?.name ?? v, v, FRONTEND_META[v]?.desc ?? ''));
  opts.push(o('None / other', 'none', ''));
  return opts;
}
function mobileOptionsFor(language: string): any[] {
  const opts = mobileFrameworksFor(language).map(v =>
    o(MOBILE_META[v]?.name ?? v, v, MOBILE_META[v]?.desc ?? ''));
  opts.push(o('None / other', 'none', ''));
  return opts;
}

const DATABASES = [o('PostgreSQL','postgresql','Recommended'), o('MySQL','mysql',''), o('SQLite','sqlite','Dev/embedded'), o('None','none','')];
const ORMS: Record<string, any[]> = {
  typescript: [o('Drizzle ORM','drizzle','Lightweight, type-safe'), o('Prisma','prisma','Full ORM'), o('TypeORM','typeorm',''), o('None','none','')],
  python:     [o('SQLAlchemy','sqlalchemy',''), o('None','none','')],
  ruby:       [o('Active Record','active-record',''), o('None','none','')],
};
const PKG: Record<string, any[]> = {
  typescript: [o('pnpm','pnpm','Recommended'), o('npm','npm',''), o('yarn','yarn',''), o('bun','bun','Ultra-fast')],
  python:     [o('pip','pip',''), o('poetry','poetry','')],
  java:       [o('Maven','maven',''), o('Gradle','gradle','')],
  kotlin:     [o('Gradle','gradle',''), o('Maven','maven','')],
  rust:       [o('Cargo','cargo','')],
  dart:       [o('pub','pub','Dart/Flutter')],
  ruby:       [o('bundler','bundler','')],
  go:         [o('go modules','go','')],
  php:        [o('composer','composer','')],
};
const TESTING: Record<string, any[]> = {
  typescript: [o('Vitest','vitest','Unit+integration'), o('Jest','jest',''), o('Playwright','playwright','E2E'), o('Cypress','cypress','E2E'), o('None','none','Skip')],
  python:     [o('pytest','pytest',''), o('None','none','Skip')],
  ruby:       [o('RSpec','rspec',''), o('None','none','Skip')],
  php:        [o('PHPUnit','phpunit',''), o('None','none','Skip')],
};
const MODES = [
  o('startup',    'startup',    'Minimal — small team'),
  o('standard',   'standard',  'CI/CD, code review, testing'),
  o('enterprise', 'enterprise','Compliance, multi-team, audits'),
];
const RUNTIMES = [o('Claude Code','claude-code','Recommended'), o('OpenCode','opencode',''), o('Codex CLI','codex',''), o('Kiro IDE','kiro','')];
const PROFILE_MAP: Record<string,string> = { hono:'hono-drizzle', nextjs:'nextjs-admin', astro:'astro', fastapi:'fastapi', rails:'rails', laravel:'laravel', expo:'expo', springboot:'springboot', flutter:'flutter', flask:'flask', axum:'rust', actix:'rust', rocket:'rust' };
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function runOpenTUIWizard(): Promise<WizardResult | null> {
  const detected = detectStack(process.cwd());
  const renderer = await createCliRenderer({ exitOnCtrlC: true });

  const W = renderer.root.width  ?? process.stdout.columns  ?? 120;
  const H = renderer.root.height ?? process.stdout.rows     ?? 40;

  // Header holds the 6-line FORGE banner + a tagline → 7 content rows + border.
  const HEADER_H = 9;
  const BOTTOM_H = 2;
  const BODY_H   = H - HEADER_H - BOTTOM_H - 2;
  const LEFT_W   = Math.max(24, Math.floor(W * 0.25));
  const RIGHT_W  = W - LEFT_W - 1;

  // ── Header panel ──
  const header = new BoxRenderable(renderer, {
    id: 'hdr', position: 'absolute', left: 0, top: 0,
    width: W, height: HEADER_H,
    border: true, customBorderChars: tuiBorderChars(), borderStyle: 'double', borderColor: C.cyan,
    backgroundColor: C.bg,
    flexDirection: 'column', paddingLeft: 1, paddingTop: 0,
  });
  // FORGE banner (cyan) + tagline. buildLines keeps it a single t-template.
  header.add(Text({ id: 'hdr-t', content: buildLines([
    ...FORGE_BANNER.map((l, i) => fg(bannerRowColor(i))(l)),
    [fg(C.muted)('Configure any project for AI agents'), otDim('   v' + VERSION)],
  ]) }));
  renderer.root.add(header);

  // ── Steps panel (left) ──
  const stepsPanel = new BoxRenderable(renderer, {
    id: 'stp', position: 'absolute',
    left: 0, top: HEADER_H + 1, width: LEFT_W, height: BODY_H,
    border: true, customBorderChars: tuiBorderChars(), borderStyle: 'single', borderColor: C.dim,
    backgroundColor: C.bgPanel,
    title: ' Steps ',
    flexDirection: 'column', paddingLeft: 1, paddingTop: 1,
  });
  renderer.root.add(stepsPanel);

  // ── Content panel (right) — flex column, widgets go here ──
  const contentPanel = new BoxRenderable(renderer, {
    id: 'cnt', position: 'absolute',
    left: LEFT_W + 1, top: HEADER_H + 1, width: RIGHT_W, height: BODY_H,
    border: true, customBorderChars: tuiBorderChars(), borderStyle: 'single', borderColor: C.cyan,
    backgroundColor: C.bg,
    flexDirection: 'column', gap: 1, paddingLeft: 1, paddingRight: 1, paddingTop: 1,
  });
  renderer.root.add(contentPanel);

  // ── Bottom hints ──
  const bottom = new BoxRenderable(renderer, {
    id: 'btm', position: 'absolute',
    left: 0, top: H - BOTTOM_H, width: W, height: BOTTOM_H,
    backgroundColor: C.bgPanel,
    paddingLeft: 1,
  });
  bottom.add(Text({ id: 'btm-t', content: buildLines([dimLeaf('[↑↓] Navigate  [Enter] Confirm  [Ctrl+C] Cancel')]) }));
  renderer.root.add(bottom);

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  let currentStep = 0;
  let activeWidget: any = null; // currently focused Input/Select

  function renderSteps() {
    stepsPanel.remove('stp-list');
    const lines = STEPS.map((s, i) => {
      if (i < currentStep)   return fg(C.green)(`✔ ${i+1}. ${s}`);
      if (i === currentStep) return boldCol(C.cyan, `► ${i+1}. ${s}`);
      return fg(C.muted)(`  ${i+1}. ${s}`);
    });
    stepsPanel.add(Text({ id: 'stp-list', content: buildLines(lines) }));
  }

  function clearContent() {
    // Blur + detach keyboard handler from the previous widget first
    if (activeWidget) {
      try { activeWidget.blur(); } catch {}
      activeWidget = null;
    }
    for (const child of [...contentPanel.getChildren()]) {
      try { contentPanel.remove(child.id ?? ''); } catch {}
    }
  }

  // ─── askInput — widget as CHILD of contentPanel ───────────────────────────────
  async function askInput(title: string, hint = '', defVal = ''): Promise<string> {
    return new Promise(resolve => {
      renderSteps();
      clearContent();

      contentPanel.add(Text({ id: 'q-label',
        content: hint
          ? buildLines([boldCol(C.white, title), dimLeaf(hint)])
          : buildLines([boldCol(C.white, title)]),
      }));

      const input = new InputRenderable(renderer, {
        id: 'q-input',
        width: RIGHT_W - 4,
        backgroundColor: C.bgInput,
        focusedBackgroundColor: C.bgFocus,
        focusedTextColor: C.cyan,
        placeholder: defVal || 'Type here and press Enter...',
        placeholderColor: C.muted,
      });
      contentPanel.add(input);
      // focus() attaches the keypress handler AND shows the input cursor
      input.focus();
      activeWidget = input;

      input.on('enter', () => {
        const val = input.value?.trim() || defVal;
        resolve(val);
      });
    });
  }

  // ─── askSelect — SelectRenderable as CHILD of contentPanel ────────────────────
  async function askSelect(title: string, hint: string, options: any[], initialValue?: string, labelRows?: Row[]): Promise<string> {
    return new Promise(resolve => {
      renderSteps();
      clearContent();

      // labelRows: pre-built rows (e.g. the confirm summary). Append the hint.
      const rows: Row[] = labelRows
        ? (hint ? [...labelRows, '', dimLeaf(hint)] : labelRows)
        : (hint ? [boldCol(C.white, title), dimLeaf(hint)] : [boldCol(C.white, title)]);
      contentPanel.add(Text({ id: 'q-label', content: buildLines(rows) }));

      const initIdx = initialValue
        ? Math.max(0, options.findIndex((o: any) => o.value === initialValue))
        : 0;

      // itemSpacing gives each option breathing room (name + description +
      // blank line ≈ 3 rows). The highlighted (cursor) row uses the bright
      // selected* colors; non-selected rows stay on the panel background.
      const rowsPerItem = 3;
      const sel = new SelectRenderable(renderer, {
        id: 'q-select',
        width: RIGHT_W - 4,
        height: Math.min(options.length * rowsPerItem + 1, BODY_H - 4),
        options,
        selectedIndex: initIdx,
        itemSpacing: 1,
        showScrollIndicator: true,
        backgroundColor: C.bgPanel,
        focusedBackgroundColor: C.bgPanel,
        focusedTextColor: C.white,
        selectedBackgroundColor: C.bgFocus,
        selectedTextColor: C.yellow,
        showDescription: true,
        descriptionColor: C.muted,
        selectedDescriptionColor: C.cyan,
      });
      contentPanel.add(sel);
      // focus() attaches the keypress handler so ↑↓ + Enter work
      sel.focus();
      activeWidget = sel;

      sel.on('itemSelected', () => {
        const val = sel.getSelectedOption()?.value ?? options[0].value;
        resolve(val);
      });
    });
  }

  // ─── Welcome / tutorial (shown BEFORE configuration) ──────────────────────────
  async function showWelcome(): Promise<void> {
    return new Promise(resolve => {
      // Steps panel shows the overview while the content explains forge.
      stepsPanel.remove('stp-list');
      stepsPanel.add(Text({ id: 'stp-list', content: buildLines([
        boldCol(C.cyan, '¿Qué es forge?'), '',
        fg(C.muted)('Configura tu repo'), fg(C.muted)('para trabajar con'), fg(C.muted)('agentes de IA.'), '',
        fg(C.green)('El wizard te guía'), fg(C.green)('en ~8 pasos.'),
      ]) }));
      clearContent();
      contentPanel.add(Text({ id: 'q-label', content: buildLines([
        boldCol(C.white, 'Bienvenido a forge'), '',
        fg(C.muted)('forge convierte este repositorio en un entorno donde agentes'),
        fg(C.muted)('especializados trabajan con guardrails, memoria y un flujo'),
        fg(C.muted)('estructurado (Spec-Driven Development).'), '',
        boldCol(C.cyan, 'Las 5 capas que vas a configurar:'),
        ['  ', fg(C.cyan)('◆ '), boldCol(C.yellow, 'Memory'),       '       ', fg(C.muted)('project.yaml + CLAUDE.md')],
        ['  ', fg(C.cyan)('◆ '), boldCol(C.yellow, 'Knowledge'),    '    ', fg(C.muted)('specs, wiki, architecture.rules')],
        ['  ', fg(C.cyan)('◆ '), boldCol(C.yellow, 'Guardrail'),    '    ', fg(C.muted)('hooks que protegen el scope')],
        ['  ', fg(C.cyan)('◆ '), boldCol(C.yellow, 'Delegation'),   '   ', fg(C.muted)('agentes tier-1/2 acotados')],
        ['  ', fg(C.cyan)('◆ '), boldCol(C.yellow, 'Distribution'), ' ', fg(C.muted)(`1 config → ${runtimeIds().length} runtimes`)],
        '',
        fg(C.green)('Al terminar abrirás un dashboard con todo lo instalado y'),
        fg(C.green)('cómo seguir trabajando.'),
      ]) }));
      const go = new SelectRenderable(renderer, {
        id: 'q-select', width: RIGHT_W - 4, height: 3,
        options: [o('Comenzar configuración  →', 'go', 'Enter para continuar')],
        backgroundColor: C.bgPanel, focusedBackgroundColor: C.bgPanel, focusedTextColor: C.white,
        selectedBackgroundColor: C.bgFocus, selectedTextColor: C.yellow, showDescription: true,
        descriptionColor: C.muted, selectedDescriptionColor: C.cyan,
      });
      contentPanel.add(go);
      go.focus();
      activeWidget = go;
      go.on('itemSelected', () => resolve());
    });
  }

  // ─── Wizard steps ─────────────────────────────────────────────────────────────
  const ans: any = { testing: detected.testing ?? [], detected: !!(detected.language || detected.backend) };

  try {
  await showWelcome();

  ans.name     = await askInput('Project name', 'Enter a name for your project');
  if (!ans.name) ans.name = 'My Project';
  ans.slug     = toSlug(ans.name);
  currentStep  = 1;

  // ── Project type FIRST (right after the name). Determines which sides run. ──
  const detectedType: ProjectType =
    detected.mobile && !detected.frontend ? 'mobile'
    : detected.backend && detected.frontend ? 'fullstack'
    : detected.frontend ? 'frontend'
    : detected.backend  ? 'backend'
    : 'fullstack';
  ans.type = await askSelect('Project type', 'Frontend, Backend, Fullstack o Mobile', PROJECT_TYPES, detectedType) as ProjectType;
  currentStep = 2;

  // ── Backend: language → framework (filtered by language). Only if applicable. ──
  if (hasBackend(ans.type)) {
    ans.backendLanguage = await askSelect('Backend language', 'Lenguaje del backend', BACKEND_LANGS, detected.language ?? 'typescript');
    const backend = await askSelect('Backend framework', 'Select backend (filtered by language)', backendOptionsFor(ans.backendLanguage), detected.backend ?? 'none');
    ans.backend = backend === 'none' ? undefined : backend;
  }
  currentStep = 3;

  // ── Frontend: language → framework (filtered by language). Only if applicable. ──
  if (hasFrontend(ans.type)) {
    ans.frontendLanguage = await askSelect('Frontend language', 'Lenguaje del frontend', FRONTEND_LANGS, 'typescript');
    const frontend = await askSelect('Frontend framework', 'Select frontend (filtered by language)', frontendOptionsFor(ans.frontendLanguage), detected.frontend ?? 'none');
    ans.frontend = frontend === 'none' ? undefined : frontend;
  }
  currentStep = 4;

  // ── Mobile: language → framework (filtered by language). Only when type=mobile. ──
  if (hasMobile(ans.type)) {
    ans.mobileLanguage = await askSelect('Mobile language', 'Lenguaje del mobile', MOBILE_LANGS, detected.mobileLanguage ?? 'dart');
    const mobile = await askSelect('Mobile framework', 'Select mobile (filtered by language)', mobileOptionsFor(ans.mobileLanguage), detected.mobile ?? 'none');
    ans.mobile = mobile === 'none' ? undefined : mobile;
  }
  currentStep = 5;

  // Language used for ORM / package manager / testing: backend → frontend → mobile.
  const stackLanguage = ans.backendLanguage ?? ans.frontendLanguage ?? ans.mobileLanguage ?? 'typescript';

  // ── Database / ORM — only when there's a backend. ──
  if (hasBackend(ans.type)) {
    const database = await askSelect('Database', 'Select primary database', DATABASES, detected.database ?? 'postgresql');
    ans.database = database === 'none' ? undefined : database;
    currentStep = 6;

    if (ans.database) {
      const ormOpts = ORMS[ans.backendLanguage] ?? [o('None','none','')];
      const orm = await askSelect('ORM / query builder', 'Select ORM', ormOpts, detected.orm ?? 'none');
      ans.orm = orm === 'none' ? undefined : orm;
    }
  }
  currentStep = 7;

  const pmOpts = PKG[stackLanguage] ?? [o('npm','npm','')];
  ans.packageManager = await askSelect('Package manager', 'Select package manager', pmOpts, detected.packageManager ?? 'pnpm');
  currentStep = 8;

  const testOpts = TESTING[stackLanguage] ?? [o('None','none','Skip')];
  const test = await askSelect('Testing', 'Select primary testing framework', testOpts, (detected.testing ?? [])[0] ?? 'none');
  ans.testing = test === 'none' ? [] : [test];
  currentStep = 9;

  ans.mode = await askSelect('Project mode', 'Determines agents and guardrails', MODES, 'standard');
  currentStep = 10;

  ans.runtime = await askSelect('AI Runtime', 'Primary AI coding assistant', RUNTIMES, 'claude-code');
  currentStep = 11;

  // Derived legacy language (back-compat).
  ans.language = deriveProjectLanguage({
    type: ans.type, backendLanguage: ans.backendLanguage,
    frontendLanguage: ans.frontendLanguage, mobileLanguage: ans.mobileLanguage,
  });

  // ── Confirm ──
  renderSteps();
  clearContent();

  const backendStr  = ans.backend  ? ans.backend  + (ans.backendLanguage  ? ` (${ans.backendLanguage})`  : '') : '';
  const frontendStr = ans.frontend ? ans.frontend + (ans.frontendLanguage ? ` (${ans.frontendLanguage})` : '') : '';
  const mobileStr   = ans.mobile   ? ans.mobile   + (ans.mobileLanguage   ? ` (${ans.mobileLanguage})`   : '') : '';

  // Each row is an array of parts (string literals + leaf StyledTexts).
  const summaryRows: Row[] = [
    boldCol(C.white, 'Configuration summary'),
    '',
    ['  ', fg(C.muted)('Name:'), '      ', fg(C.yellow)(ans.name)],
    ['  ', fg(C.muted)('Type:'), '      ' + ans.type + '   ', fg(C.muted)('Lang:'), ' ' + ans.language + '   ', fg(C.muted)('Mode:'), ' ' + ans.mode],
  ];
  if (backendStr)  summaryRows.push(['  ', fg(C.muted)('Backend:'),  '   ' + backendStr]);
  if (frontendStr) summaryRows.push(['  ', fg(C.muted)('Frontend:'), '  ' + frontendStr]);
  if (mobileStr)   summaryRows.push(['  ', fg(C.muted)('Mobile:'),   '    ' + mobileStr]);
  if (ans.database) summaryRows.push(['  ', fg(C.muted)('Database:'), '  ' + ans.database + (ans.orm ? ' + ' + ans.orm : '')]);
  if (ans.testing?.length) summaryRows.push(['  ', fg(C.muted)('Testing:'),  '   ' + ans.testing.join(', ')]);
  summaryRows.push(['  ', fg(C.muted)('Runtime:'),  '   ' + ans.runtime]);

  const confirmed = await askSelect('', 'Install with this configuration?', [
    o('✔  Yes, install forge', 'yes', ''),
    o('✗  Cancel',             'no',  ''),
  ], undefined, summaryRows) === 'yes';

  if (!confirmed) { renderer.destroy(); restoreTerminal(); return null; }

  // Done
  renderSteps();
  clearContent();
  contentPanel.add(Text({ id: 'q-label',
    content: buildLines(['', boldCol(C.green, '✔ Configuration complete'), dimLeaf('Installing forge...')]),
  }));
  await new Promise(r => setTimeout(r, 500));
  renderer.destroy();
  restoreTerminal();

  const profiles: string[] = [];
  if (ans.backend  && PROFILE_MAP[ans.backend])  profiles.push(PROFILE_MAP[ans.backend]);
  if (ans.frontend && PROFILE_MAP[ans.frontend]) profiles.push(PROFILE_MAP[ans.frontend]);
  if (ans.mobile   && PROFILE_MAP[ans.mobile])   profiles.push(PROFILE_MAP[ans.mobile]);

  return {
    name: ans.name, slug: ans.slug, description: '', language: ans.language,
    type: ans.type, backendLanguage: ans.backendLanguage, frontendLanguage: ans.frontendLanguage,
    mobileLanguage: ans.mobileLanguage,
    mode: ans.mode, backend: ans.backend, frontend: ans.frontend, mobile: ans.mobile,
    database: ans.database, orm: ans.orm, packageManager: ans.packageManager,
    testing: ans.testing, profiles: [...new Set(profiles)],
    // Default skills (the OpenTUI wizard doesn't ask for them yet).
    skills: ['spec', 'new-feature', 'security-audit'],
    runtime: ans.runtime, detected: ans.detected,
  };
  } catch (err) {
    // Never leave the terminal in raw mode if a step throws.
    try { renderer.destroy(); } catch {}
    restoreTerminal();
    throw err;
  }
}
