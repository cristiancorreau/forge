// SPEC-039 — more technologies: detection, wizard maps, schema, adopt e2e.
//
// Covers:
//   1. detectStack via TEMP fixtures for each new tech (FastAPI, Flask, Spring
//      Boot pom + gradle, Rust+Axum, Flutter, React Native/Expo) — asserts the
//      detected language / framework / type / mobile fields.
//   2. wizard-flow maps: backend frameworks per new language, mobile frameworks
//      per language, mobile project-type helpers, deriveProjectLanguage(mobile),
//      inferProjectType(mobile), stackWithLanguage for new stacks.
//   3. Schema: a Spring Boot project.yaml and a Flutter project.yaml validate; an
//      OLD single-language file still validates.
//   4. `forge adopt --yes` on a Rust+Axum fixture and a Flutter fixture → a valid
//      project.yaml with the right language/framework/type and a wiki entity page
//      for the framework, with a clean `forge wiki lint`.
//
//     node --test test/more-technologies.test.mjs
//
// The CLI must be built first (npm run build:all).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  backendFrameworksFor, frontendFrameworksFor, mobileFrameworksFor,
  hasBackend, hasFrontend, hasMobile,
  deriveProjectLanguage, inferProjectType, stackWithLanguage,
} from '../dist/lib/wizard-flow.js';
import { detectStack } from '../dist/lib/detect.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return (s ?? '').replace(/\x1b\[[0-9;]*m/g, '');
}

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-mt-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runForge(args, opts = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? process.cwd(), encoding: 'utf-8',
    env: { ...process.env, FORGE_HOME: '' },
  });
  const all = stripAnsi(res.stdout) + stripAnsi(res.stderr);
  return { status: res.status ?? 1, all };
}

/** Write a project.yaml + run `forge validate` in a temp dir. */
function validateYaml(t, yamlContent) {
  const dir = makeTmpDir(t);
  writeFileSync(join(dir, 'project.yaml'), yamlContent, 'utf-8');
  const res = runForge(['validate'], { cwd: dir });
  return res;
}

// ─── A. Detection (TEMP fixtures) ────────────────────────────────────────────

describe('detectStack — new backends (SPEC-039)', () => {
  test('FastAPI via requirements.txt → python / fastapi / backend', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'requirements.txt'), 'fastapi==0.110.0\nuvicorn[standard]\n', 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.language, 'python');
    assert.equal(s.backend, 'fastapi');
    assert.equal(s.backendLanguage, 'python');
    assert.equal(s.projectType, 'backend');
  });

  test('FastAPI via pyproject.toml → fastapi', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'pyproject.toml'),
      '[project]\nname = "svc"\ndependencies = ["fastapi", "uvicorn"]\n', 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.language, 'python');
    assert.equal(s.backend, 'fastapi');
  });

  test('Flask via requirements.txt → python / flask / backend', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'requirements.txt'), 'Flask==3.0.0\n', 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.language, 'python');
    assert.equal(s.backend, 'flask');
    assert.equal(s.projectType, 'backend');
  });

  test('Django manage.py still wins over fastapi/flask', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'requirements.txt'), 'django\n', 'utf-8');
    writeFileSync(join(dir, 'manage.py'), '#!/usr/bin/env python\n', 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.backend, 'django');
  });

  test('Spring Boot via pom.xml → java / springboot / backend', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'pom.xml'),
      '<project>\n<parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId></parent>\n<artifactId>demo</artifactId>\n</project>\n', 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.language, 'java');
    assert.equal(s.backend, 'springboot');
    assert.equal(s.backendLanguage, 'java');
    assert.equal(s.projectType, 'backend');
  });

  test('Spring Boot via build.gradle.kts → kotlin / springboot', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'build.gradle.kts'),
      'plugins {\n  id("org.springframework.boot") version "3.2.0"\n  kotlin("jvm") version "1.9.0"\n}\n', 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.language, 'kotlin');
    assert.equal(s.backend, 'springboot');
    assert.equal(s.backendLanguage, 'kotlin');
  });

  test('Rust + Axum via Cargo.toml → rust / axum / backend', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'Cargo.toml'),
      '[package]\nname = "api"\nversion = "0.1.0"\n[dependencies]\naxum = "0.7"\ntokio = { version = "1", features = ["full"] }\n', 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.language, 'rust');
    assert.equal(s.backend, 'axum');
    assert.equal(s.backendLanguage, 'rust');
    assert.equal(s.projectType, 'backend');
  });

  test('Rust + Actix and Rust + Rocket frameworks', (t) => {
    const a = makeTmpDir(t);
    writeFileSync(join(a, 'Cargo.toml'), '[dependencies]\nactix-web = "4"\n', 'utf-8');
    assert.equal(detectStack(a).backend, 'actix');

    const r = makeTmpDir(t);
    writeFileSync(join(r, 'Cargo.toml'), '[dependencies]\nrocket = "0.5"\n', 'utf-8');
    assert.equal(detectStack(r).backend, 'rocket');
  });

  test('Rust without a web framework → language only, no backend', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "cli"\n[dependencies]\nclap = "4"\n', 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.language, 'rust');
    assert.equal(s.backend, null);
  });
});

