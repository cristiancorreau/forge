import * as p from '@clack/prompts';
import chalk from 'chalk';
import { detectStack } from './detect.js';
import { SKILLS } from './catalog.js';
import { forgeBanner } from '../ui/banner.js';
import { VERSION } from '../version.js';
import {
  type ProjectType,
  hasBackend, hasFrontend, hasMobile,
  backendFrameworksFor, frontendFrameworksFor, mobileFrameworksFor,
  deriveProjectLanguage,
} from './wizard-flow.js';

export interface WizardResult {
  name: string;
  slug: string;
  description: string;
  /** Derived legacy language (backend lang, frontend lang, mobile lang, or 'mixed'). */
  language: string;
  /** Project type: solo frontend, solo backend, fullstack o mobile. */
  type: ProjectType;
  /** Backend language (only when the project has a backend). */
  backendLanguage?: string;
  /** Frontend language (only when the project has a frontend). */
  frontendLanguage?: string;
  /** Mobile language (SPEC-039, only when the project is mobile). */
  mobileLanguage?: string;
  mode: 'startup' | 'standard' | 'enterprise';
  backend?: string;
  frontend?: string;
  /** Mobile framework (SPEC-039): flutter | react-native | expo. */
  mobile?: string;
  database?: string;
  orm?: string;
  packageManager?: string;
  testing: string[];
  profiles: string[];
  skills: string[];
  runtime: string;
  detected: boolean;
}

// ─── Options tables ──────────────────────────────────────────────────────────

// Per-framework option metadata (label + hint). The wizard builds the actual
// picker by FILTERING these by the chosen per-side language (wizard-flow maps).
const BACKEND_META: Record<string, { label: string; hint?: string }> = {
  hono:    { label: 'Hono',    hint: 'edge-ready, ultraligero' },
  express: { label: 'Express', hint: 'el clásico' },
  nestjs:  { label: 'NestJS',  hint: 'enterprise, opinionado' },
  fastify: { label: 'Fastify', hint: 'rápido, plugins' },
  fastapi: { label: 'FastAPI', hint: 'async' },
  flask:   { label: 'Flask',   hint: 'micro-framework' },
  django:  { label: 'Django' },
  springboot: { label: 'Spring Boot', hint: 'JVM, enterprise' },
  axum:    { label: 'Axum',    hint: 'Tokio, async' },
  actix:   { label: 'Actix-web', hint: 'alto rendimiento' },
  rocket:  { label: 'Rocket',  hint: 'ergonómico' },
  rails:   { label: 'Rails' },
  'go-gin': { label: 'Gin' },
  laravel: { label: 'Laravel' },
};

const FRONTEND_META: Record<string, { label: string; hint?: string }> = {
  nextjs:    { label: 'Next.js',   hint: 'fullstack React' },
  astro:     { label: 'Astro',     hint: 'content-first' },
  nuxt:      { label: 'Nuxt',       hint: 'Vue' },
  sveltekit: { label: 'SvelteKit',  hint: 'Svelte' },
};

const MOBILE_META: Record<string, { label: string; hint?: string }> = {
  flutter:        { label: 'Flutter',      hint: 'Dart, multiplataforma' },
  'react-native': { label: 'React Native', hint: 'TypeScript/JS' },
  expo:           { label: 'Expo',         hint: 'React Native gestionado' },
};

const BACKEND_LANG_OPTS: p.Option<string>[] = [
  { value: 'typescript', label: 'TypeScript / JavaScript', hint: 'recomendado' },
  { value: 'python',     label: 'Python' },
  { value: 'java',       label: 'Java' },
  { value: 'kotlin',     label: 'Kotlin' },
  { value: 'rust',       label: 'Rust' },
  { value: 'ruby',       label: 'Ruby' },
  { value: 'go',         label: 'Go' },
  { value: 'php',        label: 'PHP' },
];

const FRONTEND_LANG_OPTS: p.Option<string>[] = [
  { value: 'typescript', label: 'TypeScript / JavaScript', hint: 'recomendado' },
];

const MOBILE_LANG_OPTS: p.Option<string>[] = [
  { value: 'dart',       label: 'Dart', hint: 'Flutter' },
  { value: 'typescript', label: 'TypeScript / JavaScript', hint: 'React Native / Expo' },
];

