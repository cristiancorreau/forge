/**
 * Pure helpers shared by both wizards (OpenTUI `tui/wizard.ts` and the @clack
 * fallback `lib/wizard.ts`) and exercised directly by the test suite.
 *
 * The wizard now asks the PROJECT TYPE first (frontend · backend · fullstack)
 * and then the LANGUAGE + FRAMEWORK separately per side, with the framework list
 * FILTERED by the chosen language. The data model stays backward-compatible:
 * `project.language` is DERIVED from the per-side languages.
 */

export type ProjectType = 'frontend' | 'backend' | 'fullstack';

/** Backend frameworks by language. Used to filter the framework picker. */
export const BACKEND_BY_LANG: Record<string, string[]> = {
  typescript: ['hono', 'express', 'nestjs', 'fastify'],
  python:     ['fastapi', 'django'],
  ruby:       ['rails'],
  go:         ['go-gin'],
  php:        ['laravel'],
};

/** Frontend frameworks by language. Frontend is TypeScript/JS only today. */
export const FRONTEND_BY_LANG: Record<string, string[]> = {
  typescript: ['nextjs', 'astro', 'sveltekit', 'nuxt'],
};

/** Languages offered for the backend side. */
export const BACKEND_LANGUAGES = ['typescript', 'python', 'ruby', 'go', 'php'];

/** Languages offered for the frontend side. */
export const FRONTEND_LANGUAGES = ['typescript'];

/** True when the project type implies a backend side. */
export function hasBackend(type: ProjectType): boolean {
  return type === 'backend' || type === 'fullstack';
}

/** True when the project type implies a frontend side. */
export function hasFrontend(type: ProjectType): boolean {
  return type === 'frontend' || type === 'fullstack';
}

/** Backend framework values valid for a language (always includes the escape). */
export function backendFrameworksFor(language: string): string[] {
  return BACKEND_BY_LANG[language] ?? [];
}

/** Frontend framework values valid for a language. */
export function frontendFrameworksFor(language: string): string[] {
  return FRONTEND_BY_LANG[language] ?? [];
}

/**
 * Derive the legacy `project.language` from the per-side languages, per the
 * backward-compat rule:
 *   - backend / fullstack → the backend language
 *   - frontend-only       → the frontend language
 *   - fullstack with differing sides → 'mixed'
 * Falls back to 'typescript' when nothing is known.
 */
export function deriveProjectLanguage(args: {
  type: ProjectType;
  backendLanguage?: string;
  frontendLanguage?: string;
}): string {
  const { type, backendLanguage, frontendLanguage } = args;
  if (type === 'frontend') return frontendLanguage ?? 'typescript';
  if (type === 'backend')  return backendLanguage ?? 'typescript';
  // fullstack
  if (backendLanguage && frontendLanguage) {
    return backendLanguage === frontendLanguage ? backendLanguage : 'mixed';
  }
  return backendLanguage ?? frontendLanguage ?? 'typescript';
}

/**
 * Infer the project type from what was detected/declared. Best-effort, used by
 * detect.ts and to back-fill old project.yaml files that lack `project.type`.
 */
export function inferProjectType(args: {
  backend?: string | null;
  frontend?: string | null;
}): ProjectType {
  const hasB = !!args.backend;
  const hasF = !!args.frontend;
  if (hasB && hasF) return 'fullstack';
  if (hasF && !hasB) return 'frontend';
  // backend, or nothing detected → default to backend (DB/ORM stay available).
  return 'backend';
}

/** Human label for a language, used in generated docs (CLAUDE.md/AGENTS.md). */
export function languageLabel(language: string): string {
  const map: Record<string, string> = {
    typescript: 'TypeScript',
    python: 'Python',
    ruby: 'Ruby',
    go: 'Go',
    php: 'PHP',
    mixed: 'mixed',
  };
  return map[language] ?? language;
}

/**
 * Render a stack side for generated docs: "FastAPI (Python)" when the per-side
 * language is known, "FastAPI" when only the framework is known, and 'N/A' when
 * the side is absent. Old project.yaml files (no per-side language) degrade to
 * just the framework name.
 */
export function stackWithLanguage(framework?: string | null, language?: string | null): string {
  if (!framework) return 'N/A';
  return language ? `${framework} (${languageLabel(language)})` : framework;
}