describe('detectStack — mobile dimension (SPEC-039)', () => {
  test('Flutter via pubspec.yaml → dart / flutter / mobile', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'pubspec.yaml'),
      'name: my_app\ndescription: A Flutter app\nenvironment:\n  sdk: ">=3.0.0 <4.0.0"\ndependencies:\n  flutter:\n    sdk: flutter\n', 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.language, 'dart');
    assert.equal(s.mobile, 'flutter');
    assert.equal(s.mobileLanguage, 'dart');
    assert.equal(s.projectType, 'mobile');
  });

  test('React Native via package.json → typescript / react-native / mobile', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'rn-app',
      dependencies: { 'react-native': '0.73.0', react: '18.2.0' },
    }), 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.language, 'typescript');
    assert.equal(s.mobile, 'react-native');
    assert.equal(s.mobileLanguage, 'typescript');
    assert.equal(s.projectType, 'mobile');
  });

  test('Expo via package.json → expo framework / mobile', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'expo-app',
      dependencies: { expo: '~50.0.0', 'react-native': '0.73.0' },
    }), 'utf-8');
    const s = detectStack(dir);
    assert.equal(s.mobile, 'expo');
    assert.equal(s.projectType, 'mobile');
  });
});

// ─── B. Wizard maps (SPEC-039) ───────────────────────────────────────────────

