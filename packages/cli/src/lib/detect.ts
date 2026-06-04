import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { inferProjectType, type ProjectType } from './wizard-flow.js';

/** Read a file as text, swallowing every error (missing/unreadable → ''). */
function safeRead(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : '';
  } catch {
    return '';
  }
}

/** Best-effort check: does the top-level dir contain a file with `ext`? */
function hasFileWithExt(cwd: string, ext: string): boolean {
  try {
    return readdirSync(cwd).some(f => f.endsWith(ext));
  } catch {
    return false;
  }
}

export interface DetectedStack {
  language: string | null;
  /** Per-side language (best-effort). Null when the side isn't detected. */
  backendLanguage: string | null;
  frontendLanguage: string | null;
  /** Mobile side language (new dimension). Null when no mobile app is detected. */
  mobileLanguage: string | null;
  /** Inferred project type from what was detected (best-effort). */
  projectType: ProjectType | null;
  backend: string | null;
  frontend: string | null;
  /** Mobile framework (new dimension): flutter | react-native | expo. */
  mobile: string | null;
  database: string | null;
  orm: string | null;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;
  testing: string[];
  hasDocker: boolean;
  isMonorepo: boolean;
}

export function detectStack(cwd: string = process.cwd()): DetectedStack {
  const result: DetectedStack = {
    language: null, backendLanguage: null, frontendLanguage: null, mobileLanguage: null,
    projectType: null,
    backend: null, frontend: null, mobile: null,
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

      // Mobile (new dimension): Expo wraps React Native — prefer the more
      // specific "expo" label when present, else react-native.
      if ('expo' in deps)              { result.mobile = 'expo'; result.mobileLanguage = 'typescript'; }
      else if ('react-native' in deps) { result.mobile = 'react-native'; result.mobileLanguage = 'typescript'; }

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
    if (existsSync(join(cwd, 'pubspec.yaml'))) {
      // Flutter (mobile, new dimension): pubspec.yaml with a flutter: section or
      // a flutter SDK dependency. Best-effort substring match — never throws.
      const pubspec = safeRead(join(cwd, 'pubspec.yaml'));
      if (/(^|\n)\s*flutter\s*:/.test(pubspec) || /sdk\s*:\s*flutter/.test(pubspec)) {
        result.language = 'dart';
        result.mobile = 'flutter';
        result.mobileLanguage = 'dart';
      } else {
        // A plain Dart package (no Flutter) — language only.
        result.language = 'dart';
      }
    } else if (existsSync(join(cwd, 'requirements.txt')) || existsSync(join(cwd, 'pyproject.toml'))) {
      result.language = 'python';
      const reqs = (
        safeRead(join(cwd, 'requirements.txt')) + '\n' + safeRead(join(cwd, 'pyproject.toml'))
      ).toLowerCase();
      // Framework markers (best-effort). manage.py is the strongest Django signal.
      if (existsSync(join(cwd, 'manage.py')) || /\bdjango\b/.test(reqs)) result.backend = 'django';
      else if (/\bfastapi\b/.test(reqs)) result.backend = 'fastapi';
      else if (/\bflask\b/.test(reqs))   result.backend = 'flask';
    } else if (existsSync(join(cwd, 'Cargo.toml'))) {
      // Rust: language always; web framework from deps (axum/actix-web/rocket).
      result.language = 'rust';
      const cargo = safeRead(join(cwd, 'Cargo.toml'));
      if (/\baxum\b/.test(cargo))            result.backend = 'axum';
      else if (/actix-web/.test(cargo))      result.backend = 'actix';
      else if (/\brocket\b/.test(cargo))     result.backend = 'rocket';
    } else if (
      existsSync(join(cwd, 'pom.xml')) ||
      existsSync(join(cwd, 'build.gradle')) ||
      existsSync(join(cwd, 'build.gradle.kts'))
    ) {
      // JVM: Spring Boot when a build file references spring-boot. Language is
      // kotlin when a Kotlin build/source is present, else java.
      const buildFiles = (
        safeRead(join(cwd, 'pom.xml')) + '\n' +
        safeRead(join(cwd, 'build.gradle')) + '\n' +
        safeRead(join(cwd, 'build.gradle.kts'))
      );
      const isKotlin =
        existsSync(join(cwd, 'build.gradle.kts')) ||
        /kotlin/i.test(buildFiles) ||
        hasFileWithExt(cwd, '.kt');
      result.language = isKotlin ? 'kotlin' : 'java';
      // Spring Boot markers across pom.xml + gradle: the Maven artifact
      // (spring-boot-starter-*), the Gradle plugin id (org.springframework.boot)
      // or any spring-boot reference.
      if (/spring-boot/i.test(buildFiles) || /springframework\.boot/i.test(buildFiles)) {
        result.backend = 'springboot';
      }
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
  // Mobile language: dart for Flutter, typescript for React Native/Expo. Set at
  // detection time above; backfill from the base language as a safety net.
  if (result.mobile && !result.mobileLanguage) {
    result.mobileLanguage = result.mobile === 'flutter' ? 'dart' : 'typescript';
  }
  // If there's a frontend but no detected backend and the base language is TS,
  // it's a TS frontend-only project; leave backendLanguage null.

  // Infer project type from what was detected. Mobile is the primary hint.
  if (result.backend || result.frontend || result.mobile) {
    result.projectType = inferProjectType({
      backend: result.backend, frontend: result.frontend, mobile: result.mobile,
    });
  }

  return result;
}