/** Build a framework picker (filtered by language) + the "ninguno / otro" escape. */
function backendFrameworkOptions(language: string): p.Option<string>[] {
  const opts = backendFrameworksFor(language).map<p.Option<string>>(v => ({
    value: v, label: BACKEND_META[v]?.label ?? v, hint: BACKEND_META[v]?.hint,
  }));
  opts.push({ value: 'none', label: 'Ninguno / otro' });
  return opts;
}

function frontendFrameworkOptions(language: string): p.Option<string>[] {
  const opts = frontendFrameworksFor(language).map<p.Option<string>>(v => ({
    value: v, label: FRONTEND_META[v]?.label ?? v, hint: FRONTEND_META[v]?.hint,
  }));
  opts.push({ value: 'none', label: 'Ninguno / otro' });
  return opts;
}

function mobileFrameworkOptions(language: string): p.Option<string>[] {
  const opts = mobileFrameworksFor(language).map<p.Option<string>>(v => ({
    value: v, label: MOBILE_META[v]?.label ?? v, hint: MOBILE_META[v]?.hint,
  }));
  opts.push({ value: 'none', label: 'Ninguno / otro' });
  return opts;
}

const ORMS: Record<string, p.Option<string>[]> = {
  typescript: [
    { value: 'drizzle',   label: 'Drizzle ORM', hint: 'ligero, type-safe' },
    { value: 'prisma',    label: 'Prisma',       hint: 'completo, migrations' },
    { value: 'typeorm',   label: 'TypeORM' },
    { value: 'none',      label: 'Ninguno' },
  ],
  python:     [{ value: 'sqlalchemy', label: 'SQLAlchemy' }, { value: 'none', label: 'Ninguno' }],
  ruby:       [{ value: 'active-record', label: 'Active Record' }, { value: 'none', label: 'Ninguno' }],
};

const PKG_MANAGERS: Record<string, p.Option<string>[]> = {
  typescript: [
    { value: 'pnpm', label: 'pnpm', hint: 'recomendado — rápido y eficiente' },
    { value: 'npm',  label: 'npm' },
    { value: 'yarn', label: 'yarn' },
    { value: 'bun',  label: 'bun',  hint: 'ultra-rápido' },
  ],
  python:     [{ value: 'pip',    label: 'pip' }, { value: 'poetry', label: 'poetry' }],
  java:       [{ value: 'maven',  label: 'Maven' }, { value: 'gradle', label: 'Gradle' }],
  kotlin:     [{ value: 'gradle', label: 'Gradle' }, { value: 'maven', label: 'Maven' }],
  rust:       [{ value: 'cargo',  label: 'Cargo' }],
  dart:       [{ value: 'pub',    label: 'pub (Dart/Flutter)' }],
  ruby:       [{ value: 'bundler', label: 'bundler' }],
  go:         [{ value: 'go',     label: 'go modules' }],
  php:        [{ value: 'composer', label: 'composer' }],
};

const TESTING_OPTS: Record<string, p.Option<string>[]> = {
  typescript: [
    { value: 'vitest',     label: 'Vitest',     hint: 'unit/integration' },
    { value: 'jest',       label: 'Jest' },
    { value: 'playwright', label: 'Playwright',  hint: 'E2E' },
    { value: 'cypress',    label: 'Cypress',     hint: 'E2E' },
  ],
  python:     [{ value: 'pytest', label: 'pytest' }],
  ruby:       [{ value: 'rspec',  label: 'RSpec' }],
  php:        [{ value: 'phpunit', label: 'PHPUnit' }],
};

const PROFILE_MAP: Record<string, string> = {
  hono:    'hono-drizzle',
  nextjs:  'nextjs-admin',
  astro:   'astro',
  fastapi: 'fastapi',
  rails:   'rails',
  laravel: 'laravel',
  expo:    'expo',
};

// Skills pre-seleccionadas por defecto en el wizard.
const DEFAULT_SKILLS: string[] = ['spec', 'new-feature', 'security-audit'];

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cancel(): never {
  p.cancel('Operación cancelada.');
  process.exit(0);
}

