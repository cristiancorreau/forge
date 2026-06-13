/**
 * `forge spec-probe` — deterministic completeness gate for spec files (SPEC-064).
 *
 * Usage:
 *   forge spec-probe <path> [--json]
 *
 * Delegates all scoring to lib/spec-probe.ts (pure function, no LLM, no network,
 * no I/O beyond reading the spec file). Always exits 0: it reports, it does not
 * block.
 */
import { existsSync, readFileSync, statSync } from 'fs';

import { probeSpec, type SpecProbe } from '../lib/spec-probe.js';

const HELP = `Usage: forge spec-probe <path> [options]

Probe a spec markdown for verifiability/completeness (offline, deterministic, no LLM).

Source:
  ./path or /path   Local spec .md file

Options:
  --json       Print the full SpecProbe as stable JSON (snapshot-safe)
  -h, --help   Show this help

Checks (pass/fail, score = passing / total * 100):
  acceptance-present      "Criterios de aceptación" section present and non-empty
  acceptance-checklist    criteria are a "- [ ]" checklist, not prose
  alternatives-resolved   "Alternativas consideradas" table has "Descartada por" resolved
  status-single           status is a single value (DRAFT|REVIEW|APPROVED|IMPLEMENTED)
  context-nonempty        "Contexto" section present and non-empty
  decision-nonempty       "Decisión" section present and non-empty

Grade: A (>=90) B (>=75) C (>=60) D (>=45) F (<45)

This is a gate of spec completeness, not implementation correctness.
`;

const GRADE_ICON: Record<string, string> = {
  A: 'A  EXCELENTE',
  B: 'B  BUENO',
  C: 'C  REGULAR',
  D: 'D  DEBIL',
  F: 'F  INSUFICIENTE',
};

function printProbe(probe: SpecProbe, label: string): void {
  process.stdout.write(`\nforge spec-probe — reporte de completitud\n\n`);
  process.stdout.write(`  Fuente:  ${label}\n`);
  process.stdout.write(`  Grade:   ${GRADE_ICON[probe.grade] ?? probe.grade}  (${probe.score}/100)\n\n`);
  process.stdout.write(`  Chequeos:\n`);
  for (const c of probe.checks) {
    const mark = c.pass ? 'OK  ' : 'FAIL';
    const pad = c.id.padEnd(22);
    process.stdout.write(`    [${mark}] ${pad} ${c.note}\n`);
  }
  if (probe.notes.length > 0) {
    process.stdout.write(`\n  Notas:\n`);
    for (const n of probe.notes) {
      process.stdout.write(`    - ${n}\n`);
    }
  }
  process.stdout.write('\n');
}

// ── Command entry point ───────────────────────────────────────────────────────

export async function specProbe(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const jsonMode = args.includes('--json');
  const spec = args.find(a => !a.startsWith('-'));

  if (!spec) {
    process.stderr.write('forge spec-probe: falta la ruta de la spec. Ver `forge spec-probe --help`.\n');
    return 1;
  }

  let file = spec.replace(/^~(?=\/)/, process.env.HOME ?? '~');
  if (existsSync(file) && statSync(file).isDirectory()) {
    process.stderr.write(`forge spec-probe: "${spec}" es un directorio; indica un archivo de spec.\n`);
    return 1;
  }
  if (!existsSync(file)) {
    process.stderr.write(`forge spec-probe: no se encontró la spec "${spec}"\n`);
    return 1;
  }

  const content = readFileSync(file, 'utf-8');
  const probe = probeSpec(content);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(probe, null, 2) + '\n');
    return 0;
  }

  printProbe(probe, spec);
  return 0;
}
