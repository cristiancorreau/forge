import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { inferProjectType, type ProjectType } from './wizard-flow.js';

export interface DetectedStack {
  language: string | null;
  /** Per-side language (best-effort). Null when the side isn't detected. */
  backendLanguage: string | null;
  frontendLanguage: string | null;
  /** Inferred project type from what was detected (best-effort). */
  projectType: ProjectType | null;
  backend: string | null;
  frontend: string | null;
  database: string | null;
  orm: string | null;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;
  testing: string[];
  hasDocker: boolean;
  isMonorepo: boolean;
}

export function detectStack(cwd: string = process.cwd()): DetectedStack {
  const result: DetectedStack = {
    language: null, backendLanguage: null, frontendLanguage: null, projectType: null,
    backend: null, frontend: null,
    database: null, orm: null, packageManager: null,
    testing: [], hasDocker: false, isMonorepo: false,
  };

  if (existsSync(join(cwd, 'pnpm-lock.yaml')))   result.packageManager = 'pnpm';
  else if (existsSync(join(cwd, 'yarn.lock')))    result.packageManager = 'yarn';
  else if (existsSync(join(cwd, 'bun.lockb')))    result.packageManager = 'bun';
  else if (existsSync(join(cwd, 'package.json'))) result.packageManager = 'npm';

  result.hasDocker  = existsSync(join(cwd, 'Dockerfile')) || existsSync(join(cwd, 'docker-compose.yml'));
  result.isMonorepo = existsSync(join(cwd, 'turbo.json')) || existsSync(join(cwd, 'nx.json')) || existsSync(join(cwd, 'pnpm-workspace.yaml'));

  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      result.language = 'typescript';

      if ('hono' in deps)              result.backend  = 'hono';
      else if ('express' in deps)      result.backend  = 'express';
      else if ('@nestjs/core' in deps) result.backend  = 'nestjs';
      else if ('fastify' in deps)      result.backend  = 'fastify';

      if ('next' in deps)              result.frontend = 'nextjs';
      else if ('astro' in deps)        result.frontend = 'astro';
      else if ('nuxt' in deps)         result.frontend = 'nuxt';
      else if ('svelte' in deps)       result.frontend = 'sveltekit';

      if ('drizzle-orm' in deps)                            result.orm = 'drizzle';
      else if ('@prisma/client' in deps || 'prisma' in deps) result.orm = 'prisma';
      else if ('typeorm' in deps)                           result.orm = 'typeorm';

      if (result.orm) result.database = 'postgresql';

      if ('vitest' in deps)              result.testing.push('vitest');
      if ('jest' in deps)               result.testing.push('jest');
      if ('@playwright/test' in deps)   result.testing.push('playwright');
      if ('cypress' in deps)            result.testing.push('cypress');
    } catch { /* ignore */ }
  }

  if (!result.language) {
    if (existsSync(join(cwd, 'requirements.txt')) || existsSync(join(cwd, 'pyproject.toml'))) {
      result.language = 'python';
      if (existsSync(join(cwd, 'manage.py'))) result.backend = 'django';
    } else if (existsSync(join(cwd, 'Gemfile'))) {
      result.language = 'ruby';
      result.backend  = 'rails';
    } else if (existsSync(join(cwd, 'go.mod'))) {
      result.language = 'go';
    } else if (existsSync(join(cwd, 'composer.json'))) {
      result.language = 'php';
      try {
        const composer = JSON.parse(readFileSync(join(cwd, 'composer.json'), 'utf-8'));
        if ('laravel/framework' in (composer.require || {})) result.backend = 'laravel';
      } catch { /* ignore */ }
    }
  }

  // Per-side language (best-effort). A frontend framework implies TypeScript/JS.
  // The backend language is the detected base language. When both sides exist on
  // a non-TS base (e.g. Python backend), only the backend gets the base language
  // and the frontend stays TypeScript.
  if (result.frontend) result.frontendLanguage = 'typescript';
  if (result.backend)  result.backendLanguage  = result.language ?? 'typescript';
  // If there's a frontend but no detected backend and the base language is TS,
  // it's a TS frontend-only project; leave backendLanguage null.

  // Infer project type from what was detected.
  if (result.backend || result.frontend) {
    result.projectType = inferProjectType({ backend: result.backend, frontend: result.frontend });
  }

  return result;
}