describe('wizard-flow maps — new languages + mobile (SPEC-039)', () => {
  test('backend frameworks per new language', () => {
    assert.deepEqual(backendFrameworksFor('python'), ['fastapi', 'flask', 'django']);
    assert.deepEqual(backendFrameworksFor('java'), ['springboot']);
    assert.deepEqual(backendFrameworksFor('kotlin'), ['springboot']);
    assert.deepEqual(backendFrameworksFor('rust'), ['axum', 'actix', 'rocket']);
    // existing ones unchanged
    assert.deepEqual(backendFrameworksFor('typescript'), ['hono', 'express', 'nestjs', 'fastify']);
  });

  test('mobile frameworks per language', () => {
    assert.deepEqual(mobileFrameworksFor('dart'), ['flutter']);
    assert.deepEqual(mobileFrameworksFor('typescript'), ['react-native', 'expo']);
    assert.deepEqual(mobileFrameworksFor('python'), []);
    // frontend stays TS-only
    assert.deepEqual(frontendFrameworksFor('typescript'), ['nextjs', 'astro', 'sveltekit', 'nuxt']);
  });

  test('hasMobile gates the mobile side; backend/frontend unaffected', () => {
    assert.equal(hasMobile('mobile'), true);
    assert.equal(hasMobile('backend'), false);
    assert.equal(hasBackend('mobile'), false);
    assert.equal(hasFrontend('mobile'), false);
  });

  test('deriveProjectLanguage handles mobile + multi-side mixed', () => {
    assert.equal(deriveProjectLanguage({ type: 'mobile', mobileLanguage: 'dart' }), 'dart');
    assert.equal(deriveProjectLanguage({ type: 'backend', backendLanguage: 'rust' }), 'rust');
    assert.equal(deriveProjectLanguage({ type: 'backend', backendLanguage: 'java' }), 'java');
    // fullstack with differing sides → mixed
    assert.equal(deriveProjectLanguage({ type: 'fullstack', backendLanguage: 'java', frontendLanguage: 'typescript' }), 'mixed');
    // fullstack same → that lang
    assert.equal(deriveProjectLanguage({ type: 'fullstack', backendLanguage: 'typescript', frontendLanguage: 'typescript' }), 'typescript');
  });

  test('inferProjectType: mobile app is the primary hint', () => {
    assert.equal(inferProjectType({ mobile: 'flutter' }), 'mobile');
    assert.equal(inferProjectType({ mobile: 'react-native', backend: 'fastapi' }), 'mobile');
    // a frontend present still wins over mobile (a web app with RN packages, e.g. expo-web)
    assert.equal(inferProjectType({ mobile: 'expo', frontend: 'nextjs' }), 'frontend');
  });

  test('stackWithLanguage renders the new stacks', () => {
    assert.equal(stackWithLanguage('springboot', 'java'), 'springboot (Java)');
    assert.equal(stackWithLanguage('flutter', 'dart'), 'flutter (Dart)');
    assert.equal(stackWithLanguage('axum', 'rust'), 'axum (Rust)');
    assert.equal(stackWithLanguage('react-native', 'typescript'), 'react-native (TypeScript)');
  });
});

// ─── C. Schema (SPEC-039) ────────────────────────────────────────────────────

describe('schema — new stacks validate, old files still pass (SPEC-039)', () => {
  test('Spring Boot project.yaml validates', (t) => {
    const yaml = `project:
  name: "Demo Service"
  slug: "demo-service"
  language: java
  type: backend
  mode: standard
  status: active
stack:
  backend: springboot
  backend_language: java
  database: postgresql
  package_manager: maven
runtimes:
  active:
    - claude-code
`;
    const { status, all } = validateYaml(t, yaml);
    assert.equal(status, 0, all);
  });

  test('Flutter project.yaml validates (mobile type + stack.mobile)', (t) => {
    const yaml = `project:
  name: "My App"
  slug: "my-app"
  language: dart
  type: mobile
  mode: startup
  status: active
stack:
  mobile: flutter
  mobile_language: dart
  package_manager: pub
runtimes:
  active:
    - claude-code
`;
    const { status, all } = validateYaml(t, yaml);
    assert.equal(status, 0, all);
  });

  test('Rust + Axum project.yaml validates', (t) => {
    const yaml = `project:
  name: "Rust API"
  slug: "rust-api"
  language: rust
  type: backend
  mode: standard
stack:
  backend: axum
  backend_language: rust
  package_manager: cargo
runtimes:
  active:
    - claude-code
`;
    const { status, all } = validateYaml(t, yaml);
    assert.equal(status, 0, all);
  });

  test('OLD single-language project.yaml still validates', (t) => {
    const yaml = `project:
  name: "Legacy"
  slug: "legacy"
  language: typescript
  mode: standard
  status: active
stack:
  backend: hono
  frontend: nextjs
  database: postgresql
  orm: drizzle
  package_manager: pnpm
  testing:
    - vitest
runtimes:
  active:
    - claude-code
`;
    const { status, all } = validateYaml(t, yaml);
    assert.equal(status, 0, all);
  });
});

// ─── D. adopt end-to-end on Rust + Flutter fixtures (SPEC-039) ────────────────

