/**
 * Deterministic, offline quality scorer for SKILL.md files (SPEC-053).
 * Pure function: same input → same output, no LLM, no network, no I/O.
 *
 * evalSkill(skillMd) scores 7 orthogonal categories (0–10 each), derives an
 * overall score (0–100) and a letter grade (A–F). All scoring is mechanical:
 * regex, word counts, keyword presence. No heuristics that depend on runtime
 * state or randomness.
 */
import yaml from 'js-yaml';

// ── Types ────────────────────────────────────────────────────────────────────

export type CategoryId =
  | 'structure'
  | 'description'
  | 'prompt-engineering'
  | 'context-efficiency'
  | 'safety'
  | 'testability'
  | 'resilience'
  | 'naming';

export interface CategoryResult {
  id: CategoryId;
  score: number;
  max: 10;
  notes?: string;
}

export interface SkillEval {
  /** Weighted sum of category scores, 0–100. */
  overallScore: number;
  /** Letter grade derived from overallScore. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  categories: CategoryResult[];
  notes: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function countLines(text: string): number {
  return text.split('\n').length;
}

function parseFrontmatter(md: string): Record<string, unknown> | null {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  try {
    const data = yaml.load(fm[1]);
    if (data && typeof data === 'object') return data as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

/** Extract the body (everything after the first --- block if present, else all). */
function extractBody(md: string): string {
  const afterFm = md.replace(/^---\n[\s\S]*?\n---\n?/, '');
  return afterFm;
}

/** Count code fences (``` blocks) in the text. */
function countCodeBlocks(text: string): number {
  const matches = text.match(/^```/gm);
  return matches ? Math.floor(matches.length / 2) : 0;
}

/** Max consecutive lines in any single code block. */
function maxCodeBlockLines(text: string): number {
  let max = 0;
  let inBlock = false;
  let count = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (inBlock) { max = Math.max(max, count); inBlock = false; count = 0; }
      else { inBlock = true; count = 0; }
    } else if (inBlock) {
      count++;
    }
  }
  return max;
}

// ── Category scorers (each returns 0–10) ─────────────────────────────────────

/**
 * structure: frontmatter válido, name, description, version, body con headings.
 * Max 10 — 2 pts each: frontmatter present, name field, description field,
 * version field, at least one ## heading in body.
 */
function scoreStructure(md: string): CategoryResult {
  const fm = parseFrontmatter(md);
  const body = extractBody(md);
  const notes: string[] = [];
  let score = 0;

  if (fm !== null) {
    score += 2;
  } else {
    notes.push('no frontmatter YAML found');
  }

  const hasSkillHeader = /^#\s+Skill:/m.test(md);
  if (hasSkillHeader) {
    score += 2;
  } else {
    notes.push('missing "# Skill: <id>" header');
  }

  if (fm && typeof fm.description === 'string' && fm.description.length > 0) {
    score += 2;
  } else {
    notes.push('frontmatter missing description field');
  }

  if (fm && (typeof fm.version === 'string' || typeof fm.version === 'number')) {
    score += 2;
  } else {
    notes.push('frontmatter missing version field');
  }

  if (/^##\s+/m.test(body)) {
    score += 2;
  } else {
    notes.push('body has no ## headings');
  }

  return { id: 'structure', score, max: 10, notes: notes.length ? notes.join('; ') : undefined };
}

/**
 * description: 8–40 words, starts with verb, has trigger phrase, has a
 * "don't use for" / "no uses" clause.
 * Max 10 — 2.5 pts each (rounded): word range, starts-with-verb, trigger, negative clause.
 */
function scoreDescription(md: string): CategoryResult {
  const notes: string[] = [];
  let score = 0;

  // Prefer frontmatter description; fall back to first non-empty paragraph.
  const fm = parseFrontmatter(md);
  const descField = fm && typeof fm.description === 'string' ? fm.description : null;
  const body = extractBody(md);
  // First non-empty line of body that isn't a heading.
  const firstParagraph = body.split('\n').find(l => l.trim().length > 0 && !l.startsWith('#'));
  const desc = descField ?? firstParagraph ?? '';

  const wordCount = countWords(desc);
  if (wordCount >= 8 && wordCount <= 40) {
    score += 3;
  } else {
    notes.push(`description word count ${wordCount} (want 8–40)`);
  }

  // Starts with a verb: look for common imperative verbs (English/Spanish).
  if (/^(Add|Adds|Apply|Build|Check|Clean|Configure|Create|Debug|Define|Deploy|Enable|Execute|Fetch|Fix|Generate|Handle|Implement|Install|List|Manage|Migrate|Monitor|Optimize|Parse|Process|Refactor|Remove|Rename|Run|Scaffold|Search|Set|Setup|Test|Update|Use|Validate|Write|Agrega|Aplica|Crea|Define|Ejecuta|Escribe|Genera|Implementa|Instala|Limpia|Lista|Maneja|Migra|Optimiza|Procesa|Refactoriza|Remueve|Valida)\b/i.test(desc.trim())) {
    score += 3;
  } else {
    notes.push('description does not start with an imperative verb');
  }

  // Trigger phrase: either frontmatter triggers, or "Triggers:" line in body.
  if (/^Triggers:/m.test(md) || (fm && fm.triggers)) {
    score += 2;
  } else {
    notes.push('missing Triggers: declaration');
  }

  // Negative clause: "don't use for" / "no uses" / "no usar" / "not for".
  if (/don'?t use for|not for|no uses para|no usar para|not suitable|no apto/i.test(md)) {
    score += 2;
  } else {
    notes.push('missing negative/exclusion clause ("don\'t use for" or equivalent)');
  }

  return { id: 'description', score, max: 10, notes: notes.length ? notes.join('; ') : undefined };
}

/**
 * prompt-engineering: lists/steps, code blocks + "example", imperative voice,
 * body 80–3000 words.
 * Max 10 — 2.5 pts each.
 */
function scorePromptEngineering(md: string): CategoryResult {
  const notes: string[] = [];
  let score = 0;
  const body = extractBody(md);
  const wordCount = countWords(body);

  // Lists or numbered steps.
  if (/^(\d+\.|[-*])\s+/m.test(body)) {
    score += 3;
  } else {
    notes.push('no bullet lists or numbered steps found');
  }

  // Code blocks + any mention of "example"/"ejemplo".
  const codeBlocks = countCodeBlocks(body);
  if (codeBlocks > 0 && /example|ejemplo/i.test(body)) {
    score += 3;
  } else {
    if (codeBlocks === 0) notes.push('no code blocks');
    if (!/example|ejemplo/i.test(body)) notes.push('no example/ejemplo reference');
  }

  // Imperative voice: "Run X", "Execute Y", "Add Z" in instructions.
  if (/(^|\n)(Run|Execute|Add|Create|Use|Check|Install|Write|Build|Set|Configure|Ejecuta|Usa|Agrega|Crea|Valida|Corre|Instala)\b/m.test(body)) {
    score += 2;
  } else {
    notes.push('body lacks imperative voice in instructions');
  }

  if (wordCount >= 80 && wordCount <= 3000) {
    score += 2;
  } else {
    notes.push(`body word count ${wordCount} (want 80–3000)`);
  }

  return { id: 'prompt-engineering', score, max: 10, notes: notes.length ? notes.join('; ') : undefined };
}

/**
 * context-efficiency: body 120–1500 words, references external files (2+),
 * code blocks <60 lines each, mentions tokens/budget.
 * Max 10 — 2.5 pts each.
 */
function scoreContextEfficiency(md: string): CategoryResult {
  const notes: string[] = [];
  let score = 0;
  const body = extractBody(md);
  const wordCount = countWords(body);

  if (wordCount >= 120 && wordCount <= 1500) {
    score += 3;
  } else {
    notes.push(`body word count ${wordCount} (want 120–1500 for context-efficiency)`);
  }

  // References to external files: patterns like `path/to/file.ext`, @file, <!-- see X -->
  const fileRefs = (body.match(/`[^`]*\.[a-z]{1,6}`|@[a-z][\w/.-]+\.[a-z]{1,6}|\bREADME\b|\bCHANGELOG\b/gi) || []).length;
  if (fileRefs >= 2) {
    score += 3;
  } else {
    notes.push(`only ${fileRefs} external file reference(s) found (want 2+)`);
  }

  if (maxCodeBlockLines(body) < 60) {
    score += 2;
  } else {
    notes.push('at least one code block exceeds 60 lines (hurts context efficiency)');
  }

  if (/\b(token|budget|context window|chars|character|context limit|tokens)\b/i.test(body)) {
    score += 2;
  } else {
    notes.push('no mention of tokens/budget/context window');
  }

  return { id: 'context-efficiency', score, max: 10, notes: notes.length ? notes.join('; ') : undefined };
}

/**
 * safety: 4+ security keywords, destructive actions with confirm/dry-run,
 * prerequisites section.
 * Max 10 — ~3.3 pts each.
 */
function scoreSafety(md: string): CategoryResult {
  const notes: string[] = [];
  let score = 0;
  const body = extractBody(md);
  const all = md;

  // Security/safety keywords (at least 4 distinct).
  const kwds = [
    'backup', 'confirm', 'dry-run', 'irreversible', 'destructive', 'warning', 'caution',
    'danger', 'review', 'verify', 'validate', 'check', 'careful', 'cuidado', 'advertencia',
    'peligro', 'verificar', 'revisar', 'respaldar', 'reversible', 'prerequisit',
  ];
  const foundKwds = kwds.filter(k => new RegExp(`\\b${k}`, 'i').test(all));
  if (foundKwds.length >= 4) {
    score += 4;
  } else {
    notes.push(`only ${foundKwds.length} safety keyword(s) found (want 4+)`);
  }

  // Destructive actions require confirm or dry-run.
  const hasDestructive = /\b(delete|remove|drop|truncate|rm\s+-[rf]|elimina|borra|destruye)\b/i.test(all);
  const hasConfirmOrDryRun = /\b(confirm|dry.?run|--yes|--dry|--confirm|verificar|confirmaci[oó]n)\b/i.test(all);
  if (!hasDestructive || hasConfirmOrDryRun) {
    score += 3;
  } else {
    notes.push('destructive action found without confirm/dry-run safeguard');
  }

  // Prerequisites section.
  if (/\bprerequisit|requirements?\s*:|antes de|before you|required\b/i.test(all)) {
    score += 3;
  } else {
    notes.push('no prerequisites section found');
  }

  return { id: 'safety', score, max: 10, notes: notes.length ? notes.join('; ') : undefined };
}

/**
 * testability: verifiable outputs, acceptance criteria, error scenarios.
 * Max 10 — ~3.3 pts each.
 */
function scoreTestability(md: string): CategoryResult {
  const notes: string[] = [];
  let score = 0;

  // Verifiable outputs: "returns", "outputs", "produces", "devuelve", "resultado".
  if (/\b(returns?|outputs?|produces?|devuelve|resultado esperado|expected output|result|resultado)\b/i.test(md)) {
    score += 3;
  } else {
    notes.push('no verifiable output description found');
  }

  // Acceptance criteria: checklist items, "should", "must", "criteria", "criterio".
  if (/\b(acceptance criteria|criterios? de aceptaci[oó]n|should|must|deberia|debe)\b/i.test(md) ||
      /^- \[[ x]\]/m.test(md)) {
    score += 4;
  } else {
    notes.push('no acceptance criteria or checklist found');
  }

  // Error scenarios: "error", "fail", "invalid", "fallback", "falla", "error handling".
  if (/\b(error|fail|invalid|fallback|falla|manejo de errores|error handling|exception|excepci[oó]n)\b/i.test(md)) {
    score += 3;
  } else {
    notes.push('no error scenario coverage found');
  }

  return { id: 'testability', score, max: 10, notes: notes.length ? notes.join('; ') : undefined };
}

/**
 * Returns the body of the first H2/H3 section whose title matches `titleRe`,
 * sliced from just after the heading to the next H2/H3 heading or end-of-string.
 * Returns null when no matching heading exists. (JS regex has no \Z, so this
 * walks headings explicitly instead of relying on an end-anchored lookahead.)
 */
function sectionBody(md: string, titleRe: RegExp): string | null {
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^#{2,3}\s+(.+?)\s*$/);
    if (!h || !titleRe.test(h[1])) continue;
    const rest: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^#{2,3}\s+/.test(lines[j])) break;
      rest.push(lines[j]);
    }
    return rest.join('\n');
  }
  return null;
}

