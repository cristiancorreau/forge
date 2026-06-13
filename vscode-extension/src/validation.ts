// ---------------------------------------------------------------------------
// SPEC-070 / SPEC-072 — pure form validation helpers.
//
// Used by the "Proyecto nuevo" form to validate the project name and slug in
// real time, and exercised directly by the unit tests (no VS Code runtime).
// Kept dependency-free so it can be imported from both the extension host and
// the test files.
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  /** Human-readable error in neutral Latin-American Spanish; empty when valid. */
  error: string;
}

const OK: ValidationResult = { valid: true, error: '' };

// A slug: lowercase letters, digits and single hyphens; no leading/trailing or
// doubled hyphens. Matches the slug derivation used by `forge init`.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate a project name. Must be non-empty (after trimming) and at most 64
 * characters. Any printable characters are allowed; the slug is what gets
 * constrained.
 */
export function validateName(name: unknown): ValidationResult {
  if (typeof name !== 'string') {
    return { valid: false, error: 'El nombre es obligatorio.' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'El nombre es obligatorio.' };
  }
  if (trimmed.length > 64) {
    return { valid: false, error: 'El nombre no puede superar los 64 caracteres.' };
  }
  return OK;
}

/**
 * Validate a slug. Must match `^[a-z0-9]+(-[a-z0-9]+)*$` and be 2..48 chars.
 */
export function validateSlug(slug: unknown): ValidationResult {
  if (typeof slug !== 'string') {
    return { valid: false, error: 'El slug es obligatorio.' };
  }
  const trimmed = slug.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'El slug es obligatorio.' };
  }
  if (trimmed.length < 2 || trimmed.length > 48) {
    return { valid: false, error: 'El slug debe tener entre 2 y 48 caracteres.' };
  }
  if (!SLUG_RE.test(trimmed)) {
    return {
      valid: false,
      error: 'Solo minúsculas, números y guiones simples (sin espacios ni guiones al inicio o final).',
    };
  }
  return OK;
}

/**
 * Derive a slug from a free-form name, the same way the CLI does: lowercase,
 * non-alphanumerics → hyphens, collapse repeats, trim edge hyphens.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
