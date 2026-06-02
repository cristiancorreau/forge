/**
 * forge interactive wizard — OpenTUI panels (Bun runtime only).
 * Layout: header / steps (left) / content (right) / keyhints (bottom)
 */
// @ts-nocheck — OpenTUI types verified at runtime; Bun-only module
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
  bgActive:'#1f2937',
  white:   '#e6edf3',
};

const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const col   = (hex: string, s: string) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
};
const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ─── Steps ────────────────────────────────────────────────────────────────────
const STEPS = ['Project name','Language','Mode','Backend','Frontend','Database','ORM','Package manager','Testing','Runtime','Confirm'];

// ─── Options ─────────────────────────────────────────────────────────────────
const opt = (name: string, value: string, description = '') => ({ name, value, description });

const BACKENDS: Record<string, ReturnType<typeof opt>[]> = {
  typescript: [opt('Hono','hono','Edge-ready, ultralight'), opt('Express','express','The classic'), opt('NestJS','nestjs','Enterprise, opinionated'), opt('Fastify','fastify','High performance'), opt('None','none','')],
  python:     [opt('FastAPI','fastapi','Async Python'), opt('Django','django','Batteries included'), opt('None','none','')],
  ruby:       [opt('Rails','rails','Full-stack framework'), opt('None','none','')],
  go:         [opt('Gin','go-gin','Fast HTTP router'), opt('None','none','')],
  php:        [opt('Laravel','laravel','Full-stack PHP'), opt('None','none','')],
};

const FRONTENDS = [
  opt('Next.js','nextjs','Fullstack React'), opt('Astro','astro','Content-first'),
  opt('Nuxt','nuxt','Vue.js'), opt('SvelteKit','sveltekit','Svelte'),
  opt('None','none',''),
];

const DATABASES = [
  opt('PostgreSQL','postgresql','Recommended'), opt('MySQL','mysql',''),
  opt('SQLite','sqlite','Dev / embedded'), opt('None','none',''),
];

const ORMS: Record<string, ReturnType<typeof opt>[]> = {
  typescript: [opt('Drizzle ORM','drizzle','Lightweight, type-safe'), opt('Prisma','prisma','Full ORM + migrations'), opt('TypeORM','typeorm',''), opt('None','none','')],
  python:     [opt('SQLAlchemy','sqlalchemy',''), opt('None','none','')],
  ruby:       [opt('Active Record','active-record',''), opt('None','none','')],
};

const PKG_MANAGERS: Record<string, ReturnType<typeof opt>[]> = {
  typescript: [opt('pnpm','pnpm','Recommended — fast'), opt('npm','npm',''), opt('yarn','yarn',''), opt('bun','bun','Ultra-fast')],
  python:     [opt('pip','pip',''), opt('poetry','poetry','')],
  ruby:       [opt('bundler','bundler','')],
  go:         [opt('go modules','go','')],
  php:        [opt('composer','composer','')],
};

const TESTING: Record<string, ReturnType<typeof opt>[]> = {
  typescript: [opt('Vitest','vitest','Unit + integration'), opt('Jest','jest',''), opt('Playwright','playwright','E2E'), opt('Cypress','cypress','E2E'), opt('None','none','Skip')],
  python:     [opt('pytest','pytest',''), opt('None','none','Skip')],
  ruby:       [opt('RSpec','rspec',''), opt('None','none','Skip')],
  php:        [opt('PHPUnit','phpunit',''), opt('None','none','Skip')],
};

const RUNTIMES = [
  opt('Claude Code','claude-code','Recommended'), opt('OpenCode','opencode',''),
  opt('Codex CLI','codex',''), opt('Kiro IDE','kiro',''),
];

const PROFILE_MAP: Record<string,string> = {
  hono:'hono-drizzle', nextjs:'nextjs-admin', astro:'astro',
  fastapi:'fastapi', rails:'rails', laravel:'laravel',
};

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

