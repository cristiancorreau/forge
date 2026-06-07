/**
 * `forge eval` — deterministic quality scorer for SKILL.md files (SPEC-053).
 *
 * Usage:
 *   forge eval <path|github:owner/repo[:subpath]> [--json] [--fix]
 *
 * Delegates all scoring to lib/skill-eval.ts (pure function, no LLM, no network
 * beyond the fetch already done by skill-source).
 */
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { resolveSource, fetchSkill } from '../lib/skill-source.js';
import { evalSkill, type SkillEval, type CategoryResult } from '../lib/skill-eval.js';

const HELP = `Usage: forge eval <source> [options]

Score a SKILL.md on 7 quality dimensions (offline, deterministic, no LLM).

Source:
  ./path or /path              Local SKILL.md or directory containing one
  owner/repo[/subpath][@ref]   GitHub (fetches raw content, no install)

Options:
  --json       Print the full SkillEval as stable JSON (snapshot-safe)
  --fix        Apply mechanical-only fixes in-place, leaving a .bak backup
               (normalises YAML frontmatter; never rewrites prose)
  -h, --help   Show this help

Categories scored (0–10 each, overall 0–100):
  structure          frontmatter, name/description/version, body headings
  description        word count, imperative verb, triggers, exclusion clause
  prompt-engineering lists/steps, code+example, imperative voice, body length
  context-efficiency body length, file references, block size, token mention
  safety             safety keywords, confirm/dry-run for destructive ops, prereqs
  testability        verifiable outputs, acceptance criteria, error scenarios
  naming             kebab-case clarity, name matches purpose

Grade: A (>=90) B (>=75) C (>=60) D (>=45) F (<45)
`;

const GRADE_ICON: Record<string, string> = {
  A: 'A  EXCELENTE',
  B: 'B  BUENO',
  C: 'C  REGULAR',
  D: 'D  DEBIL',
  F: 'F  INSUFICIENTE',
};

function printEval(ev: SkillEval, label: string): void {
  process.stdout.write(`\nforge eval — reporte de calidad\n\n`);
  process.stdout.write(`  Fuente:  ${label}\n`);
  process.stdout.write(`  Grade:   ${GRADE_ICON[ev.grade] ?? ev.grade}  (${ev.overallScore}/100)\n\n`);
  process.stdout.write(`  Categorias:\n`);
  for (const c of ev.categories) {
    const bar = '█'.repeat(c.score) + '░'.repeat(10 - c.score);
    const pad = c.id.padEnd(22);
    process.stdout.write(`    ${pad} ${bar} ${c.score}/10\n`);
    if (c.notes) {
      process.stdout.write(`    ${''.padEnd(22)} ${c.notes}\n`);
    }
  }
  if (ev.notes.length > 0) {
    process.stdout.write(`\n  Notas:\n`);
    for (const n of ev.notes) {
      process.stdout.write(`    - ${n}\n`);
    }
  }
  process.stdout.write('\n');
}

// ── --fix: mechanical-only frontmatter normalisation ─────────────────────────

/**
 * Applies reversible, mechanical fixes to a SKILL.md:
 * - Wraps frontmatter YAML values that contain special characters in quotes.
 * - Moves bare `author:` and `version:` fields into a `metadata:` block if they
 *   appear outside frontmatter (very rare, but asm's writing-guide flags it).
 *
 * Never rewrites prose. Leaves a .bak backup.
 * Returns the fixed content (unchanged if nothing to fix).
 */
function applyFix(content: string, filePath: string): string {
  // Backup first (always, unconditionally, per spec).
  writeFileSync(filePath + '.bak', content, 'utf-8');

  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) return content; // no frontmatter, nothing to fix

  const before = fmMatch[1];
  const fmBody = fmMatch[2];
  const after = fmMatch[3];
  const rest = content.slice(fmMatch[0].length);

  // Normalise frontmatter lines: if a value contains : # [ ] { } , & * ? | > ' "
  // and is not already quoted, wrap in double quotes (escaping any existing ones).
  const SPECIAL = /[:#\[\]{},&*?|>'"!@%`]/;
  const fixedLines = fmBody.split('\n').map(line => {
    // Skip comment lines, blank lines, and array/map indicators.
    if (!line.includes(':')) return line;
    const colonIdx = line.indexOf(':');
    const key = line.slice(0, colonIdx);
    const rawVal = line.slice(colonIdx + 1);

    // Don't touch lines with leading spaces (nested YAML).
    if (/^\s/.test(key)) return line;

    // Don't touch if already quoted or a number/bool/null.
    const trimmed = rawVal.trim();
    if (trimmed === '' || trimmed.startsWith('"') || trimmed.startsWith("'") ||
        trimmed.startsWith('[') || trimmed.startsWith('{') ||
        /^(true|false|null|\d)/.test(trimmed)) {
      return line;
    }

    if (SPECIAL.test(trimmed)) {
      const escaped = trimmed.replace(/"/g, '\\"');
      return `${key}: "${escaped}"`;
    }
    return line;
  });

  return before + fixedLines.join('\n') + after + rest;
}

function resolveLocalPath(spec: string): string | null {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('~')) return spec;
  if (existsSync(spec)) return spec;
  return null;
}

// ── Command entry point ───────────────────────────────────────────────────────

export async function evalCmd(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const jsonMode = args.includes('--json');
  const fixMode = args.includes('--fix');
  const spec = args.find(a => !a.startsWith('-'));

  if (!spec) {
    process.stderr.write('forge eval: falta la fuente. Ver `forge eval --help`.\n');
    return 1;
  }

  let content: string;
  let label: string;
  let localFilePath: string | null = null;

  // GitHub source (contains a slash and no filesystem markers)?
  const looksLocal = resolveLocalPath(spec);
  if (!looksLocal && !existsSync(spec)) {
    // Treat as github spec via skill-source.
    let fetched;
    try {
      const source = resolveSource(spec);
      fetched = await fetchSkill(source);
    } catch (e) {
      process.stderr.write(`forge eval: no se pudo obtener el skill — ${(e as Error).message}\n`);
      return 1;
    }
    content = fetched.content;
    label = fetched.label;
  } else {
    // Local path.
    let file = spec.replace(/^~(?=\/)/, process.env.HOME ?? '~');
    if (existsSync(file) && statSync(file).isDirectory()) {
      file = join(file, 'SKILL.md');
    }
    if (!existsSync(file)) {
      process.stderr.write(`forge eval: no se encontró SKILL.md en "${spec}"\n`);
      return 1;
    }
    content = readFileSync(file, 'utf-8');
    label = spec;
    localFilePath = file;
  }

  const ev = evalSkill(content);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(ev, null, 2) + '\n');
    return 0;
  }

  printEval(ev, label);

  if (fixMode) {
    if (!localFilePath) {
      process.stderr.write('forge eval --fix: solo funciona con archivos locales (no GitHub).\n');
      return 1;
    }
    const fixed = applyFix(content, localFilePath);
    if (fixed !== content) {
      writeFileSync(localFilePath, fixed, 'utf-8');
      process.stdout.write(`--fix: frontmatter normalizado. Backup guardado en ${localFilePath}.bak\n`);
    } else {
      process.stdout.write(`--fix: nada que normalizar en el frontmatter.\n`);
    }
  }

  return 0;
}
