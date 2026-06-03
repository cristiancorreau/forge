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
} from '@opentui/core';
import type { WizardResult } from '../lib/wizard.js';
import { detectStack } from '../lib/detect.js';

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  cyan:    '#00e5ff',
  yellow:  '#ffd740',
  green:   '#69ff47',
  muted:   '#546e7a',
  dim:     '#37474f',
  bg:      '#0d1117',
  bgPanel: '#161b22',
  bgInput: '#1f2937',
  bgFocus: '#1e3a5f',
  white:   '#e6edf3',
};

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const col  = (hex: string, s: string) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
};
const dim  = (s: string) => `\x1b[2m${s}\x1b[0m`;

const STEPS = [
  'Project name','Language','Mode',
  'Backend','Frontend','Database','ORM',
  'Package manager','Testing','Runtime','Confirm',
];

// ─── Options ─────────────────────────────────────────────────────────────────
const o = (name: string, value: string, description = '') => ({ name, value, description });

const BACKENDS: Record<string, any[]> = {
  typescript: [o('Hono','hono','Edge-ready, ultralight'), o('Express','express','The classic'), o('NestJS','nestjs','Enterprise'), o('Fastify','fastify','High performance'), o('None','none','')],
  python:     [o('FastAPI','fastapi','Async'), o('Django','django','Batteries included'), o('None','none','')],
  ruby:       [o('Rails','rails','Full-stack'), o('None','none','')],
  go:         [o('Gin','go-gin','Fast router'), o('None','none','')],
  php:        [o('Laravel','laravel','Full-stack PHP'), o('None','none','')],
};
const FRONTENDS = [o('Next.js','nextjs','Fullstack React'), o('Astro','astro','Content-first'), o('Nuxt','nuxt','Vue'), o('SvelteKit','sveltekit','Svelte'), o('None','none','')];
const DATABASES = [o('PostgreSQL','postgresql','Recommended'), o('MySQL','mysql',''), o('SQLite','sqlite','Dev/embedded'), o('None','none','')];
const ORMS: Record<string, any[]> = {
  typescript: [o('Drizzle ORM','drizzle','Lightweight, type-safe'), o('Prisma','prisma','Full ORM'), o('TypeORM','typeorm',''), o('None','none','')],
  python:     [o('SQLAlchemy','sqlalchemy',''), o('None','none','')],
  ruby:       [o('Active Record','active-record',''), o('None','none','')],
};
const PKG: Record<string, any[]> = {
  typescript: [o('pnpm','pnpm','Recommended'), o('npm','npm',''), o('yarn','yarn',''), o('bun','bun','Ultra-fast')],
  python:     [o('pip','pip',''), o('poetry','poetry','')],
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
const RUNTIMES = [o('Claude Code','claude-code','Recommended'), o('OpenCode','opencode',''), o('Codex CLI','codex',''), o('Kiro IDE','kiro','')];
const PROFILE_MAP: Record<string,string> = { hono:'hono-drizzle', nextjs:'nextjs-admin', astro:'astro', fastapi:'fastapi', rails:'rails', laravel:'laravel' };
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function runOpenTUIWizard(): Promise<WizardResult | null> {
  const detected = detectStack(process.cwd());
  const renderer = await createCliRenderer({ exitOnCtrlC: true });

  const W = renderer.root.width  ?? process.stdout.columns  ?? 120;
  const H = renderer.root.height ?? process.stdout.rows     ?? 40;

  const HEADER_H = 5;
  const BOTTOM_H = 2;
  const BODY_H   = H - HEADER_H - BOTTOM_H - 2;
  const LEFT_W   = Math.max(24, Math.floor(W * 0.25));
  const RIGHT_W  = W - LEFT_W - 1;

  // ── Header panel ──
  const header = new BoxRenderable(renderer, {
    id: 'hdr', position: 'absolute', left: 0, top: 0,
    width: W, height: HEADER_H,
    border: true, borderStyle: 'double', borderColor: C.cyan,
    backgroundColor: C.bg,
    flexDirection: 'column', paddingLeft: 1, paddingTop: 1,
  });
  header.add(Text({ id: 'hdr-t',
    content:
      col(C.yellow, bold('forge')) + dim('  v2.6.3') + '\n' +
      col(C.muted,  'Configure any project for AI agents') + '\n' +
      dim('Claude Code · OpenCode · Codex · Kiro'),
  }));
  renderer.root.add(header);

  // ── Steps panel (left) ──
  const stepsPanel = new BoxRenderable(renderer, {
    id: 'stp', position: 'absolute',
    left: 0, top: HEADER_H + 1, width: LEFT_W, height: BODY_H,
    border: true, borderStyle: 'single', borderColor: C.dim,
    backgroundColor: C.bgPanel,
    title: ' Steps ',
    flexDirection: 'column', paddingLeft: 1, paddingTop: 1,
  });
  renderer.root.add(stepsPanel);

  // ── Content panel (right) — flex column, widgets go here ──
  const contentPanel = new BoxRenderable(renderer, {
    id: 'cnt', position: 'absolute',
    left: LEFT_W + 1, top: HEADER_H + 1, width: RIGHT_W, height: BODY_H,
    border: true, borderStyle: 'single', borderColor: C.cyan,
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
  bottom.add(Text({ id: 'btm-t', content: dim('[↑↓] Navigate  [Enter] Confirm  [Ctrl+C] Cancel') }));
  renderer.root.add(bottom);

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  let currentStep = 0;
  let activeWidget: any = null; // currently focused Input/Select

  function renderSteps() {
    stepsPanel.remove('stp-list');
    const lines = STEPS.map((s, i) => {
      if (i < currentStep) return col(C.green, `✔ ${i+1}. ${s}`);
      if (i === currentStep) return col(C.cyan, `► ${bold(String(i+1))}. ${bold(s)}`);
      return col(C.muted, `  ${i+1}. ${s}`);
    }).join('\n');
    stepsPanel.add(Text({ id: 'stp-list', content: lines }));
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
        content: col(C.white, bold(title)) + (hint ? '\n' + dim(hint) : ''),
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
  async function askSelect(title: string, hint: string, options: any[], initialValue?: string, rawLabel?: string): Promise<string> {
    return new Promise(resolve => {
      renderSteps();
      clearContent();

      const labelContent = rawLabel
        ? rawLabel + (hint ? '\n\n' + dim(hint) : '')
        : col(C.white, bold(title)) + (hint ? '\n' + dim(hint) : '');
      contentPanel.add(Text({ id: 'q-label', content: labelContent }));

      const initIdx = initialValue
        ? Math.max(0, options.findIndex((o: any) => o.value === initialValue))
        : 0;

      const sel = new SelectRenderable(renderer, {
        id: 'q-select',
        width: RIGHT_W - 4,
        height: Math.min(options.length + 2, BODY_H - 8),
        options,
        selectedIndex: initIdx,
        backgroundColor: C.bgPanel,
        focusedBackgroundColor: '#1c3a5e',
        focusedTextColor: C.cyan,
        selectedBackgroundColor: '#162032',
        selectedTextColor: C.yellow,
        showDescription: true,
        descriptionColor: C.muted,
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

  // ─── Wizard steps ─────────────────────────────────────────────────────────────
  const ans: any = { testing: detected.testing ?? [], detected: !!(detected.language || detected.backend) };

  ans.name     = await askInput('Project name', 'Enter a name for your project');
  if (!ans.name) ans.name = 'My Project';
  ans.slug     = toSlug(ans.name);
  currentStep  = 1;

  ans.language = await askSelect('Language', 'Primary programming language', [
    o('TypeScript','typescript','Recommended'), o('Python','python',''),
    o('Ruby','ruby',''), o('Go','go',''), o('PHP','php',''),
  ], detected.language ?? 'typescript');
  currentStep = 2;

  ans.mode = await askSelect('Project mode', 'Determines agents and guardrails', [
    o('startup',    'startup',    'Minimal — small team'),
    o('standard',   'standard',  'CI/CD, code review, testing'),
    o('enterprise', 'enterprise','Compliance, multi-team, audits'),
  ], 'standard');
  currentStep = 3;

  const backendOpts = BACKENDS[ans.language] ?? [o('None','none','')];
  const backend = await askSelect('Backend framework', 'Select backend (or None)', backendOpts, detected.backend ?? 'none');
  ans.backend = backend === 'none' ? undefined : backend;
  currentStep = 4;

  const frontend = await askSelect('Frontend framework', 'Select frontend (or None)', FRONTENDS, detected.frontend ?? 'none');
  ans.frontend = frontend === 'none' ? undefined : frontend;
  currentStep = 5;

  const database = await askSelect('Database', 'Select primary database', DATABASES, detected.database ?? 'postgresql');
  ans.database = database === 'none' ? undefined : database;
  currentStep = 6;

  if (ans.database) {
    const ormOpts = ORMS[ans.language] ?? [o('None','none','')];
    const orm = await askSelect('ORM / query builder', 'Select ORM', ormOpts, detected.orm ?? 'none');
    ans.orm = orm === 'none' ? undefined : orm;
  }
  currentStep = 7;

  const pmOpts = PKG[ans.language] ?? [o('npm','npm','')];
  ans.packageManager = await askSelect('Package manager', 'Select package manager', pmOpts, detected.packageManager ?? 'pnpm');
  currentStep = 8;

  const testOpts = TESTING[ans.language] ?? [o('None','none','Skip')];
  const test = await askSelect('Testing', 'Select primary testing framework', testOpts, (detected.testing ?? [])[0] ?? 'none');
  ans.testing = test === 'none' ? [] : [test];
  currentStep = 9;

  ans.runtime = await askSelect('AI Runtime', 'Primary AI coding assistant', RUNTIMES, 'claude-code');
  currentStep = 10;

  // ── Confirm ──
  renderSteps();
  clearContent();

  const summaryLines = [
    col(C.white, bold('Configuration summary')), '',
    `  ${col(C.muted,'Name:')}      ${col(C.yellow, ans.name)}`,
    `  ${col(C.muted,'Language:')}  ${ans.language}   ${col(C.muted,'Mode:')} ${ans.mode}`,
    ans.backend  ? `  ${col(C.muted,'Backend:')}   ${ans.backend}` : '',
    ans.frontend ? `  ${col(C.muted,'Frontend:')}  ${ans.frontend}` : '',
    ans.database ? `  ${col(C.muted,'DB:')}        ${ans.database}${ans.orm ? ' + ' + ans.orm : ''}` : '',
    ans.testing?.length ? `  ${col(C.muted,'Testing:')}   ${ans.testing.join(', ')}` : '',
    `  ${col(C.muted,'Runtime:')}   ${ans.runtime}`,
  ].filter(Boolean).join('\n');

  const confirmed = await askSelect('', 'Install with this configuration?', [
    o('✔  Yes, install forge', 'yes', ''),
    o('✗  Cancel',             'no',  ''),
  ], undefined, summaryLines) === 'yes';

  if (!confirmed) { renderer.destroy(); return null; }

  // Done
  renderSteps();
  clearContent();
  contentPanel.add(Text({ id: 'q-label',
    content: '\n\n' + col(C.green, bold('  ✔ Configuration complete')) + '\n' + dim('  Installing forge...'),
  }));
  await new Promise(r => setTimeout(r, 500));
  renderer.destroy();

  const profiles: string[] = [];
  if (ans.backend  && PROFILE_MAP[ans.backend])  profiles.push(PROFILE_MAP[ans.backend]);
  if (ans.frontend && PROFILE_MAP[ans.frontend]) profiles.push(PROFILE_MAP[ans.frontend]);

  return {
    name: ans.name, slug: ans.slug, description: '', language: ans.language,
    mode: ans.mode, backend: ans.backend, frontend: ans.frontend,
    database: ans.database, orm: ans.orm, packageManager: ans.packageManager,
    testing: ans.testing, profiles: [...new Set(profiles)],
    runtime: ans.runtime, detected: ans.detected,
  };
}
