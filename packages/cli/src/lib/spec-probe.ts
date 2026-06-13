/**
 * Deterministic, offline completeness gate for spec files (SPEC-064).
 * Pure function: same input → same output, no LLM, no network, no I/O.
 *
 * probeSpec(specMd) runs a fixed set of structural checks that answer one
 * question: is this spec *verifiable*? It rewards real acceptance criteria
 * (checklists, not prose), a resolved "Alternativas consideradas" table, a
 * single resolved status, and non-empty Contexto/Decisión sections. All checks
 * are mechanical (regex, section slicing). No heuristics that depend on runtime
 * state or randomness.
 *
 * This is a gate of *spec completeness*, not of implementation correctness.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CheckId =
  | 'acceptance-present'
  | 'acceptance-checklist'
  | 'alternatives-resolved'
  | 'status-single'
  | 'context-nonempty'
  | 'decision-nonempty';

export interface SpecCheck {
  id: CheckId;
  pass: boolean;
  note: string;
}

export interface SpecProbe {
  /** 0–100, the share of passing checks scaled to 100. */
  score: number;
  /** Letter grade derived from score. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: SpecCheck[];
  notes: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the body of the first H1/H2/H3 section whose title matches `titleRe`,
 * sliced from just after the heading to the next heading of equal-or-higher
 * level or end-of-string. Returns null when no matching heading exists.
 * (JS regex has no \Z, so this walks headings explicitly.)
 */
function sectionBody(md: string, titleRe: RegExp): string | null {
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,3})\s+(.+?)\s*$/);
    if (!h || !titleRe.test(h[2])) continue;
    const level = h[1].length;
    const rest: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].match(/^(#{1,3})\s+/);
      if (next && next[1].length <= level) break;
      rest.push(lines[j]);
    }
    return rest.join('\n');
  }
  return null;
}

/** Non-empty after stripping markdown table separators, blank lines and bullets-only noise. */
function hasMeaningfulText(body: string): boolean {
  const stripped = body
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => !/^[-=|:\s]+$/.test(l)) // table separators / horizontal rules
    .join('');
  return stripped.length > 0;
}

// ── Checks ───────────────────────────────────────────────────────────────────

/** "Criterios de aceptación" section exists and is non-empty. */
function checkAcceptancePresent(md: string): SpecCheck {
  const body = sectionBody(md, /criterios?\s+de\s+aceptaci[oó]n|acceptance\s+criteria/i);
  if (body === null) {
    return { id: 'acceptance-present', pass: false, note: 'falta la sección "Criterios de aceptación"' };
  }
  if (!hasMeaningfulText(body)) {
    return { id: 'acceptance-present', pass: false, note: 'la sección "Criterios de aceptación" está vacía' };
  }
  return { id: 'acceptance-present', pass: true, note: 'sección "Criterios de aceptación" presente y con contenido' };
}

/**
 * The acceptance criteria are a verifiable checklist (`- [ ]` / `- [x]`), not
 * free prose. Requires at least two checklist items and that checklist lines
 * dominate the non-blank content of the section.
 */
function checkAcceptanceChecklist(md: string): SpecCheck {
  const body = sectionBody(md, /criterios?\s+de\s+aceptaci[oó]n|acceptance\s+criteria/i);
  if (body === null || !hasMeaningfulText(body)) {
    return { id: 'acceptance-checklist', pass: false, note: 'sin criterios para evaluar (sección ausente o vacía)' };
  }
  const contentLines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const checklistLines = contentLines.filter(l => /^[-*]\s+\[[ xX]\]\s+\S/.test(l));
  if (checklistLines.length < 2) {
    return {
      id: 'acceptance-checklist',
      pass: false,
      note: `los criterios son prosa, no checklist (${checklistLines.length} item(s) "- [ ]"; se esperan 2+)`,
    };
  }
  // Checklist must be the dominant form: at least half of the content lines.
  if (checklistLines.length < contentLines.length / 2) {
    return {
      id: 'acceptance-checklist',
      pass: false,
      note: 'predomina la prosa sobre el checklist en los criterios',
    };
  }
  return { id: 'acceptance-checklist', pass: true, note: `${checklistLines.length} criterios verificables en formato "- [ ]"` };
}

/**
 * "Alternativas consideradas" table has its "Descartada por" column resolved:
 * the column exists and every option row fills it (no empty cells, no "—"/TBD).
 */
