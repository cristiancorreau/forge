/**
 * Auto-generate a FACTUAL project wiki from a static `ProjectAnalysis`.
 *
 * This seeds <root>/wiki/ with what the deterministic analysis KNOWS — stack,
 * structure, dependencies, entrypoints, scripts, README summary — using the
 * existing wiki structure (index.md, log.md, raw/, concepts/, entities/,
 * sources/, synthesis/), with correct [[wikilinks]] and frontmatter matching
 * templates/wiki/*. It NEVER invents behaviour: the deep semantic compilation
 * (business logic, decisions) stays the job of the /wiki-ingest skill, which the
 * generated overview points to explicitly.
 *
 * Invariants (so `forge wiki lint` is clean):
 *  - every [[link]] resolves to a generated page,
 *  - index.md references every generated page (no orphans),
 *  - control files (index.md, log.md) are present.
 *
 * Pure except for the filesystem writes it performs under `root`.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import type { ProjectAnalysis, DependencyInfo } from './project-analysis.js';
import { slugify } from './project-analysis.js';
import { languageLabel } from './wizard-flow.js';

interface WikiPage {
  /** Section dir: concepts | entities | sources | synthesis. */
  section: 'concepts' | 'entities' | 'sources' | 'synthesis';
  /** File slug (without .md). */
  slug: string;
  /** Display title (for the index table). */
  title: string;
  /** One-line description (for the index table). */
  description: string;
  /** Full markdown content (frontmatter + body). */
  content: string;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Escape a value for safe use inside a markdown table cell. */
function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

/** Human label for a detected framework/tool (falls back to the raw id). */
function frameworkLabel(id: string): string {
  const map: Record<string, string> = {
    hono: 'Hono', express: 'Express', nestjs: 'NestJS', fastify: 'Fastify',
    fastapi: 'FastAPI', flask: 'Flask', django: 'Django', rails: 'Rails', laravel: 'Laravel',
    springboot: 'Spring Boot', axum: 'Axum', actix: 'Actix-web', rocket: 'Rocket',
    nextjs: 'Next.js', astro: 'Astro', nuxt: 'Nuxt', sveltekit: 'SvelteKit',
    flutter: 'Flutter', 'react-native': 'React Native', expo: 'Expo',
    drizzle: 'Drizzle ORM', prisma: 'Prisma', typeorm: 'TypeORM',
    vitest: 'Vitest', jest: 'Jest', playwright: 'Playwright', cypress: 'Cypress',
  };
  return map[id] ?? id;
}

// ---------------------------------------------------------------------------
// Page builders (each returns FACTUAL content derived from the analysis)
// ---------------------------------------------------------------------------

/** entities/<slug>.md for the project itself. */
function buildProjectEntity(a: ProjectAnalysis, frameworkSlugs: string[]): WikiPage {
  const slug = slugify(a.name);
  const sourceLinks = a.keyFiles
    .filter(f => f.kind === 'readme' || f.kind === 'manifest')
    .map(f => `- [[sources/${sourceSlug(f.path)}]] — ${f.path}`);
  const fwLinks = frameworkSlugs.map(s => `- [[entities/${s}]]`);

  const lines = [
    '---',
    `title: ${a.name}`,
    'type: project',
    'tags: [proyecto]',
    `sources: [${a.keyFiles.filter(f => f.kind === 'readme' || f.kind === 'manifest').map(f => sourceSlug(f.path)).join(', ')}]`,
    `updated: ${today()}`,
    '---',
    '',
    `# ${a.name}`,
    '',
    a.description || 'Proyecto analizado por `forge adopt` (descripción no declarada en el manifest).',
    '',
    '## Hechos',
    '',
    `- Tipo: ${a.type}`,
    `- Ecosistema: ${a.ecosystem}`,
    a.stack.language ? `- Lenguaje base: ${languageLabel(a.stack.language)}` : '',
    a.git.remote ? `- Repositorio: ${a.git.remote}` : '',
    a.git.branch ? `- Rama por defecto: ${a.git.branch}` : '',
    '',
    '## Stack y herramientas',
    '',
    'Ver [[concepts/stack]] y [[concepts/arquitectura]].',
    fwLinks.length ? '' : '',
    ...fwLinks,
    '',
    '## Fuentes',
    '',
    ...(sourceLinks.length ? sourceLinks : ['- (sin fuentes clave detectadas)']),
  ].filter(l => l !== undefined);

  return {
    section: 'entities',
    slug,
    title: a.name,
    description: `Proyecto ${a.type} (${a.ecosystem})`,
    content: lines.join('\n') + '\n',
  };
}

