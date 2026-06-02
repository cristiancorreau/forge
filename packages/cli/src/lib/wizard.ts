import { createInterface } from 'readline';

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
  testing?: string[];
  profiles?: string[];
  runtime: string;
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });

function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

function askWithDefault(question: string, def: string): Promise<string> {
  return new Promise(resolve =>
    rl.question(`${question} [${def}]: `, answer => {
      const a = answer.trim();
      resolve(a === '' ? def : a);
    })
  );
}

function askChoice(question: string, choices: string[], def?: string): Promise<string> {
  const choiceStr = choices.map((c, i) => `  ${i + 1}) ${c}`).join('\n');
  const defIdx = def ? choices.indexOf(def) + 1 : 1;
  return new Promise(resolve => {
    console.log(`\n${question}`);
    console.log(choiceStr);
    rl.question(`Elegir [${defIdx}]: `, answer => {
      const n = parseInt(answer.trim(), 10);
      if (n >= 1 && n <= choices.length) resolve(choices[n - 1]);
      else resolve(choices[defIdx - 1]);
    });
  });
}

function askMulti(question: string, choices: string[]): Promise<string[]> {
  const choiceStr = choices.map((c, i) => `  ${i + 1}) ${c}`).join('\n');
  return new Promise(resolve => {
    console.log(`\n${question} (números separados por coma, ej: 1,3)`);
    console.log(choiceStr);
    rl.question('Elegir: ', answer => {
      const selected = answer.trim().split(',')
        .map(s => parseInt(s.trim(), 10) - 1)
        .filter(i => i >= 0 && i < choices.length)
        .map(i => choices[i]);
      resolve(selected);
    });
  });
}

const BACKEND_BY_LANGUAGE: Record<string, string[]> = {
  typescript: ['hono', 'express', 'nestjs', 'none'],
  python:     ['fastapi', 'django', 'none'],
  ruby:       ['rails', 'none'],
  go:         ['go-gin', 'none'],
  php:        ['laravel', 'none'],
};

const FRONTEND_BY_LANGUAGE: Record<string, string[]> = {
  typescript: ['nextjs', 'astro', 'sveltekit', 'nuxt', 'none'],
  php:        ['none'],
  ruby:       ['rails-views', 'none'],
  python:     ['none'],
  go:         ['none'],
};

const DATABASE_OPTIONS = ['postgresql', 'mysql', 'sqlite', 'none'];

const ORM_BY_LANGUAGE: Record<string, string[]> = {
  typescript: ['drizzle', 'prisma', 'typeorm', 'none'],
  python:     ['sqlalchemy', 'none'],
  ruby:       ['active-record', 'none'],
  php:        ['none'],
  go:         ['none'],
};

const PM_BY_LANGUAGE: Record<string, string[]> = {
  typescript: ['pnpm', 'npm', 'yarn', 'bun'],
  python:     ['pip', 'poetry'],
  ruby:       ['bundler'],
  go:         ['none'],
  php:        ['none'],
};

const TESTING_BY_LANGUAGE: Record<string, string[]> = {
  typescript: ['vitest', 'jest', 'playwright', 'cypress'],
  python:     ['pytest'],
  ruby:       ['rspec'],
  go:         ['none'],
  php:        ['phpunit'],
};

const PROFILE_BY_STACK: Record<string, string[]> = {
  hono:    ['hono-drizzle'],
  nextjs:  ['nextjs-admin'],
  astro:   ['astro'],
  fastapi: ['fastapi'],
  rails:   ['rails'],
  laravel: ['laravel'],
  expo:    ['expo'],
};

const RUNTIME_OPTIONS = ['claude-code', 'opencode', 'codex', 'kiro'];

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function runWizard(): Promise<WizardResult | null> {
  console.log('\n╔════════════════════════════════════╗');
  console.log('║     forge — Asistente de inicio    ║');
  console.log('╚════════════════════════════════════╝\n');
  console.log('Responde las preguntas para configurar tu proyecto.\n');

  const name = await ask('Nombre del proyecto: ');
  if (!name) { rl.close(); return null; }

  const slugDefault = toSlug(name);
  const slug = await askWithDefault('Slug (identificador URL-safe)', slugDefault);
  const description = await askWithDefault('Descripción breve', '');

  const language = await askChoice(
    'Lenguaje principal:',
    ['typescript', 'python', 'ruby', 'go', 'php'],
    'typescript'
  );

  const mode = await askChoice(
    'Modo del proyecto:',
    ['startup  — mínimo viable, equipo pequeño', 'standard  — equipo mediano, CI/CD, revisión de código', 'enterprise  — compliance, auditoría, múltiples equipos'],
    'startup  — mínimo viable, equipo pequeño'
  ) as 'startup' | 'standard' | 'enterprise';
  const modeValue = mode.split('  ')[0] as 'startup' | 'standard' | 'enterprise';

  const backends = BACKEND_BY_LANGUAGE[language] ?? ['none'];
  const backendChoice = backends.length > 1
    ? await askChoice('Backend:', backends, backends[0])
    : backends[0];
  const backend = backendChoice === 'none' ? undefined : backendChoice;

  const frontends = FRONTEND_BY_LANGUAGE[language] ?? ['none'];
  const frontendChoice = frontends.length > 1
    ? await askChoice('Frontend:', frontends, frontends[0])
    : frontends[0];
  const frontend = frontendChoice === 'none' ? undefined : frontendChoice;

  const dbChoice = await askChoice('Base de datos:', DATABASE_OPTIONS, 'postgresql');
  const database = dbChoice === 'none' ? undefined : dbChoice;

  let orm: string | undefined;
  if (database) {
    const orms = ORM_BY_LANGUAGE[language] ?? ['none'];
    if (orms.length > 1) {
      const ormChoice = await askChoice('ORM / query builder:', orms, orms[0]);
      orm = ormChoice === 'none' ? undefined : ormChoice;
    }
  }

  const pms = PM_BY_LANGUAGE[language] ?? ['none'];
  const pmChoice = pms.length > 1
    ? await askChoice('Package manager:', pms, pms[0])
    : pms[0];
  const packageManager = pmChoice === 'none' ? undefined : pmChoice;

  const testingOptions = TESTING_BY_LANGUAGE[language] ?? [];
  let testing: string[] = [];
  if (testingOptions.length > 0 && testingOptions[0] !== 'none') {
    testing = await askMulti('Frameworks de testing:', testingOptions);
  }

  // Auto-suggest profiles based on stack
  const suggestedProfiles: string[] = [];
  for (const [key, profiles] of Object.entries(PROFILE_BY_STACK)) {
    if (backend === key || frontend === key) suggestedProfiles.push(...profiles);
  }

  const runtime = await askChoice(
    'Runtime de IA principal:',
    RUNTIME_OPTIONS,
    'claude-code'
  );

  rl.close();

  // Build profiles list from suggestions
  const profiles = [...new Set(suggestedProfiles)];

  return {
    name,
    slug,
    description,
    language,
    mode: modeValue,
    backend,
    frontend,
    database,
    orm,
    packageManager,
    testing,
    profiles,
    runtime,
  };
}
