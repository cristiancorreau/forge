/**
 * `forge analyze [path] [--json] [--write]` — deterministic, offline code
 * analysis of an existing repo (SPEC-061).
 *
 * Prints a readable report of the codebase (stack, busiest dirs, largest files,
 * TODO/FIXME markers, tests, suggested agents). `--json` for machines; `--write`
 * saves docs/analysis/<date>-analysis.md and points to the `/onboard` skill,
 * which runs the specialized agents to synthesize architecture/onboarding/
 * security documentation on top of this factual base.
 */
import { existsSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { analyzeCode, type CodeAnalysis } from '../lib/code-analysis.js';

const HELP = `Usage: forge analyze [path] [options]

Analyze an existing codebase (offline, deterministic, no LLM). Builds the
factual base the /onboard skill uses to document the project with agents.

Arguments:
  path            Repo root to analyze (default: current directory)

Options:
  --json          Print the full analysis as stable JSON
  --write         Save docs/analysis/<date>-analysis.md in the repo
  -h, --help      Show this help

Reports: detected stack, busiest directories, largest source files,
TODO/FIXME markers, test presence, and the forge agents the stack suggests.
Next step: run the /onboard skill to generate architecture/onboarding docs.
`;

function renderReport(a: CodeAnalysis): string {
  const p = a.project;
  const lines: string[] = [];
  lines.push('');
  lines.push('forge analyze — análisis del proyecto');
  lines.push('');
  lines.push(`  Proyecto:  ${p.name}${p.description ? ` — ${p.description}` : ''}`);
  const stackBits = [p.stack.backend, p.stack.frontend, p.stack.mobile, p.stack.database, p.stack.orm]
    .filter(Boolean);
  lines.push(`  Stack:     ${stackBits.length ? stackBits.join(' · ') : '(no detectado)'}`);
  lines.push(`  Tipo:      ${p.type}   ·   Ecosistema: ${p.ecosystem}`);
  lines.push('');

  if (a.languages.length) {
    const top = a.languages.slice(0, 6).map(l => `${l.ext} (${l.files})`).join(', ');
    lines.push(`  Lenguajes: ${top}`);
  }
  lines.push(`  Tests:     ${a.tests.present ? `${a.tests.files} archivo(s) de test` : 'no se detectaron tests'}`);
  const mk = a.markers;
  const mkBits = Object.entries(mk.byKind).map(([k, v]) => `${k}:${v}`).join(' ');
  lines.push(`  Marcadores: ${mk.total} (${mkBits || '—'})`);
  lines.push('');

  if (a.busiestDirs.length) {
    lines.push('  Directorios con más archivos:');
    for (const d of a.busiestDirs.slice(0, 6)) lines.push(`    ${String(d.fileCount).padStart(5)}  ${d.name}/`);
    lines.push('');
  }
  if (a.largestFiles.length) {
    lines.push('  Archivos más grandes (líneas):');
    for (const f of a.largestFiles.slice(0, 6)) lines.push(`    ${String(f.lines).padStart(5)}  ${f.path}`);
    lines.push('');
  }

  lines.push(`  Agentes sugeridos: ${a.suggestedAgents.join(', ')}`);
  lines.push('');
  lines.push('  Siguiente paso: ejecuta el skill /onboard para que los agentes');
  lines.push('  especializados lean el código y generen docs/architecture.md,');
  lines.push('  docs/onboarding.md y docs/security-review.md.');
  lines.push('');
  return lines.join('\n');
}

/** Markdown artifact written by --write. `date` is injected by the caller. */
function renderMarkdown(a: CodeAnalysis, date: string): string {
  const p = a.project;
  const md: string[] = [];
  md.push(`# Análisis del proyecto — ${p.name}`);
  md.push('');
  md.push(`> Generado por \`forge analyze\` el ${date}. Base factual para el skill \`/onboard\`.`);
  md.push('');
  md.push('## Stack detectado');
  md.push('');
  md.push(`- Backend: ${p.stack.backend ?? 'N/A'}`);
  md.push(`- Frontend: ${p.stack.frontend ?? 'N/A'}`);
  md.push(`- Mobile: ${p.stack.mobile ?? 'N/A'}`);
  md.push(`- Base de datos: ${p.stack.database ?? 'N/A'} · ORM: ${p.stack.orm ?? 'N/A'}`);
  md.push(`- Tipo: ${p.type} · Ecosistema: ${p.ecosystem}`);
  md.push('');
  md.push('## Lenguajes');
  md.push('');
  for (const l of a.languages.slice(0, 10)) md.push(`- \`.${l.ext}\` — ${l.files} archivo(s)`);
  md.push('');
  md.push('## Hotspots');
  md.push('');
  md.push('Directorios con más archivos:');
  md.push('');
  for (const d of a.busiestDirs) md.push(`- \`${d.name}/\` — ${d.fileCount} archivos`);
  md.push('');
  md.push('Archivos más grandes (líneas):');
  md.push('');
  for (const f of a.largestFiles) md.push(`- \`${f.path}\` — ${f.lines} líneas`);
  md.push('');
  md.push('## Señales');
  md.push('');
  md.push(`- Tests: ${a.tests.present ? `${a.tests.files} archivo(s)` : 'no detectados'}`);
  md.push(`- Marcadores TODO/FIXME/HACK/XXX: ${a.markers.total}`);
  md.push('');
  md.push('## Agentes sugeridos');
  md.push('');
  for (const ag of a.suggestedAgents) md.push(`- \`${ag}\``);
  md.push('');
  md.push('## Siguiente paso');
  md.push('');
  md.push('Ejecuta el skill `/onboard` para sintetizar `docs/architecture.md`,');
  md.push('`docs/onboarding.md` y `docs/security-review.md` con los agentes especializados.');
  md.push('');
  return md.join('\n');
}

export async function analyze(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const jsonMode = args.includes('--json');
  const writeMode = args.includes('--write');
  const pathArg = args.find(a => !a.startsWith('-'));
  const root = pathArg ?? process.cwd();

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    process.stderr.write(`forge analyze: la ruta "${root}" no existe o no es un directorio.\n`);
    return 1;
  }

  const result = analyzeCode(root);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }

  process.stdout.write(renderReport(result));

  if (writeMode) {
    // The clock lives here (the command), not in the pure analyzer, so analysis
    // stays reproducible while the artifact carries a date.
    const date = new Date().toISOString().slice(0, 10);
    const dir = join(root, 'docs', 'analysis');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${date}-analysis.md`);
    writeFileSync(file, renderMarkdown(result, date), 'utf-8');
    process.stdout.write(`  Escrito: ${file}\n\n`);
  }

  return 0;
}