/** entities/<slug>.md for a detected framework/tool/major dependency. */
function buildToolEntity(id: string, role: string, projectSlug: string): WikiPage {
  const label = frameworkLabel(id);
  const slug = slugify(id);
  const content = [
    '---',
    `title: ${label}`,
    'type: framework',
    `tags: [${role}]`,
    'sources: []',
    `updated: ${today()}`,
    '---',
    '',
    `# ${label}`,
    '',
    `${label} es ${roleSentence(role)} detectado en este proyecto.`,
    '',
    '## Relevancia para el proyecto',
    '',
    `Forma parte del stack del proyecto ([[entities/${projectSlug}]]). Rol: ${role}.`,
    '',
    '## Fuentes',
    '',
    '- Detectado por análisis estático (`forge adopt`). Pendiente de documentación semántica vía [[synthesis/overview]].',
  ].join('\n');
  return {
    section: 'entities',
    slug,
    title: label,
    description: `${role} del stack`,
    content: content + '\n',
  };
}

function roleSentence(role: string): string {
  const map: Record<string, string> = {
    backend: 'el framework de backend',
    frontend: 'el framework de frontend',
    mobile: 'el framework de mobile',
    orm: 'el ORM / capa de datos',
    testing: 'una herramienta de testing',
    dependency: 'una dependencia mayor',
  };
  return map[role] ?? 'una herramienta';
}

/** sources/<slug>.md summarizing the FACTS found in a key file. */
function buildSourcePage(a: ProjectAnalysis, relPath: string, kind: string): WikiPage {
  const slug = sourceSlug(relPath);
  const abs = join(a.root, relPath);
  let summary = '';
  let facts: string[] = [];

  if (kind === 'readme') {
    const text = safeRead(abs);
    summary = readmeSummary(text);
    facts = readmeHeadings(text);
  } else if (kind === 'manifest') {
    summary = `Manifest del proyecto (${relPath}). Declara metadatos, dependencias y/o scripts.`;
    if (a.ecosystem === 'npm' && relPath === 'package.json') {
      facts = [
        `Nombre declarado: ${a.name}`,
        a.description ? `Descripción: ${a.description}` : '',
        `Dependencias listadas: ${a.dependencies.filter(d => !d.dev).length} runtime, ${a.dependencies.filter(d => d.dev).length} dev (top ${a.dependencies.length})`,
        Object.keys(a.scripts).length ? `Scripts: ${Object.keys(a.scripts).join(', ')}` : '',
      ].filter(Boolean);
    }
  }

  const content = [
    '---',
    `title: ${basename(relPath)}`,
    `source: ${relPath}`,
    `ingested: ${today()}`,
    'tags: [fuente, autogen]',
    '---',
    '',
    `# ${basename(relPath)}`,
    '',
    '## Resumen',
    '',
    summary || `Fuente \`${relPath}\` copiada a \`raw/\` para compilación semántica posterior.`,
    '',
    '## Hechos clave',
    '',
    ...(facts.length ? facts.map(f => `- ${f}`) : ['- Ver el archivo original en `raw/`.']),
    '',
    '## Pendiente',
    '',
    'La compilación semántica de esta fuente la realiza `/wiki-ingest`. Ver [[synthesis/overview]].',
  ].join('\n');

  return {
    section: 'sources',
    slug,
    title: basename(relPath),
    description: `Fuente: ${relPath}`,
    content: content + '\n',
  };
}