/**
 * resilience: anti-rationalization + verification gates (SPEC-060). Rewards
 * skills that pre-empt the excuses an agent uses to skip steps and that demand
 * evidence instead of "seems right".
 * Max 10 — racionalizaciones (4) + señales de alerta (3) + gate con evidencia (3).
 *
 * Patrón inspirado en addyosmani/agent-skills (MIT); reimplementado en español.
 */
function scoreResilience(md: string): CategoryResult {
  const notes: string[] = [];
  let score = 0;

  // 1. Tabla de racionalizaciones: heading ("Excusas comunes" / "Racionaliz" /
  //    "Rationaliz") seguido de una tabla markdown (fila con dos columnas |…|…|).
  const hasRatHeading = /^#{2,3}\s+(excusas?\b|racionaliz|rationaliz|anti-?racionaliz)/im.test(md);
  const hasTable = /^\s*\|.+\|.+\|\s*$/m.test(md);
  if (hasRatHeading && hasTable) {
    score += 4;
  } else {
    notes.push('no anti-rationalization table ("## Excusas comunes" con tabla Excusa|Realidad)');
  }

  // 2. Señales de alerta / red flags: heading + al menos una viñeta debajo.
  const redFlagBody = sectionBody(md, /se[nñ]ales de alerta|red ?flags?|banderas rojas/i);
  if (redFlagBody !== null && /^\s*[-*]\s+\S/m.test(redFlagBody)) {
    score += 3;
  } else {
    notes.push('no red-flags section ("## Señales de alerta" con viñetas)');
  }

  // 3. Gate de verificación con evidencia: heading "Verificación"/"Verification"
  //    con checklist `- [ ]` Y una referencia a evidencia concreta (salida de
  //    test/build/log/comando), no sólo "parece bien".
  const verifBody = sectionBody(md, /verificaci[oó]n|verification/i);
  const hasChecklist = verifBody !== null ? /^\s*[-*]\s+\[[ x]\]/m.test(verifBody) : false;
  const hasEvidence = /\b(salida del? (test|comando|build)|test output|build log|pega(r|á)? la salida|evidencia|paste the output|logs?\b|coverage)\b/i.test(md);
  if (hasChecklist && hasEvidence) {
    score += 3;
  } else {
    notes.push('no verification gate with evidence ("## Verificación" con checklist + evidencia de salida/log)');
  }

  return { id: 'resilience', score, max: 10, notes: notes.length ? notes.join('; ') : undefined };
}