describe('forge adopt — new stacks end-to-end (SPEC-039)', () => {
  test('Rust + Axum: valid project.yaml + wiki entity page + clean lint', (t) => {
    const dir = makeTmpDir(t);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'Cargo.toml'),
      '[package]\nname = "rust-api"\nversion = "0.1.0"\ndescription = "An Axum API service"\n[dependencies]\naxum = "0.7"\ntokio = { version = "1", features = ["full"] }\n', 'utf-8');
    writeFileSync(join(dir, 'src', 'main.rs'), 'fn main() {}\n', 'utf-8');
    writeFileSync(join(dir, 'README.md'), '# Rust API\n\nAn Axum-based API.\n', 'utf-8');

    const res = runForge(['adopt', '--yes', dir]);
    assert.equal(res.status, 0, res.all);

    const validate = runForge(['validate'], { cwd: dir });
    assert.equal(validate.status, 0, validate.all);

    const yaml = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(yaml, /language: rust/);
    assert.match(yaml, /backend: axum/);
    assert.match(yaml, /type: backend/);

    // wiki entity page for the framework
    assert.ok(existsSync(join(dir, 'wiki', 'entities', 'axum.md')),
      'expected wiki/entities/axum.md');

    const lint = runForge(['wiki', 'lint'], { cwd: dir });
    assert.equal(lint.status, 0, lint.all);
    assert.match(lint.all, /Wiki íntegro/);
  });

  test('Flutter: valid project.yaml (mobile) + wiki entity page + clean lint', (t) => {
    const dir = makeTmpDir(t);
    mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'pubspec.yaml'),
      'name: my_app\ndescription: A sample Flutter application\nenvironment:\n  sdk: ">=3.0.0 <4.0.0"\ndependencies:\n  flutter:\n    sdk: flutter\n', 'utf-8');
    writeFileSync(join(dir, 'lib', 'main.dart'), 'void main() {}\n', 'utf-8');
    writeFileSync(join(dir, 'README.md'), '# My App\n\nA Flutter mobile app.\n', 'utf-8');

    const res = runForge(['adopt', '--yes', dir]);
    assert.equal(res.status, 0, res.all);

    const validate = runForge(['validate'], { cwd: dir });
    assert.equal(validate.status, 0, validate.all);

    const yaml = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(yaml, /language: dart/);
    assert.match(yaml, /mobile: flutter/);
    assert.match(yaml, /type: mobile/);

    assert.ok(existsSync(join(dir, 'wiki', 'entities', 'flutter.md')),
      'expected wiki/entities/flutter.md');

    // CLAUDE.md renders the mobile line
    const claude = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    assert.match(claude, /\*\*Mobile\*\*: flutter \(Dart\)/);

    const lint = runForge(['wiki', 'lint'], { cwd: dir });
    assert.equal(lint.status, 0, lint.all);
    assert.match(lint.all, /Wiki íntegro/);
  });

  test('FastAPI: valid project.yaml + fastapi entity page', (t) => {
    const dir = makeTmpDir(t);
    mkdirSync(join(dir, 'app'), { recursive: true });
    writeFileSync(join(dir, 'requirements.txt'), 'fastapi==0.110.0\nuvicorn\n', 'utf-8');
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "svc"\ndescription = "FastAPI service"\n', 'utf-8');
    writeFileSync(join(dir, 'app', 'main.py'), 'from fastapi import FastAPI\n', 'utf-8');
    writeFileSync(join(dir, 'README.md'), '# Svc\n\nA FastAPI service.\n', 'utf-8');

    const res = runForge(['adopt', '--yes', dir]);
    assert.equal(res.status, 0, res.all);
    const yaml = readFileSync(join(dir, 'project.yaml'), 'utf-8');
    assert.match(yaml, /language: python/);
    assert.match(yaml, /backend: fastapi/);
    assert.ok(existsSync(join(dir, 'wiki', 'entities', 'fastapi.md')));

    const lint = runForge(['wiki', 'lint'], { cwd: dir });
    assert.equal(lint.status, 0, lint.all);
  });
});