/** concepts/arquitectura.md from the directory map. */
function buildArchitectureConcept(a: ProjectAnalysis): WikiPage {
  const rows = a.directories.slice(0, 20).map(d => {
    const exts = d.dominantExtensions.length ? d.dominantExtensions.join(', ') : '—';
    return `| \`${d.name}/\` | ${d.fileCount} | ${cell(exts)} |`;
  });
  const entryLines = a.entrypoints.length
    ? a.entrypoints.map(e => `- \`${e}\``)
    : ['- (no se detectaron entrypoints convencionales)'];

  const content = [
    '---',
    'title: Arquitectura',
    'tags: [arquitectura, estructura, autogen]',
    'sources: []',
    `updated: ${today()}`,
    '---',
    '',
    '# Arquitectura',
    '',
    'Estructura del proyecto derivada del mapa de directorios (análisis estático).',
    '',
    '## Mapa de directorios (top-level)',
    '',
    '| Directorio | Archivos | Extensiones dominantes |',
    '|------------|----------|------------------------|',
    ...(rows.length ? rows : ['| _(sin subdirectorios)_ | | |']),
    '',
    '## Entrypoints',
    '',
    ...entryLines,
    '',
    '## Relación con el stack',
    '',
    'Ver [[concepts/stack]] para lenguajes y frameworks por lado.',
    '',
    '## Pendiente',
    '',
    'El significado de cada carpeta y los límites entre módulos los compila',
    '`/wiki-ingest`. Ver [[synthesis/overview]].',
  ].join('\n');

  return {
    section: 'concepts',
    slug: 'arquitectura',
    title: 'Arquitectura',
    description: 'Mapa de directorios y entrypoints',
    content: content + '\n',
  };
}

/** concepts/stack.md from languages + frameworks per side. */
function buildStackConcept(a: ProjectAnalysis, frameworkSlugs: string[]): WikiPage {
  const s = a.stack;
  const rows: string[] = [];
  const row = (k: string, v: string) => rows.push(`| ${k} | ${cell(v)} |`);
  if (s.backend) row('Backend', `${frameworkLabel(s.backend)}${s.backendLanguage ? ` (${languageLabel(s.backendLanguage)})` : ''}`);
  if (s.frontend) row('Frontend', `${frameworkLabel(s.frontend)}${s.frontendLanguage ? ` (${languageLabel(s.frontendLanguage)})` : ''}`);
  if (s.mobile) row('Mobile', `${frameworkLabel(s.mobile)}${s.mobileLanguage ? ` (${languageLabel(s.mobileLanguage)})` : ''}`);
  if (s.database) row('Base de datos', s.database);
  if (s.orm) row('ORM', frameworkLabel(s.orm));
  if (s.packageManager) row('Package manager', s.packageManager);
  if (s.testing.length) row('Testing', s.testing.map(frameworkLabel).join(', '));
  if (s.isMonorepo) row('Monorepo', 'sí');
  if (s.hasDocker) row('Docker', 'sí');

  const fwLinks = frameworkSlugs.map(slug => `- [[entities/${slug}]]`);

  const content = [
    '---',
    'title: Stack',
    'tags: [stack, tecnologia, autogen]',
    'sources: []',
    `updated: ${today()}`,
    '---',
    '',
    '# Stack',
    '',
    `Stack detectado por análisis estático. Tipo de proyecto: **${a.type}**.`,
    '',
    '| Capa | Tecnología |',
    '|------|------------|',
    ...(rows.length ? rows : ['| Lenguaje | ' + cell(s.language ? languageLabel(s.language) : 'no detectado') + ' |']),
    '',
    '## Componentes documentados',
    '',
    ...(fwLinks.length ? fwLinks : ['- (sin frameworks con página propia)']),
    '',
    '## Arquitectura',
    '',
    'Ver [[concepts/arquitectura]] para el mapa de directorios.',
  ].join('\n');

  return {
    section: 'concepts',
    slug: 'stack',
    title: 'Stack',
    description: 'Lenguajes y frameworks por lado',
    content: content + '\n',
  };
}

