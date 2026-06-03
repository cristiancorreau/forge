import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  statSync,
} from 'fs';
import { join, basename, relative } from 'path';
import { findProjectYaml, projectRoot } from '../lib/yaml.js';
import { bold, dim, green, red, yellow, cyan, gray, icons } from '../ui/colors.js';
import { box } from '../ui/box.js';

const HELP = `Usage: forge wiki <subcommand> [options]

Manage the project knowledge base in <projectRoot>/wiki/.

Subcommands:
  status            Show wiki structure: page counts, control files, index health
  ingest <file>     Copy a source file into wiki/raw/ for later AI compilation
  query <q>         Search wiki pages (simple text match over wiki/*.md)
  lint              Check wiki integrity: broken links, orphans, index coverage

Options:
  -h, --help        Show this help

The wiki lives at <projectRoot>/wiki/ with index.md, log.md, raw/ and subdirs
(concepts/, entities/, sources/, synthesis/). Knowledge compilation from raw
sources is performed by the AI agent via the /wiki-ingest skill.
`;

const SUBDIRS = ['raw', 'concepts', 'entities', 'sources', 'synthesis'] as const;
const CONTROL_FILES = ['index.md', 'log.md'] as const;

/** Resolve the project root, falling back to cwd when no project.yaml exists. */
function resolveProjectRoot(): string {
  const yamlPath = findProjectYaml(process.cwd());
  return yamlPath ? projectRoot(yamlPath) : process.cwd();
}

function wikiRoot(): string {
  return join(resolveProjectRoot(), 'wiki');
}

/** Recursively collect every .md file under a directory (absolute paths). */
function collectMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function formatMtime(path: string): string {
  try {
    const d = statSync(path).mtime;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '—';
  }
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile()).length;
}

function latestMtime(dir: string): string {
  if (!existsSync(dir)) return '—';
  const files = readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => join(dir, e.name));
  if (files.length === 0) return '—';
  let latest = 0;
  for (const f of files) {
    try {
      const m = statSync(f).mtimeMs;
      if (m > latest) latest = m;
    } catch {
      // ignore unreadable entries
    }
  }
  return latest > 0 ? formatMtime(files.reduce((a, b) => (statSync(a).mtimeMs >= statSync(b).mtimeMs ? a : b))) : '—';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'source';
}

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

function wikiStatus(): number {
  const root = wikiRoot();
  console.log(cyan(bold('forge wiki status')) + '\n');

  if (!existsSync(root)) {
    console.log(`  ${yellow('wiki/ no existe.')} Ejecuta ${cyan('forge wiki ingest <file>')} para inicializarlo.\n`);
    console.log(box(yellow('Wiki no inicializado'), [`Esperado en: ${dim(root)}`]));
    return 0;
  }

  const W_DIR = 12;
  const W_COUNT = 8;

  console.log(
    `  ${bold('Directorio'.padEnd(W_DIR))}  ${bold('Archivos'.padEnd(W_COUNT))}  ${bold('Última modificación')}`,
  );
  console.log(`  ${gray('─'.repeat(W_DIR + W_COUNT + 24))}`);

  let total = 0;
  for (const sub of SUBDIRS) {
    const dirPath = join(root, sub);
    const count = countFiles(dirPath);
    total += count;
    console.log(
      `  ${sub.padEnd(W_DIR)}  ${String(count).padEnd(W_COUNT)}  ${dim(latestMtime(dirPath))}`,
    );
  }

  console.log(`\n  ${bold('Archivos de control:')}`);
  const missingControl: string[] = [];
  for (const fname of CONTROL_FILES) {
    const present = existsSync(join(root, fname));
    if (!present) missingControl.push(fname);
    const mark = present ? green('ok') : red('falta');
    console.log(`    wiki/${fname.padEnd(10)} [${mark}]`);
  }

  // index health: how many wiki pages are referenced by the index
  let indexNote = '';
  const indexPath = join(root, 'index.md');
  if (existsSync(indexPath)) {
    const indexContent = readFileSync(indexPath, 'utf-8');
    const pages = collectMarkdown(root).filter(
      p => !p.startsWith(join(root, 'raw')) && !CONTROL_FILES.includes(basename(p) as (typeof CONTROL_FILES)[number]),
    );
    const linked = pages.filter(p => {
      const rel = relative(root, p).replace(/\.md$/, '');
      const name = basename(p, '.md');
      return indexContent.includes(rel) || indexContent.includes(name);
    });
    indexNote = `${linked.length}/${pages.length} páginas en el índice`;
  }

  const lines: string[] = [`Total de páginas (excl. raw): ${green(String(total - countFiles(join(root, 'raw'))))}`];
  lines.push(`Fuentes en raw/: ${cyan(String(countFiles(join(root, 'raw'))))}`);
  if (indexNote) lines.push(indexNote);
  if (missingControl.length > 0) lines.push(red(`Faltan: ${missingControl.join(', ')}`));

  const title = missingControl.length === 0 ? green('Wiki saludable') : yellow('Wiki incompleto');
  console.log('\n' + box(title, lines));
  return 0;
}