// ─── Main wizard ──────────────────────────────────────────────────────────────
export async function runOpenTUIWizard(): Promise<WizardResult | null> {
  const detected = detectStack(process.cwd());
  const renderer = await createCliRenderer({ exitOnCtrlC: true });

  const W = (renderer as any).width  ?? process.stdout.columns  ?? 120;
  const H = (renderer as any).height ?? process.stdout.rows     ?? 40;

  const HEADER_H = 5;
  const BOTTOM_H = 2;
  const BODY_H   = H - HEADER_H - BOTTOM_H - 2;
  const LEFT_W   = Math.max(22, Math.floor(W * 0.24));
  const RIGHT_W  = W - LEFT_W - 1;

  // ── Header ──
  const header = new BoxRenderable(renderer, {
    id: 'header', position: 'absolute', left: 0, top: 0, width: W, height: HEADER_H,
    borderStyle: 'double', border: true, borderColor: C.cyan,
    backgroundColor: C.bg,
  });
  header.add(Text({
    id: 'header-text',
    content:
      col(C.yellow, bold('forge')) + ' '.repeat(Math.max(2, W - 26)) + dim('v2.5.0') + '\n' +
      col(C.muted, 'Configure any project for AI agents') + '\n' +
      dim('Claude Code · OpenCode · Codex · Kiro'),
  }));
  renderer.root.add(header);

  // ── Steps panel ──
  const stepsPanel = new BoxRenderable(renderer, {
    id: 'steps-panel', position: 'absolute',
    left: 0, top: HEADER_H + 1, width: LEFT_W, height: BODY_H,
    borderStyle: 'single', border: true, borderColor: C.dim,
    backgroundColor: C.bgPanel, title: ' Steps ',
  });
  renderer.root.add(stepsPanel);

  // ── Content panel ──
  const contentPanel = new BoxRenderable(renderer, {
    id: 'content-panel', position: 'absolute',
    left: LEFT_W + 1, top: HEADER_H + 1, width: RIGHT_W, height: BODY_H,
    borderStyle: 'single', border: true, borderColor: C.cyan,
    backgroundColor: C.bg,
  });
  renderer.root.add(contentPanel);

  // ── Bottom bar ──
  const bottom = new BoxRenderable(renderer, {
    id: 'bottom', position: 'absolute',
    left: 0, top: H - BOTTOM_H, width: W, height: BOTTOM_H,
    backgroundColor: C.bgPanel,
  });
  bottom.add(Text({ id: 'bottom-text', content: dim(' [↑↓] Navigate  [Enter] Confirm  [Ctrl+C] Cancel') }));
  renderer.root.add(bottom);

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  let currentStep = 0;

  function renderSteps() {
    stepsPanel.remove('steps-list');
    const lines = STEPS.map((s, i) => {
      if (i < currentStep) return col(C.green, `  ✔ ${i+1}. ${s}`);
      if (i === currentStep) return col(C.cyan, `  ► ${bold(String(i+1))}. ${bold(s)}`);
      return col(C.muted, `    ${i+1}. ${s}`);
    }).join('\n');
    stepsPanel.add(Text({ id: 'steps-list', content: lines }));
  }

  function clearContent() {
    try { contentPanel.remove('content-label'); } catch {}
    try { contentPanel.remove('content-widget'); } catch {}
    try { renderer.root.remove('float-input'); } catch {}
    try { renderer.root.remove('float-select'); } catch {}
  }

  // ─── askInput ─────────────────────────────────────────────────────────────────
  async function askInput(title: string, hint = '', defVal = ''): Promise<string> {
    return new Promise(resolve => {
      renderSteps();
      clearContent();

      contentPanel.add(Text({
        id: 'content-label',
        content: '\n ' + col(C.white, bold(title)) + '\n ' + dim(hint || 'Type and press Enter'),
      }));

      const input = new InputRenderable(renderer, {
        id: 'float-input',
        position: 'absolute',
        left: LEFT_W + 3, top: HEADER_H + 6,
        width: Math.min(60, RIGHT_W - 6),
        backgroundColor: C.bgActive,
        borderStyle: 'single', border: true, borderColor: C.cyan,
        value: defVal,
      });
      renderer.root.add(input);
      renderer.focusRenderable(input);

      input.on('enter', () => {
        const val = (input as any).value?.trim() || defVal;
        clearContent();
        resolve(val);
      });
    });
  }

  // ─── askSelect ────────────────────────────────────────────────────────────────
  async function askSelect(
    title: string,
    hint: string,
    options: ReturnType<typeof opt>[],
    initialValue?: string,
  ): Promise<string> {
    return new Promise(resolve => {
      renderSteps();
      clearContent();

      contentPanel.add(Text({
        id: 'content-label',
        content: '\n ' + col(C.white, bold(title)) + '\n ' + dim(hint),
      }));

      const initIdx = initialValue
        ? Math.max(0, options.findIndex(o => o.value === initialValue))
        : 0;

      const sel = new SelectRenderable(renderer, {
        id: 'float-select',
        position: 'absolute',
        left: LEFT_W + 3, top: HEADER_H + 6,
        width: Math.min(52, RIGHT_W - 6),
        height: Math.min(options.length + 2, BODY_H - 8),
        options,
        selectedIndex: initIdx,
        backgroundColor: C.bgPanel,
        focusedBackgroundColor: C.bgActive,
        focusedTextColor: C.cyan,
        selectedBackgroundColor: C.bgActive,
        selectedTextColor: C.yellow,
        borderStyle: 'single', border: true, borderColor: C.dim,
      });
      renderer.root.add(sel);
      renderer.focusRenderable(sel);

      sel.on('itemSelected', () => {
        const val = sel.getSelectedOption()?.value ?? options[0].value;
        clearContent();
        resolve(val);
      });
    });
  }

  // ─── Run wizard steps ─────────────────────────────────────────────────────────
  const answers: any = {
    testing: detected.testing ?? [],
    profiles: [],
    detected: !!(detected.language || detected.backend),
  };

  renderSteps();

  answers.name     = await askInput('Project name', 'Name for your project (e.g. "My API")');
  answers.slug     = toSlug(answers.name);
  currentStep = 1;

  answers.language = await askSelect('Language', 'Primary programming language', [
    opt('TypeScript','typescript','Recommended'), opt('Python','python',''),
    opt('Ruby','ruby',''), opt('Go','go',''), opt('PHP','php',''),
  ], detected.language ?? 'typescript');
  currentStep = 2;

  answers.mode = await askSelect('Project mode', 'Determines agents and guardrails installed', [
    opt('startup','startup','Minimal — small team'),
    opt('standard','standard','CI/CD, code review, testing'),
    opt('enterprise','enterprise','Compliance, multi-team'),
  ], 'standard');
  currentStep = 3;

  const backendOpts = BACKENDS[answers.language] ?? [opt('None','none','')];
  const backend = await askSelect('Backend framework', 'Select backend (or None)', backendOpts, detected.backend ?? 'none');
  answers.backend = backend === 'none' ? undefined : backend;
  currentStep = 4;

  const frontend = await askSelect('Frontend framework', 'Select frontend (or None)', FRONTENDS, detected.frontend ?? 'none');
  answers.frontend = frontend === 'none' ? undefined : frontend;
  currentStep = 5;

  const database = await askSelect('Database', 'Select primary database', DATABASES, detected.database ?? 'postgresql');
  answers.database = database === 'none' ? undefined : database;
  currentStep = 6;

  if (answers.database) {
    const ormOpts = ORMS[answers.language] ?? [opt('None','none','')];
    const orm = await askSelect('ORM / query builder', 'Select ORM or query builder', ormOpts, detected.orm ?? 'none');
    answers.orm = orm === 'none' ? undefined : orm;
  }
  currentStep = 7;

  const pmOpts = PKG_MANAGERS[answers.language] ?? [opt('npm','npm','')];
  answers.packageManager = await askSelect('Package manager', 'Select package manager', pmOpts, detected.packageManager ?? 'pnpm');
  currentStep = 8;

  const testOpts = TESTING[answers.language] ?? [opt('None','none','Skip')];
  const test = await askSelect('Testing', 'Select primary testing framework', testOpts, (detected.testing ?? [])[0] ?? 'none');
  answers.testing = test === 'none' ? [] : [test];
  currentStep = 9;

  answers.runtime = await askSelect('AI Runtime', 'Select the primary AI coding runtime', RUNTIMES, 'claude-code');
  currentStep = 10;

  // Confirm
  renderSteps();
  clearContent();

  const summaryLines = [
    '\n ' + col(C.white, bold('Configuration summary')), '',
    `  ${col(C.muted,'Name:')}      ${col(C.yellow, answers.name)}`,
    `  ${col(C.muted,'Language:')}  ${answers.language}   ${col(C.muted,'Mode:')} ${answers.mode}`,
    answers.backend  ? `  ${col(C.muted,'Backend:')}   ${answers.backend}` : '',
    answers.frontend ? `  ${col(C.muted,'Frontend:')}  ${answers.frontend}` : '',
    answers.database ? `  ${col(C.muted,'Database:')}  ${answers.database}${answers.orm ? ' + ' + answers.orm : ''}` : '',
    answers.testing?.length ? `  ${col(C.muted,'Testing:')}   ${answers.testing.join(', ')}` : '',
    `  ${col(C.muted,'Runtime:')}   ${answers.runtime}`,
    '',
  ].filter(l => l !== '');

  contentPanel.add(Text({ id: 'content-label', content: summaryLines.join('\n') }));

  const confirmed = await askSelect('', 'Install with this configuration?', [
    opt('✔  Yes, install forge','yes',''),
    opt('✗  Cancel','no',''),
  ]) === 'yes';

  if (!confirmed) {
    renderer.destroy();
    return null;
  }

  renderSteps();
  clearContent();
  contentPanel.add(Text({
    id: 'content-label',
    content: '\n\n ' + col(C.green, bold('  ✔ Configuration complete')) + '\n ' + dim('  Installing forge...'),
  }));

  await new Promise(r => setTimeout(r, 500));
  renderer.destroy();

  // Auto profiles
  const profiles: string[] = [];
  if (answers.backend  && PROFILE_MAP[answers.backend])  profiles.push(PROFILE_MAP[answers.backend]);
  if (answers.frontend && PROFILE_MAP[answers.frontend]) profiles.push(PROFILE_MAP[answers.frontend]);

  return {
    name: answers.name,
    slug: answers.slug,
    description: '',
    language: answers.language,
    mode: answers.mode,
    backend: answers.backend,
    frontend: answers.frontend,
    database: answers.database,
    orm: answers.orm,
    packageManager: answers.packageManager,
    testing: answers.testing,
    profiles: [...new Set(profiles)],
    runtime: answers.runtime,
    detected: answers.detected,
  };
}