/** synthesis/overview.md — factual overview + the /wiki-ingest pendiente note. */
function buildOverviewSynthesis(a: ProjectAnalysis, pages: WikiPage[], rawSources: string[]): WikiPage {
  const sourcePages = pages.filter(p => p.section === 'sources').map(p => `- [[sources/${p.slug}]]`);
  const ingestList = rawSources.length
    ? rawSources.map(r => `- \`wiki/raw/${r}\``)
    : ['- (sin fuentes copiadas a raw/)'];

  const content = [
    '---',
    'title: Overview del proyecto',
    'tags: [overview, sintesis, autogen]',
    'sources: []',
    `updated: ${today()}`,
    '---',
    '',
    '# Overview del proyecto',
    '',
    `Resumen factual de **${a.name}**, generado por \`forge adopt\` desde análisis`,
    'estático. Documenta lo que se puede deducir sin ejecutar ni interpretar',
    'lógica de negocio.',
    '',
    '## Qué es',
    '',
    a.description || `Proyecto ${a.type} (${a.ecosystem}). Descripción no declarada en el manifest.`,
    '',
    '## Hechos verificados',
    '',
    `- Tipo: ${a.type}`,
    a.stack.language ? `- Lenguaje base: ${languageLabel(a.stack.language)}` : '',
    a.stack.backend ? `- Backend: ${frameworkLabel(a.stack.backend)}` : '',
    a.stack.frontend ? `- Frontend: ${frameworkLabel(a.stack.frontend)}` : '',
    a.stack.mobile ? `- Mobile: ${frameworkLabel(a.stack.mobile)}` : '',
    `- Directorios top-level: ${a.directories.length}`,
    `- Entrypoints detectados: ${a.entrypoints.length}`,
    '',
    'Detalle en [[concepts/stack]] y [[concepts/arquitectura]].',
    '',
    '## Fuentes documentadas',
    '',
    ...(sourcePages.length ? sourcePages : ['- (sin fuentes)']),
    '',
    '## Pendiente: compilación semántica con /wiki-ingest',
    '',
    'Este wiki contiene **hechos**, no la semántica del proyecto. La lógica de',
    'negocio, las decisiones de arquitectura y el "por qué" de cada módulo NO se',
    'derivan del análisis estático. Para compilarlos, ejecutá `/wiki-ingest`',
    'sobre las fuentes sembradas en `raw/`:',
    '',
    ...ingestList,
    '',
    'Luego `/wiki-query` responde con citas y `/wiki-lint` verifica integridad.',
  ].filter(l => l !== '').join('\n');

  return {
    section: 'synthesis',
    slug: 'overview',
    title: 'Overview del proyecto',
    description: 'Resumen factual + pendiente semántico',
    content: content + '\n',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stable slug for a source file (README.md → readme, package.json → package-json). */
function sourceSlug(relPath: string): string {
  return basename(relPath).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'source';
}

function safeRead(abs: string): string {
  try {
    if (!existsSync(abs) || !statSync(abs).isFile()) return '';
    return readFileSync(abs, 'utf-8');
  } catch {
    return '';
  }
}

/** First non-heading paragraph of a README, trimmed. */
function readmeSummary(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const para: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (para.length) break; else continue; }
    if (line.startsWith('#')) { if (para.length) break; else continue; }
    if (line.startsWith('![') || line.startsWith('[![')) continue; // badges
    if (line.startsWith('<')) continue; // raw HTML
    para.push(line);
    if (para.join(' ').length > 400) break;
  }
  return para.join(' ').slice(0, 500);
}

