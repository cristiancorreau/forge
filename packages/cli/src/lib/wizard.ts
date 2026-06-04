import * as p from '@clack/prompts';
import chalk from 'chalk';
import { detectStack } from './detect.js';
import { SKILLS } from './catalog.js';
import { forgeBanner } from '../ui/banner.js';
import { VERSION } from '../version.js';

export interface WizardResult {
  name: string;
  slug: string;
  description: string;
  language: string;
  mode: 'startup' | 'standard' | 'enterprise';
  backend?: string;
  frontend?: string;
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

const BACKENDS: Record<string, p.Option<string>[]> = {
  typescript: [
    { value: 'hono',    label: 'Hono',    hint: 'edge-ready, ultraligero' },
    { value: 'express', label: 'Express', hint: 'el clásico' },
    { value: 'nestjs',  label: 'NestJS',  hint: 'enterprise, opinionado' },
    { value: 'fastify', label: 'Fastify', hint: 'rápido, plugins' },
    { value: 'none',    label: 'Ninguno' },
  ],
  python:     [{ value: 'fastapi', label: 'FastAPI', hint: 'async' }, { value: 'django', label: 'Django' }, { value: 'none', label: 'Ninguno' }],
  ruby:       [{ value: 'rails',   label: 'Rails' },   { value: 'none', label: 'Ninguno' }],
  go:         [{ value: 'go-gin',  label: 'Gin' },     { value: 'none', label: 'Ninguno' }],
  php:        [{ value: 'laravel', label: 'Laravel' }, { value: 'none', label: 'Ninguno' }],
};

const FRONTENDS: Record<string, p.Option<string>[]> = {
  typescript: [
    { value: 'nextjs',    label: 'Next.js',    hint: 'fullstack React' },
    { value: 'astro',     label: 'Astro',      hint: 'content-first' },
    { value: 'nuxt',      label: 'Nuxt',       hint: 'Vue' },
    { value: 'sveltekit', label: 'SvelteKit',  hint: 'Svelte' },
    { value: 'none',      label: 'Ninguno' },
  ],
};

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

  // ── Tech stack ──
  step(2, 4, 'Stack técnico');
  const language = check(await p.select({
    message: 'Lenguaje principal',
    initialValue: detected.language ?? 'typescript',
    options: [
      { value: 'typescript', label: 'TypeScript / JavaScript', hint: 'recomendado' },
      { value: 'python',     label: 'Python' },
      { value: 'ruby',       label: 'Ruby' },
      { value: 'go',         label: 'Go' },
      { value: 'php',        label: 'PHP' },
    ],
  })) as string;

  const mode = check(await p.select({
    message: 'Modo del proyecto',
    initialValue: 'standard',
    options: [
      { value: 'startup',    label: 'startup',    hint: 'mínimo viable, equipo pequeño' },
      { value: 'standard',   label: 'standard',   hint: 'CI/CD, code review, testing' },
      { value: 'enterprise', label: 'enterprise', hint: 'compliance, auditoría, multi-equipo' },
    ],
  })) as 'startup' | 'standard' | 'enterprise';

  const backendOpts = BACKENDS[language] ?? [{ value: 'none', label: 'Ninguno' }];
  const backendVal = check(await p.select({
    message: 'Framework backend',
    initialValue: detected.backend ?? backendOpts[0].value,
    options: backendOpts,
  })) as string;
  const backend = backendVal === 'none' ? undefined : backendVal;

  const frontendOpts = FRONTENDS[language];
  let frontend: string | undefined;
  if (frontendOpts) {
    const v = check(await p.select({
      message: 'Framework frontend',
      initialValue: detected.frontend ?? 'none',
      options: frontendOpts,
    })) as string;
    frontend = v === 'none' ? undefined : v;
  }

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
  const database = dbVal === 'none' ? undefined : dbVal;

  let orm: string | undefined;
  const ormOpts = ORMS[language];
  if (database && ormOpts) {
    const v = check(await p.select({
      message: 'ORM / query builder',
      initialValue: detected.orm ?? ormOpts[0].value,
      options: ormOpts,
    })) as string;
    orm = v === 'none' ? undefined : v;
  }

  const pmOpts = PKG_MANAGERS[language];
  let packageManager: string | undefined;
  if (pmOpts) {
    const v = check(await p.select({
      message: 'Package manager',
      initialValue: detected.packageManager ?? pmOpts[0].value,
      options: pmOpts,
    })) as string;
    packageManager = v === 'none' ? undefined : v;
  }

  const testOpts = TESTING_OPTS[language];
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
  const row = (k: string, v: string) => `  ${chalk.dim(k.padEnd(10))} ${v}`;
  const summary = [
    row('Nombre', chalk.bold(name)),
    row('Lenguaje', `${language}   ${chalk.dim('Modo:')} ${mode}`),
    backend  ? row('Backend', backend) : '',
    frontend ? row('Frontend', frontend) : '',
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
  for (const key of [backend, frontend]) {
    if (key && PROFILE_MAP[key]) profiles.push(PROFILE_MAP[key]);
  }

  return {
    name, slug, description: description || '', language, mode,
    backend, frontend, database, orm, packageManager, testing,
    profiles: [...new Set(profiles)], skills, runtime, detected: hasDetection,
  };
}
