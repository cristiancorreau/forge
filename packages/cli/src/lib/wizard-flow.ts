/**
 * Pure helpers shared by both wizards (OpenTUI `tui/wizard.ts` and the @clack
 * fallback `lib/wizard.ts`) and exercised directly by the test suite.
 *
 * The wizard now asks the PROJECT TYPE first (frontend · backend · fullstack)
 * and then the LANGUAGE + FRAMEWORK separately per side, with the framework list
 * FILTERED by the chosen language. The data model stays backward-compatible:
 * `project.language` is DERIVED from the per-side languages.
 */

export type ProjectType = 'frontend' | 'backend' | 'fullstack' | 'mobile';

/** Backend frameworks by language. Used to filter the framework picker. */
export const BACKEND_BY_LANG: Record<string, string[]> = {
  typescript: ['hono', 'express', 'nestjs', 'fastify'],
  python:     ['fastapi', 'flask', 'django'],
  java:       ['springboot'],
  kotlin:     ['springboot'],
  rust:       ['axum', 'actix', 'rocket'],
  ruby:       ['rails'],
  go:         ['go-gin'],
  php:        ['laravel'],
};

/** Frontend frameworks by language. Frontend is TypeScript/JS only today. */
export const FRONTEND_BY_LANG: Record<string, string[]> = {
  typescript: ['nextjs', 'astro', 'sveltekit', 'nuxt'],
};

/** Mobile frameworks by language (new dimension). */
export const MOBILE_BY_LANG: Record<string, string[]> = {
  dart:       ['flutter'],
  typescript: ['react-native', 'expo'],
};

/**
 * Framework value → Tier 2 profile id. Single source shared by both wizards and
 * by `forge init --from` (SPEC-069) so the GUI/CI path derives the same profiles.
 */
export const PROFILE_MAP: Record<string, string> = {
  hono:       'hono-drizzle',
  nextjs:     'nextjs-admin',
  astro:      'astro',
  fastapi:    'fastapi',
  rails:      'rails',
  laravel:    'laravel',
  expo:       'expo',
  springboot: 'springboot',
  flutter:    'flutter',
  flask:      'flask',
  axum:       'rust',
  actix:      'rust',
  rocket:     'rust',
};

/** Derive the unique Tier 2 profiles for the chosen frameworks. */
export function deriveProfiles(frameworks: Array<string | undefined | null>): string[] {
  const profiles: string[] = [];
  for (const f of frameworks) {
    if (f && PROFILE_MAP[f]) profiles.push(PROFILE_MAP[f]);
  }
  return [...new Set(profiles)];
}

/** Languages offered for the backend side. */
export const BACKEND_LANGUAGES = ['typescript', 'python', 'java', 'kotlin', 'rust', 'ruby', 'go', 'php'];

/** Languages offered for the frontend side. */
export const FRONTEND_LANGUAGES = ['typescript'];

/** Languages offered for the mobile side. */
export const MOBILE_LANGUAGES = ['dart', 'typescript'];

/** True when the project type implies a backend side. */
export function hasBackend(type: ProjectType): boolean {
  return type === 'backend' || type === 'fullstack';
}

/** True when the project type implies a frontend side. */
export function hasFrontend(type: ProjectType): boolean {
  return type === 'frontend' || type === 'fullstack';
}

/** True when the project type implies a mobile side (new dimension). */
export function hasMobile(type: ProjectType): boolean {
  return type === 'mobile';
}

/** Backend framework values valid for a language (always includes the escape). */
export function backendFrameworksFor(language: string): string[] {
  return BACKEND_BY_LANG[language] ?? [];
}

/** Frontend framework values valid for a language. */
export function frontendFrameworksFor(language: string): string[] {
  return FRONTEND_BY_LANG[language] ?? [];
}

/** Mobile framework values valid for a language (new dimension). */
export function mobileFrameworksFor(language: string): string[] {
  return MOBILE_BY_LANG[language] ?? [];
}

/**
 * Derive the legacy `project.language` from the per-side languages, per the
 * backward-compat rule:
 *   - mobile-only         → the mobile language
 *   - frontend-only       → the frontend language
 *   - backend / fullstack → the backend language
 *   - sides with differing languages → 'mixed'
 * Falls back to 'typescript' when nothing is known.
 */
export function deriveProjectLanguage(args: {
  type: ProjectType;
  backendLanguage?: string;
  frontendLanguage?: string;
  mobileLanguage?: string;
}): string {
  const { type, backendLanguage, frontendLanguage, mobileLanguage } = args;
  if (type === 'mobile')   return mobileLanguage ?? 'typescript';
  if (type === 'frontend') return frontendLanguage ?? 'typescript';
  if (type === 'backend')  return backendLanguage ?? 'typescript';
  // fullstack (and any multi-side combination): mixed when languages differ.
  const langs = [backendLanguage, frontendLanguage, mobileLanguage].filter(Boolean) as string[];
  if (langs.length === 0) return 'typescript';
  const allSame = langs.every(l => l === langs[0]);
  return allSame ? langs[0] : 'mixed';
}

/**
 * Infer the project type from what was detected/declared. Best-effort, used by
 * detect.ts and to back-fill old project.yaml files that lack `project.type`.
 * `type` is the primary hint: a mobile app present makes it a mobile project.
 */
export function inferProjectType(args: {
  backend?: string | null;
  frontend?: string | null;
  mobile?: string | null;
}): ProjectType {
  const hasB = !!args.backend;
  const hasF = !!args.frontend;
  const hasM = !!args.mobile;
  // Mobile is the primary hint when no server/web side dominates: a repo with a
  // mobile app and nothing else (or just a backend) is a mobile project.
  if (hasM && !hasF) return 'mobile';
  if (hasB && hasF) return 'fullstack';
  if (hasF && !hasB) return 'frontend';
  // backend, or nothing detected → default to backend (DB/ORM stay available).
  return 'backend';
}

/** Human label for a language, used in generated docs (CLAUDE.md/AGENTS.md). */
export function languageLabel(language: string): string {
  const map: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    python: 'Python',
    java: 'Java',
    kotlin: 'Kotlin',
    rust: 'Rust',
    dart: 'Dart',
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
