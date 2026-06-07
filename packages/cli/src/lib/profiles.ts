/**
 * Maps a detected framework / tool to its forge Tier 2 profile slug.
 * Single source of truth shared by the clack wizard, the OpenTUI wizard and init.
 * Keys are the framework values used by the wizards (backend/frontend/testing);
 * values are profile directory names under `profiles/`.
 */
export const PROFILE_MAP: Record<string, string> = {
  // backend
  hono:      'hono-drizzle',
  express:   'express',
  nestjs:    'nestjs',
  fastapi:   'fastapi',
  django:    'django',
  rails:     'rails',
  laravel:   'laravel',
  'go-gin':  'go-gin',
  // frontend
  nextjs:    'nextjs-admin',
  astro:     'astro',
  nuxt:      'vuenuxt',
  sveltekit: 'sveltekit',
  // testing / tooling
  playwright: 'playwright-crawler',
  // Note: the `expo` and `wordpress` profiles exist under profiles/ but no wizard
  // option produces them yet — activate them manually via agents.profiles.
};

/**
 * Derive the forge profiles to activate from a detected/selected stack.
 * Looks up backend, frontend and each testing framework in PROFILE_MAP and
 * returns the de-duplicated list of matching profile slugs.
 */
export function profilesForStack(stack: {
  backend?: string;
  frontend?: string;
  testing?: string[];
}): string[] {
  const profiles: string[] = [];
  for (const key of [stack.backend, stack.frontend]) {
    if (key && PROFILE_MAP[key]) profiles.push(PROFILE_MAP[key]);
  }
  for (const t of stack.testing ?? []) {
    if (PROFILE_MAP[t]) profiles.push(PROFILE_MAP[t]);
  }
  return [...new Set(profiles)];
}
