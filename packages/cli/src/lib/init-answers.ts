/**
 * `forge init --from <answers.json>` support (SPEC-069). Pure: turns a parsed
 * answers object (a partial WizardResult, as a GUI/CI would produce) into a
 * complete WizardResult with tolerant defaults — no prompts, no I/O.
 *
 * The answers schema IS the WizardResult shape. Missing fields are filled:
 * slug from name, mode/runtime/language defaults, arrays default to [], and
 * profiles are derived from the chosen frameworks when not provided — using the
 * same PROFILE_MAP the interactive wizards use, so the artifacts match.
 */
import type { WizardResult } from './wizard.js';
import { deriveProfiles, type ProjectType } from './wizard-flow.js';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(x => typeof x === 'string') as string[] : [];
}

export function loadAnswers(raw: unknown): WizardResult {
  const a: Record<string, unknown> = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};

  const name = typeof a.name === 'string' && a.name.trim() ? a.name : 'My Project';
  const slug = typeof a.slug === 'string' && a.slug.trim() ? a.slug : toSlug(name);

  const backend = strOrUndef(a.backend);
  const frontend = strOrUndef(a.frontend);
  const mobile = strOrUndef(a.mobile);

  const profiles = strArray(a.profiles).length
    ? strArray(a.profiles)
    : deriveProfiles([backend, frontend, mobile]);

  const mode = a.mode === 'startup' || a.mode === 'enterprise' ? a.mode : 'standard';

  const language =
    strOrUndef(a.language) ??
    strOrUndef(a.backendLanguage) ??
    strOrUndef(a.frontendLanguage) ??
    strOrUndef(a.mobileLanguage) ??
    'typescript';

  return {
    name,
    slug,
    description: typeof a.description === 'string' ? a.description : '',
    language,
    type: (typeof a.type === 'string' ? a.type : 'backend') as ProjectType,
    backendLanguage: strOrUndef(a.backendLanguage),
    frontendLanguage: strOrUndef(a.frontendLanguage),
    mobileLanguage: strOrUndef(a.mobileLanguage),
    mode,
    backend,
    frontend,
    mobile,
    database: strOrUndef(a.database),
    orm: strOrUndef(a.orm),
    packageManager: strOrUndef(a.packageManager),
    testing: strArray(a.testing),
    profiles,
    skills: strArray(a.skills),
    runtime: strOrUndef(a.runtime) ?? 'claude-code',
    detected: false,
  };
}