function check<T>(v: T | symbol): T {
  if (p.isCancel(v)) cancel();
  return v as T;
}

/**
 * Print the FORGE banner above the @clack wizard so the Node fallback opens with
 * the same brand surface as the OpenTUI panel and the static header. Respects
 * `FORGE_ASCII` (block glyphs degrade to an ASCII banner on legacy consoles) and
 * `NO_COLOR` (chalk handles it). Printed once, before `p.intro`.
 */
function printWizardBanner(): void {
  const banner = forgeBanner().map(l => chalk.cyan(l)).join('\n');
  process.stdout.write(
    '\n' + banner + '\n' +
    chalk.dim('Configure any project for AI agents') + '  ' + chalk.dim('v' + VERSION) + '\n' +
    chalk.dim('Claude Code · OpenCode · Codex · Kiro') + '\n',
  );
}

/**
 * A short labelled section divider inside the @clack flow, so the ~8 questions
 * read as grouped steps ("1/4 Proyecto", "2/4 Stack", …) instead of a flat list.
 */
function step(n: number, total: number, label: string): void {
  p.note(chalk.cyan(`Paso ${n}/${total}`) + chalk.dim('  ·  ') + chalk.bold(label), 'forge');
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

export async function runWizard(): Promise<WizardResult | null> {
  // Banner first so the Node fallback opens with the FORGE brand surface, same as
  // the OpenTUI panel. Then the @clack intro.
  printWizardBanner();
  p.intro(chalk.cyan(' forge — Configuración de proyecto '));

  // Welcome / tutorial shown BEFORE configuration.
  p.note(
    [
      'forge convierte este repo en un entorno donde agentes especializados',
      'trabajan con guardrails, memoria y un flujo estructurado (SDD).',
      '',
      'Vas a configurar 5 capas:',
      '  ◆ Memory       project.yaml + CLAUDE.md',
      '  ◆ Knowledge    specs, wiki, architecture.rules',
      '  ◆ Guardrail    hooks que protegen el scope',
      '  ◆ Delegation   agentes tier-1/2 acotados',
      '  ◆ Distribution 1 config → 4 runtimes',
      '',
      'El wizard te guía en ~8 pasos. Al terminar verás un resumen de',
      'lo instalado y cómo seguir trabajando.',
    ].join('\n'),
    'Bienvenido a forge'
  );

  // Auto-detect stack
  const detected = detectStack(process.cwd());
  const hasDetection = !!(detected.language || detected.backend || detected.packageManager);

  if (hasDetection) {
    const detectedItems = [
      detected.language    && `lenguaje: ${detected.language}`,
      detected.backend     && `backend: ${detected.backend}`,
      detected.frontend    && `frontend: ${detected.frontend}`,
      detected.mobile      && `mobile: ${detected.mobile}`,
      detected.packageManager && `package manager: ${detected.packageManager}`,
      detected.testing.length && `testing: ${detected.testing.join(', ')}`,
    ].filter(Boolean) as string[];
    p.note(detectedItems.join('\n'), 'Stack detectado — pre-seleccionado abajo');
  }

  // ── Proyecto ──
  step(1, 4, 'Proyecto');
  const name = check(await p.text({
    message: 'Nombre del proyecto',
    placeholder: 'Mi Proyecto',
    validate: (v: string | undefined) => (v ?? '').trim() ? undefined : 'El nombre es requerido',
  }));

  const slugDefault = toSlug(name);
  const slugInput = check(await p.text({
    message: 'Slug (URL-safe)',
    placeholder: slugDefault,
    defaultValue: slugDefault,
  }));
  const slug = slugInput || slugDefault;

  const description = check(await p.text({
    message: 'Descripción breve',
    placeholder: 'Describe tu proyecto en una línea',
  }));

  // ── Tipo de proyecto (PRIMERO, justo después del nombre) ──
  // Determina qué lados (backend/frontend) se preguntan. Si se detectó stack,
  // se pre-selecciona el tipo inferido.
  const detectedType: ProjectType | undefined =
    detected.mobile && !detected.frontend ? 'mobile'
    : detected.backend && detected.frontend ? 'fullstack'
    : detected.frontend ? 'frontend'
    : detected.backend  ? 'backend'
    : undefined;
  const type = check(await p.select({
    message: 'Tipo de proyecto',
    initialValue: detectedType ?? 'fullstack',
    options: [
      { value: 'frontend',  label: 'Solo Frontend', hint: 'UI / SPA / SSR' },
      { value: 'backend',   label: 'Solo Backend',  hint: 'API / servicio' },
      { value: 'fullstack', label: 'Fullstack',     hint: 'frontend + backend (pueden diferir)' },
      { value: 'mobile',    label: 'Mobile',        hint: 'app iOS/Android (Flutter, React Native)' },
    ],
  })) as ProjectType;

  // ── Stack técnico ──
  step(2, 4, 'Stack técnico');

  // Backend: lenguaje → framework (filtrado por lenguaje). Solo si aplica.
  let backendLanguage: string | undefined;
  let backend: string | undefined;
  if (hasBackend(type)) {
    backendLanguage = check(await p.select({
      message: 'Lenguaje del backend',
      initialValue: detected.language ?? 'typescript',
      options: BACKEND_LANG_OPTS,
    })) as string;
    const backendVal = check(await p.select({
      message: 'Framework backend',
      initialValue: detected.backend ?? 'none',
      options: backendFrameworkOptions(backendLanguage),
    })) as string;
    backend = backendVal === 'none' ? undefined : backendVal;
  }

  // Frontend: lenguaje → framework (filtrado por lenguaje). Solo si aplica.
  let frontendLanguage: string | undefined;
  let frontend: string | undefined;
  if (hasFrontend(type)) {
    frontendLanguage = check(await p.select({
      message: 'Lenguaje del frontend',
      initialValue: detected.frontend ? 'typescript' : 'typescript',
      options: FRONTEND_LANG_OPTS,
    })) as string;
    const frontendVal = check(await p.select({
      message: 'Framework frontend',
      initialValue: detected.frontend ?? 'none',
      options: frontendFrameworkOptions(frontendLanguage),
    })) as string;
    frontend = frontendVal === 'none' ? undefined : frontendVal;
  }

  // Mobile (nueva dimensión): lenguaje → framework. Solo cuando el tipo es mobile.
  let mobileLanguage: string | undefined;
  let mobile: string | undefined;
  if (hasMobile(type)) {
    mobileLanguage = check(await p.select({
      message: 'Lenguaje del mobile',
      initialValue: detected.mobileLanguage ?? 'dart',
      options: MOBILE_LANG_OPTS,
    })) as string;
    const mobileVal = check(await p.select({
      message: 'Framework mobile',
      initialValue: detected.mobile ?? 'none',
      options: mobileFrameworkOptions(mobileLanguage),
    })) as string;
    mobile = mobileVal === 'none' ? undefined : mobileVal;
  }

  // Lenguaje para ORM / package manager / testing: el del backend si existe,
  // si no el del frontend, si no el del mobile.
  const stackLanguage = backendLanguage ?? frontendLanguage ?? mobileLanguage ?? 'typescript';

  // Database / ORM — solo cuando hay backend.
  let database: string | undefined;
  let orm: string | undefined;
  if (hasBackend(type)) {
    const dbVal = check(await p.select({
      message: 'Base de datos',
      initialValue: detected.database ?? 'postgresql',
      options: [
        { value: 'postgresql', label: 'PostgreSQL', hint: 'recomendado' },
        { value: 'mysql',      label: 'MySQL / MariaDB' },
        { value: 'sqlite',     label: 'SQLite',    hint: 'dev/embedded' },
        { value: 'none',       label: 'Ninguna' },
      ],
    })) as string;
    database = dbVal === 'none' ? undefined : dbVal;

    const ormOpts = ORMS[backendLanguage ?? 'typescript'];
    if (database && ormOpts) {
      const v = check(await p.select({
        message: 'ORM / query builder',
        initialValue: detected.orm ?? ormOpts[0].value,
        options: ormOpts,
      })) as string;
      orm = v === 'none' ? undefined : v;
    }
  }

  const pmOpts = PKG_MANAGERS[stackLanguage];
  let packageManager: string | undefined;
  if (pmOpts) {
    const v = check(await p.select({
      message: 'Package manager',
      initialValue: detected.packageManager ?? pmOpts[0].value,
      options: pmOpts,
    })) as string;
    packageManager = v === 'none' ? undefined : v;
  }

  const testOpts = TESTING_OPTS[stackLanguage];
  let testing: string[] = detected.testing;
  if (testOpts) {
    const v = check(await p.multiselect({
      message: 'Frameworks de testing',
      initialValues: detected.testing,
      options: testOpts,
      required: false,
    })) as string[];
    testing = v;
  }

  // ── Modo ──
  const mode = check(await p.select({
    message: 'Modo del proyecto',
    initialValue: 'standard',
    options: [
      { value: 'startup',    label: 'startup',    hint: 'mínimo viable, equipo pequeño' },
      { value: 'standard',   label: 'standard',   hint: 'CI/CD, code review, testing' },
      { value: 'enterprise', label: 'enterprise', hint: 'compliance, auditoría, multi-equipo' },
    ],
  })) as 'startup' | 'standard' | 'enterprise';

  // Lenguaje legacy derivado (back-compat): back/fullstack → backend lang,
  // frontend-only → frontend lang, mobile → mobile lang, lados distintos → 'mixed'.
  const language = deriveProjectLanguage({ type, backendLanguage, frontendLanguage, mobileLanguage });

  // ── Runtime ──
  step(3, 4, 'Runtime de IA');
  const runtime = check(await p.select({
    message: 'Runtime de IA',
    initialValue: 'claude-code',
    options: [
      { value: 'claude-code', label: 'Claude Code', hint: 'recomendado' },
      { value: 'opencode',    label: 'OpenCode' },
      { value: 'codex',       label: 'Codex CLI' },
      { value: 'kiro',        label: 'Kiro IDE' },
    ],
  })) as string;

  // ── Skills ──
  step(4, 4, 'Skills');
  const skills = check(await p.multiselect({
    message: 'Skills a instalar',
    initialValues: DEFAULT_SKILLS,
    options: SKILLS.map((s) => ({
      value: s.id,
      label: s.command,
      hint: `${s.category} — ${s.purpose}`,
    })),
    required: false,
  })) as string[];

  // ── Confirmación ──
  // Tidy, label-aligned summary box (right-padded keys so the values line up).
  const row = (k: string, v: string) => `  ${chalk.dim(k.padEnd(14))} ${v}`;
  const backendStr  = backend  ? `${backend}${backendLanguage  ? ` (${backendLanguage})`  : ''}`  : '';
  const frontendStr = frontend ? `${frontend}${frontendLanguage ? ` (${frontendLanguage})` : ''}` : '';
  const mobileStr   = mobile   ? `${mobile}${mobileLanguage     ? ` (${mobileLanguage})`    : ''}` : '';
  const summary = [
    row('Nombre', chalk.bold(name)),
    row('Tipo', `${type}   ${chalk.dim('Lenguaje:')} ${language}   ${chalk.dim('Modo:')} ${mode}`),
    backendStr  ? row('Backend', backendStr) : '',
    frontendStr ? row('Frontend', frontendStr) : '',
    mobileStr   ? row('Mobile', mobileStr) : '',
    database ? row('Base de datos', `${database}${orm ? ' + ' + orm : ''}`) : '',
    testing.length ? row('Testing', testing.join(', ')) : '',
    row('Runtime', runtime),
    skills.length ? row('Skills', skills.join(', ')) : '',
  ].filter(Boolean).join('\n');

  p.note(summary, 'Resumen de configuración');

  const confirmed = check(await p.confirm({ message: '¿Instalar con esta configuración?' }));
  if (!confirmed) { p.cancel('Cancelado.'); return null; }

  p.outro(chalk.green('✔') + ' Configuración lista — instalando forge…');

  // Auto-detect profiles
  const profiles: string[] = [];
  for (const key of [backend, frontend, mobile]) {
    if (key && PROFILE_MAP[key]) profiles.push(PROFILE_MAP[key]);
  }

  return {
    name, slug, description: description || '', language, type,
    backendLanguage, frontendLanguage, mobileLanguage, mode,
    backend, frontend, mobile, database, orm, packageManager, testing,
    profiles: [...new Set(profiles)], skills, runtime, detected: hasDetection,
  };
}