/**
 * naming: clear name without abbreviations, name matches purpose from description.
 * Max 10 — 5 pts each.
 */
function scoreNaming(md: string): CategoryResult {
  const notes: string[] = [];
  let score = 0;

  // Extract skill id from "# Skill: <id>" header.
  const header = md.match(/^#\s+Skill:\s+([a-z0-9][a-z0-9-]*)\s*$/m);
  const name = header ? header[1] : null;

  if (!name) {
    notes.push('cannot assess naming: no "# Skill: <id>" header found');
    return { id: 'naming', score: 0, max: 10, notes: notes.join('; ') };
  }

  // Clear name: hyphen-separated words (kebab-case), no single-char segments,
  // no opaque abbreviations (segments of 1–2 uppercase-only chars).
  const segments = name.split('-');
  const hasAbbreviations = segments.some(s => s.length <= 2 && /^[a-z]{1,2}$/.test(s) && s !== 'ui' && s !== 'ai' && s !== 'db' && s !== 'ci' && s !== 'cd');
  if (!hasAbbreviations && segments.length >= 2) {
    score += 5;
  } else if (segments.length === 1 && name.length > 3) {
    score += 3;
    notes.push('single-word name: consider kebab-case for clarity');
  } else {
    notes.push(`name "${name}" may contain abbreviations or is unclear`);
  }

  // Name roughly matches purpose: at least one word from name appears in description.
  const fm = parseFrontmatter(md);
  const desc = (fm && typeof fm.description === 'string' ? fm.description : '') +
               ' ' + (md.match(/^#\s+Skill:[^\n]*/m)?.[0] ?? '');
  const descLower = desc.toLowerCase();
  const nameMatchesDesc = segments.some(seg => seg.length >= 3 && descLower.includes(seg));
  if (nameMatchesDesc) {
    score += 5;
  } else {
    notes.push('skill name segments not found in description — name may not match purpose');
  }

  return { id: 'naming', score, max: 10, notes: notes.length ? notes.join('; ') : undefined };
}

// ── Grade derivation ─────────────────────────────────────────────────────────

function deriveGrade(overall: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (overall >= 90) return 'A';
  if (overall >= 75) return 'B';
  if (overall >= 60) return 'C';
  if (overall >= 45) return 'D';
  return 'F';
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Scores a SKILL.md (raw text) across 7 quality categories.
 * Pure and deterministic — no I/O, no LLM, no randomness.
 *
 * The overall score is the arithmetic mean of all category scores scaled to 100:
 *   overall = (sum(category.score) / (categories.length * 10)) * 100
 */
export function evalSkill(skillMd: string): SkillEval {
  const categories: CategoryResult[] = [
    scoreStructure(skillMd),
    scoreDescription(skillMd),
    scorePromptEngineering(skillMd),
    scoreContextEfficiency(skillMd),
    scoreSafety(skillMd),
    scoreTestability(skillMd),
    scoreResilience(skillMd),
    scoreNaming(skillMd),
  ];

  const sum = categories.reduce((acc, c) => acc + c.score, 0);
  const overallScore = Math.round((sum / (categories.length * 10)) * 100);
  const grade = deriveGrade(overallScore);

  const notes: string[] = categories
    .filter(c => c.notes)
    .map(c => `[${c.id}] ${c.notes}`);

  return { overallScore, grade, categories, notes };
}

// ── Quality floor check (used by SPEC-054 two-gate) ──────────────────────────

export const QUALITY_THRESHOLD = 75;
export const QUALITY_FLOOR = 6;

export interface QualityGateResult {
  pass: boolean;
  overall: number;
  grade: string;
  weakestCategory: CategoryResult | null;
  reason: string | null;
}

/**
 * Checks whether a SkillEval meets the two-gate quality floor:
 *   overall >= QUALITY_THRESHOLD AND min(category.score) >= QUALITY_FLOOR
 */
export function checkQualityGate(
  ev: SkillEval,
  opts: { threshold?: number; floor?: number } = {},
): QualityGateResult {
  const threshold = opts.threshold ?? QUALITY_THRESHOLD;
  const floor = opts.floor ?? QUALITY_FLOOR;

  const weakest = ev.categories.reduce((a, b) => (a.score < b.score ? a : b), ev.categories[0]);
  const overallFails = ev.overallScore < threshold;
  const floorFails = weakest.score < floor;

  if (!overallFails && !floorFails) {
    return { pass: true, overall: ev.overallScore, grade: ev.grade, weakestCategory: null, reason: null };
  }

  const reasons: string[] = [];
  if (overallFails) reasons.push(`overall ${ev.overallScore} < ${threshold}`);
  if (floorFails) reasons.push(`category "${weakest.id}" scored ${weakest.score}/10 < floor ${floor}`);

  return {
    pass: false,
    overall: ev.overallScore,
    grade: ev.grade,
    weakestCategory: weakest,
    reason: reasons.join('; '),
  };
}