/** Top-level headings of a README (the documented sections). */
function readmeHeadings(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^#{1,2}\s+(.+?)\s*$/);
    if (m) out.push(`Sección: ${m[1].trim()}`);
    if (out.length >= 8) break;
  }
  return out;
}

/** Major dependencies worth their own entity page (framework/orm aside). */
function majorDependencies(deps: DependencyInfo[], already: Set<string>): string[] {
  const NOTABLE = new Set([
    'react', 'vue', 'svelte', 'tailwindcss', 'zod', 'trpc', '@trpc/server',
    'graphql', 'redis', 'ioredis', 'mongoose', 'sequelize', 'knex',
    'stripe', 'aws-sdk', '@aws-sdk/client-s3', 'axios', 'socket.io',
  ]);
  const out: string[] = [];
  for (const d of deps) {
    if (d.dev) continue;
    if (already.has(slugify(d.name))) continue;
    if (NOTABLE.has(d.name)) out.push(d.name);
    if (out.length >= 4) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// index.md / log.md writers
// ---------------------------------------------------------------------------

function buildIndex(a: ProjectAnalysis, pages: WikiPage[]): string {
  const section = (label: string, key: WikiPage['section']): string => {
    const rows = pages.filter(p => p.section === key)
      .map(p => `| [[${key}/${p.slug}]] | ${cell(p.description)} |`);
    return [
      `## ${label}`,
      '',
      '| Página | Descripción |',
      '|--------|-------------|',
      ...(rows.length ? rows : ['| _(vacío)_ | |']),
      '',
    ].join('\n');
  };

  return [
    '# Wiki — Índice',
    '',
    `> Catálogo de páginas. Sembrado por \`forge adopt\` para **${a.name}**.`,
    '> Para profundizar con semántica: `/wiki-ingest <url | archivo | texto>`',
    '',
    section('Conceptos', 'concepts'),
    section('Entidades', 'entities'),
    section('Fuentes', 'sources'),
    section('Síntesis', 'synthesis'),
    '---',
    '',
    `*Última actualización: ${today()} — generado por forge adopt*`,
    '',
  ].join('\n');
}

function appendLog(root: string, a: ProjectAnalysis, pageCount: number, rawCount: number): void {
  const logPath = join(root, 'wiki', 'log.md');
  const header = '# Wiki — Log de operaciones\n\n> Append-only. NUNCA editar ni borrar entradas anteriores.\n> Formato: `## [YYYY-MM-DD] <operación> | <título>`\n\n<!-- Las entradas se agregan aquí arriba, las más recientes primero -->\n';
  const entry = [
    '',
    `## [${today()}] adopt | Wiki sembrado para ${a.name}`,
    '',
    `- Generado por \`forge adopt\` (análisis estático, factual).`,
    `- Páginas creadas: ${pageCount}. Fuentes en raw/: ${rawCount}.`,
    `- Tipo: ${a.type}. Ecosistema: ${a.ecosystem}.`,
    `- Pendiente: compilación semántica vía /wiki-ingest.`,
    '',
  ].join('\n');

  let prev: string;
  try {
    prev = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : header;
  } catch {
    prev = header;
  }
  try {
    writeFileSync(logPath, prev + entry, 'utf-8');
  } catch {
    // log is best-effort
  }
}

// ---------------------------------------------------------------------------
// raw/ source copies
// ---------------------------------------------------------------------------

/** Copy README + primary manifest into raw/ as dated immutable sources. */
function copyRawSources(a: ProjectAnalysis): string[] {
  const rawDir = join(a.root, 'wiki', 'raw');
  mkdirSync(rawDir, { recursive: true });
  const copied: string[] = [];
  const stamp = today();

  const toCopy = a.keyFiles.filter(f => f.kind === 'readme' || (f.kind === 'manifest' && f.path === a.manifest));
  for (const f of toCopy) {
    const src = join(a.root, f.path);
    if (!existsSync(src)) continue;
    const destName = `${stamp}-${sourceSlug(f.path)}.md`;
    const dest = join(rawDir, destName);
    try {
      copyFileSync(src, dest);
      copied.push(destName);
    } catch {
      // skip unreadable source
    }
  }
  return copied;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WikiGenResult {
  pages: string[];      // relative POSIX paths of pages written
  rawSources: string[]; // raw/ filenames seeded
}

/**
 * Build the list of wiki pages (pure — no I/O). Exposed for testing the content
 * and link graph without touching the filesystem.
 */
export function buildWikiPages(a: ProjectAnalysis): WikiPage[] {
  const projectSlug = slugify(a.name);
  const pages: WikiPage[] = [];

  // Framework/tool entities first (so the project entity can link them).
  const toolEntities: WikiPage[] = [];
  const seen = new Set<string>();
  const addTool = (id: string | null, role: string): void => {
    if (!id) return;
    const slug = slugify(id);
    if (seen.has(slug) || slug === projectSlug) return;
    seen.add(slug);
    toolEntities.push(buildToolEntity(id, role, projectSlug));
  };
  addTool(a.stack.backend, 'backend');
  addTool(a.stack.frontend, 'frontend');
  addTool(a.stack.mobile, 'mobile');
  addTool(a.stack.orm, 'orm');
  for (const t of a.stack.testing) addTool(t, 'testing');
  for (const dep of majorDependencies(a.dependencies, seen)) addTool(dep, 'dependency');

  const frameworkSlugs = toolEntities.map(p => p.slug);

  // concepts
  pages.push(buildArchitectureConcept(a));
  pages.push(buildStackConcept(a, frameworkSlugs));

  // entities (project + tools)
  pages.push(buildProjectEntity(a, frameworkSlugs));
  pages.push(...toolEntities);

  // sources (README + manifests)
  for (const f of a.keyFiles) {
    if (f.kind === 'readme' || f.kind === 'manifest') {
      pages.push(buildSourcePage(a, f.path, f.kind));
    }
  }

  // synthesis (needs the source pages to link them) — rawSources filled at write time.
  pages.push(buildOverviewSynthesis(a, pages, []));

  return pages;
}

/**
 * Generate the populated wiki under <root>/wiki/ from a ProjectAnalysis.
 * Assumes the templated wiki structure already exists (scaffoldWikiStructure).
 * Writes pages, copies raw sources, rewrites index.md and appends to log.md.
 * Idempotent on re-run (pages are overwritten with the same factual content).
 */
export function generateWiki(a: ProjectAnalysis): WikiGenResult {
  const wikiRoot = join(a.root, 'wiki');
  for (const sub of ['concepts', 'entities', 'sources', 'synthesis', 'raw']) {
    mkdirSync(join(wikiRoot, sub), { recursive: true });
  }

  // Copy raw sources first so the overview can reference them.
  const rawSources = copyRawSources(a);

  const pages = buildWikiPages(a);

  // Re-build the overview now that we know the raw source filenames.
  const overviewIdx = pages.findIndex(p => p.section === 'synthesis' && p.slug === 'overview');
  if (overviewIdx !== -1) {
    pages[overviewIdx] = buildOverviewSynthesis(a, pages, rawSources);
  }

  const written: string[] = [];
  for (const page of pages) {
    const dest = join(wikiRoot, page.section, `${page.slug}.md`);
    try {
      writeFileSync(dest, page.content, 'utf-8');
      written.push(`${page.section}/${page.slug}.md`);
    } catch {
      // skip unwritable page
    }
  }

  // index.md (rewritten with all pages) + log.md (append-only).
  try {
    writeFileSync(join(wikiRoot, 'index.md'), buildIndex(a, pages), 'utf-8');
  } catch {
    // best-effort
  }
  appendLog(a.root, a, written.length, rawSources.length);

  return { pages: written, rawSources };
}