function checkAlternativesResolved(md: string): SpecCheck {
  const body = sectionBody(md, /alternativas\s+consideradas|alternatives\s+considered/i);
  if (body === null) {
    return { id: 'alternatives-resolved', pass: false, note: 'falta la sección "Alternativas consideradas"' };
  }
  const rows = body.split('\n').filter(l => /^\s*\|.*\|\s*$/.test(l));
  if (rows.length < 2) {
    return { id: 'alternatives-resolved', pass: false, note: 'no hay una tabla de alternativas' };
  }
  const header = rows[0];
  const cols = header.split('|').map(c => c.trim().toLowerCase());
  const discardIdx = cols.findIndex(c => /descartada\s+por|rejected\s+(by|because)/.test(c));
  if (discardIdx < 0) {
    return { id: 'alternatives-resolved', pass: false, note: 'la tabla no tiene columna "Descartada por"' };
  }
  // Data rows = rows after header, skipping the |---|---| separator.
  const dataRows = rows.slice(1).filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
  if (dataRows.length === 0) {
    return { id: 'alternatives-resolved', pass: false, note: 'la tabla de alternativas no tiene filas de datos' };
  }
  const unresolved = dataRows.filter(r => {
    const cells = r.split('|').map(c => c.trim());
    const cell = cells[discardIdx] ?? '';
    return cell.length === 0 || /^(—|-|n\/a|na|tbd|por\s+definir|pendiente)$/i.test(cell);
  });
  if (unresolved.length > 0) {
    return {
      id: 'alternatives-resolved',
      pass: false,
      note: `${unresolved.length} alternativa(s) sin "Descartada por" resuelto`,
    };
  }
  return { id: 'alternatives-resolved', pass: true, note: `${dataRows.length} alternativa(s) con "Descartada por" resuelto` };
}

/**
 * The status is a single resolved value (DRAFT|REVIEW|APPROVED|IMPLEMENTED),
 * not the raw template menu that still carries the `|` separators.
 */
function checkStatusSingle(md: string): SpecCheck {
  // Match a "Estado:" / "Status:" line anywhere (often in a > blockquote).
  const line = md.split('\n').find(l => /(^|\s|>)\s*\*{0,2}(estado|status)\*{0,2}\s*:/i.test(l));
  if (!line) {
    return { id: 'status-single', pass: false, note: 'no se encontró una línea "Estado:"' };
  }
  const value = line.slice(line.indexOf(':') + 1).replace(/[*`]/g, '').trim();
  if (value.includes('|')) {
    return { id: 'status-single', pass: false, note: `el estado sigue siendo el menú de la plantilla ("${value}")` };
  }
  const VALID = /^(DRAFT|REVIEW|APPROVED|IMPLEMENTED)$/i;
  const first = value.split(/\s+/)[0] ?? '';
  if (!VALID.test(first)) {
    return { id: 'status-single', pass: false, note: `estado "${value}" no es uno de DRAFT|REVIEW|APPROVED|IMPLEMENTED` };
  }
  return { id: 'status-single', pass: true, note: `estado resuelto: ${first.toUpperCase()}` };
}

/** "Contexto" section exists and is non-empty. */
function checkContextNonempty(md: string): SpecCheck {
  const body = sectionBody(md, /^contexto$|^context$/i);
  if (body === null) {
    return { id: 'context-nonempty', pass: false, note: 'falta la sección "Contexto"' };
  }
  if (!hasMeaningfulText(body)) {
    return { id: 'context-nonempty', pass: false, note: 'la sección "Contexto" está vacía' };
  }
  return { id: 'context-nonempty', pass: true, note: 'sección "Contexto" presente y con contenido' };
}

/** "Decisión" section exists and is non-empty. */
function checkDecisionNonempty(md: string): SpecCheck {
  const body = sectionBody(md, /^decisi[oó]n$|^decision$/i);
  if (body === null) {
    return { id: 'decision-nonempty', pass: false, note: 'falta la sección "Decisión"' };
  }
  if (!hasMeaningfulText(body)) {
    return { id: 'decision-nonempty', pass: false, note: 'la sección "Decisión" está vacía' };
  }
  return { id: 'decision-nonempty', pass: true, note: 'sección "Decisión" presente y con contenido' };
}

// ── Grade derivation ─────────────────────────────────────────────────────────

function deriveGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Probes a spec markdown (raw text) for verifiability/completeness.
 * Pure and deterministic — no I/O, no LLM, no randomness.
 *
 * The score is the share of passing checks scaled to 100:
 *   score = round(passing / total * 100)
 */
export function probeSpec(specMd: string): SpecProbe {
  const checks: SpecCheck[] = [
    checkAcceptancePresent(specMd),
    checkAcceptanceChecklist(specMd),
    checkAlternativesResolved(specMd),
    checkStatusSingle(specMd),
    checkContextNonempty(specMd),
    checkDecisionNonempty(specMd),
  ];

  const passing = checks.filter(c => c.pass).length;
  const score = Math.round((passing / checks.length) * 100);
  const grade = deriveGrade(score);

  const notes: string[] = checks
    .filter(c => !c.pass)
    .map(c => `[${c.id}] ${c.note}`);

  return { score, grade, checks, notes };
}