// ---------------------------------------------------------------------------
// ingest
// ---------------------------------------------------------------------------

function ensureWikiStructure(root: string): boolean {
  let created = false;
  for (const sub of SUBDIRS) {
    const dirPath = join(root, sub);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      created = true;
    }
  }
  const seeds: Array<[string, string]> = [
    ['index.md', '# Wiki Index\n\n<!-- generado por forge wiki ingest -->\n'],
    ['log.md', '# Wiki Log\n\n<!-- ingesta registrada aquí -->\n'],
  ];
  for (const [fname, content] of seeds) {
    const fpath = join(root, fname);
    if (!existsSync(fpath)) {
      writeFileSync(fpath, content, 'utf-8');
      created = true;
    }
  }
  return created;
}

function wikiIngest(file: string | undefined): number {
  console.log(cyan(bold('forge wiki ingest')) + '\n');

  if (!file) {
    console.error(`  ${icons.error} Falta el archivo a ingestar.\n`);
    console.error(`  Uso: ${cyan('forge wiki ingest <file>')}\n`);
    return 1;
  }

  const source = file;
  if (!existsSync(source)) {
    console.error(`  ${icons.error} No se encontró el archivo: ${source}\n`);
    return 1;
  }
  if (!statSync(source).isFile()) {
    console.error(`  ${icons.error} No es un archivo regular: ${source}\n`);
    return 1;
  }

  const root = wikiRoot();
  if (ensureWikiStructure(root)) {
    console.log(`  ${green('Estructura creada.')} wiki/ inicializado con index.md y log.md.\n`);
  }

  const stamp = todayStamp();
  const slug = slugify(basename(source));
  const destName = `${stamp}-${slug}.md`;
  const destPath = join(root, 'raw', destName);

  try {
    copyFileSync(source, destPath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ${icons.error} No se pudo copiar la fuente: ${msg}\n`);
    return 1;
  }

  // append to log (append-only)
  const logPath = join(root, 'log.md');
  const entry = `\n- ${stamp} — ingest \`${basename(source)}\` → \`raw/${destName}\`\n`;
  try {
    const prev = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '# Wiki Log\n';
    writeFileSync(logPath, prev + entry, 'utf-8');
  } catch {
    // log is best-effort; do not fail the ingest
  }

  console.log(`  ${icons.ok} Fuente copiada a ${cyan(`wiki/raw/${destName}`)}\n`);
  console.log(`  ${bold('Siguiente paso:')}`);
  console.log(`    En Claude Code ejecuta: ${cyan('/wiki-ingest')} ${dim(`wiki/raw/${destName}`)}`);
  console.log(`    El skill compila el conocimiento en páginas wiki y actualiza el índice.\n`);

  console.log(box(green('Ingesta registrada'), [
    `raw/${destName}`,
    `log.md actualizado`,
  ]));
  return 0;
}

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

function wikiQuery(queryArg: string | undefined): number {
  console.log(cyan(bold('forge wiki query')) + '\n');

  if (!queryArg || queryArg.trim().length === 0) {
    console.error(`  ${icons.error} Falta la consulta.\n`);
    console.error(`  Uso: ${cyan('forge wiki query <texto>')}\n`);
    return 1;
  }

  const root = wikiRoot();
  if (!existsSync(root)) {
    console.log(`  ${yellow('wiki/ no existe.')} Ejecuta ${cyan('forge wiki ingest <file>')} para inicializarlo.\n`);
    return 0;
  }

  const query = queryArg.toLowerCase();
  // search wiki pages (exclude raw/ — those are unprocessed sources)
  const pages = collectMarkdown(root).filter(p => !p.startsWith(join(root, 'raw') + (process.platform === 'win32' ? '\\' : '/')));

  interface Match {
    path: string;
    hits: number;
    sample: string;
  }
  const matches: Match[] = [];

  for (const page of pages) {
    let content: string;
    try {
      content = readFileSync(page, 'utf-8');
    } catch {
      continue;
    }
    const lower = content.toLowerCase();
    if (!lower.includes(query)) continue;

    let hits = 0;
    let from = 0;
    while (true) {
      const idx = lower.indexOf(query, from);
      if (idx === -1) break;
      hits++;
      from = idx + query.length;
    }

    const firstLine = content
      .split('\n')
      .find(l => l.toLowerCase().includes(query)) ?? '';
    matches.push({ path: page, hits, sample: firstLine.trim().slice(0, 80) });
  }

  matches.sort((a, b) => b.hits - a.hits);

  if (matches.length === 0) {
    console.log(`  ${dim(`Sin coincidencias para "${queryArg}".`)}\n`);
    console.log(`  ${bold('Sugerencia:')} usa el skill semántico ${cyan('/wiki-query')} ${dim(queryArg)}`);
    return 0;
  }

  console.log(`  ${matches.length} página(s) coinciden con ${bold(`"${queryArg}"`)}\n`);
  for (const m of matches) {
    const rel = relative(root, m.path);
    console.log(`  ${icons.ok} ${cyan(`wiki/${rel}`)} ${gray(`(${m.hits})`)}`);
    if (m.sample) console.log(`      ${dim(m.sample)}`);
  }
  console.log(`\n  ${dim('Para una respuesta con citas, usa')} ${cyan('/wiki-query')} ${dim('en Claude Code.')}`);
  return 0;
}

// ---------------------------------------------------------------------------
// lint
// ---------------------------------------------------------------------------

interface LintIssue {
  level: 'error' | 'warn' | 'info' | 'ok';
  message: string;
}

function wikiLint(): number {
  console.log(cyan(bold('forge wiki lint')) + '\n');

  const root = wikiRoot();
  if (!existsSync(root)) {
    console.log(`  ${yellow('wiki/ no existe.')} Ejecuta ${cyan('forge wiki ingest <file>')} para inicializarlo.\n`);
    return 0;
  }

  const issues: LintIssue[] = [];

  // 1. control files
  for (const fname of CONTROL_FILES) {
    if (!existsSync(join(root, fname))) {
      issues.push({ level: 'error', message: `Falta archivo de control: ${fname}` });
    }
  }

  const indexPath = join(root, 'index.md');
  const indexContent = existsSync(indexPath) ? readFileSync(indexPath, 'utf-8') : '';

  // wiki pages = all .md except raw/ and control files
  const sep = process.platform === 'win32' ? '\\' : '/';
  const pages = collectMarkdown(root).filter(
    p =>
      !p.startsWith(join(root, 'raw') + sep) &&
      !CONTROL_FILES.includes(basename(p) as (typeof CONTROL_FILES)[number]),
  );

  // 2. broken wikilinks [[ruta/nombre]]
  const linkRe = /\[\[([^\]]+)\]\]/g;
  let brokenLinks = 0;
  for (const page of pages.concat(existsSync(indexPath) ? [indexPath] : [])) {
    let content: string;
    try {
      content = readFileSync(page, 'utf-8');
    } catch {
      continue;
    }
    let m: RegExpExecArray | null;
    linkRe.lastIndex = 0;
    while ((m = linkRe.exec(content)) !== null) {
      const target = m[1].split('|')[0].trim().replace(/\.md$/, '');
      const candidate = join(root, `${target}.md`);
      if (!existsSync(candidate)) {
        brokenLinks++;
        issues.push({
          level: 'warn',
          message: `Link roto en ${relative(root, page)}: [[${m[1]}]]`,
        });
      }
    }
  }
  if (brokenLinks === 0) issues.push({ level: 'ok', message: 'Sin wikilinks rotos' });

  // 3. index coverage: pages not referenced by the index
  let orphans = 0;
  if (indexContent) {
    for (const page of pages) {
      const rel = relative(root, page).replace(/\.md$/, '');
      const name = basename(page, '.md');
      if (!indexContent.includes(rel) && !indexContent.includes(name)) {
        orphans++;
        issues.push({ level: 'warn', message: `Página huérfana (no está en el índice): ${relative(root, page)}` });
      }
    }
    if (orphans === 0 && pages.length > 0) issues.push({ level: 'ok', message: 'Todas las páginas están en el índice' });
  } else if (pages.length > 0) {
    issues.push({ level: 'warn', message: 'index.md ausente o vacío — no se puede verificar cobertura' });
  }

  // 4. log freshness
  const logPath = join(root, 'log.md');
  if (existsSync(logPath)) {
    const ageDays = (Date.now() - statSync(logPath).mtimeMs) / 86_400_000;
    if (ageDays > 30) {
      issues.push({ level: 'info', message: `log.md sin cambios hace ${Math.round(ageDays)} días — wiki posiblemente abandonado` });
    }
  }

  // render
  for (const issue of issues) {
    const icon = icons[issue.level] ?? gray('·');
    console.log(`  [${icon}] ${dim(issue.message)}`);
  }

  const errors = issues.filter(i => i.level === 'error').length;
  const warnings = issues.filter(i => i.level === 'warn').length;
  const okCount = issues.filter(i => i.level === 'ok').length;

  const summary = `${green(`${okCount} OK`)} · ${yellow(`${warnings} warn`)} · ${red(`${errors} ✗`)}`;
  const title =
    errors > 0 ? red('Problemas de integridad') : warnings > 0 ? yellow('Advertencias') : green('Wiki íntegro');
  console.log('\n' + box(title, [summary]));

  return errors > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export async function wiki(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case 'status':
      return wikiStatus();
    case 'ingest':
      return wikiIngest(rest[0]);
    case 'query':
      return wikiQuery(rest.join(' ').trim() || undefined);
    case 'lint':
      return wikiLint();
    case undefined:
      process.stdout.write(HELP);
      return 0;
    default:
      console.error(`Unknown wiki subcommand: ${sub}\nRun forge wiki --help for usage.\n`);
      return 1;
  }
}