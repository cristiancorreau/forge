// SPEC-037 — wizard project type + per-side language.
//
// Covers:
//   1. The pure wizard-flow helpers (which steps run per type, framework
//      filtered by language, derived project.language).
//   2. buildProjectYaml() for the three project types: the generated YAML has
//      the right stack + per-side language + derived project.language and PASSES
//      `forge validate`.
//   3. A Python-backend + TypeScript-frontend fullstack case (mixed language).
//   4. backend-only omits frontend (DB/ORM still present); frontend-only omits
//      backend + DB/ORM.
//   5. An OLD project.yaml (single language, no new fields) still validates.
//
// Uses the native Node test runner. The CLI must be built first (npm run build:all).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  hasBackend, hasFrontend,
  backendFrameworksFor, frontendFrameworksFor,
  deriveProjectLanguage, inferProjectType,
  stackWithLanguage,
} from '../dist/lib/wizard-flow.js';
import { buildProjectYaml } from '../dist/commands/init.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-wpt-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return (s ?? '').replace(/\x1b\[[0-9;]*m/g, '');
}

/** Write a project.yaml + run `forge validate` in a temp dir. */
function validateYaml(t, yamlContent) {
  const dir = makeTmpDir(t);
  writeFileSync(join(dir, 'project.yaml'), yamlContent, 'utf-8');
  const res = spawnSync(process.execPath, [CLI, 'validate'], {
    cwd: dir, encoding: 'utf-8', env: { ...process.env, FORGE_HOME: '' },
  });
  return { status: res.status ?? 1, out: stripAnsi(res.stdout) + stripAnsi(res.stderr) };
}

/** A minimal but complete WizardResult for buildProjectYaml. */
function wizardResult(overrides = {}) {
  return {
    name: 'Test', slug: 'test', description: 'desc',
    language: 'typescript', type: 'fullstack',
    backendLanguage: undefined, frontendLanguage: undefined,
    mode: 'standard',
    backend: undefined, frontend: undefined,
    database: undefined, orm: undefined, packageManager: undefined,
    testing: [], profiles: [], skills: [], runtime: 'claude-code', detected: false,
    ...overrides,
  };
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('wizard-flow pure helpers (SPEC-037)', () => {
  test('hasBackend / hasFrontend gate the right sides per type', () => {
    assert.equal(hasBackend('backend'), true);
    assert.equal(hasBackend('fullstack'), true);
    assert.equal(hasBackend('frontend'), false);

    assert.equal(hasFrontend('frontend'), true);
    assert.equal(hasFrontend('fullstack'), true);
    assert.equal(hasFrontend('backend'), false);
  });

  test('framework list is filtered by language', () => {
    assert.deepEqual(backendFrameworksFor('typescript'), ['hono', 'express', 'nestjs', 'fastify']);
    assert.deepEqual(backendFrameworksFor('python'), ['fastapi', 'django']);
    assert.deepEqual(backendFrameworksFor('ruby'), ['rails']);
    assert.deepEqual(backendFrameworksFor('go'), ['go-gin']);
    assert.deepEqual(backendFrameworksFor('php'), ['laravel']);
    // A Python backend must NOT offer Next.js, and a TS backend must NOT offer FastAPI.
    assert.ok(!backendFrameworksFor('python').includes('hono'));
    assert.ok(!backendFrameworksFor('typescript').includes('fastapi'));

    assert.deepEqual(frontendFrameworksFor('typescript'), ['nextjs', 'astro', 'sveltekit', 'nuxt']);
    // Frontend is TS-only today: a non-TS language yields no built-in frameworks.
    assert.deepEqual(frontendFrameworksFor('python'), []);
  });

  test('deriveProjectLanguage follows the back-compat rule', () => {
    // backend / fullstack same language → that language
    assert.equal(deriveProjectLanguage({ type: 'backend', backendLanguage: 'python' }), 'python');
    assert.equal(deriveProjectLanguage({ type: 'fullstack', backendLanguage: 'typescript', frontendLanguage: 'typescript' }), 'typescript');
    // frontend-only → frontend language
    assert.equal(deriveProjectLanguage({ type: 'frontend', frontendLanguage: 'typescript' }), 'typescript');
    // fullstack with differing sides → mixed
    assert.equal(deriveProjectLanguage({ type: 'fullstack', backendLanguage: 'python', frontendLanguage: 'typescript' }), 'mixed');
  });

  test('inferProjectType from detected sides', () => {
    assert.equal(inferProjectType({ backend: 'fastapi', frontend: 'nextjs' }), 'fullstack');
    assert.equal(inferProjectType({ frontend: 'nextjs' }), 'frontend');
    assert.equal(inferProjectType({ backend: 'hono' }), 'backend');
    assert.equal(inferProjectType({}), 'backend');
  });

  test('stackWithLanguage renders per-side language, degrades for old files', () => {
    assert.equal(stackWithLanguage('fastapi', 'python'), 'fastapi (Python)');
    assert.equal(stackWithLanguage('nextjs', 'typescript'), 'nextjs (TypeScript)');
    assert.equal(stackWithLanguage('hono', null), 'hono');     // no per-side language (old)
    assert.equal(stackWithLanguage(null, null), 'N/A');        // side absent
  });
});

// ─── buildProjectYaml per project type ───────────────────────────────────────

describe('buildProjectYaml per project type (SPEC-037)', () => {
  test('fullstack: Python backend + TypeScript frontend → mixed', (t) => {
    const yaml = buildProjectYaml(wizardResult({
      type: 'fullstack',
      backend: 'fastapi', backendLanguage: 'python',
      frontend: 'nextjs', frontendLanguage: 'typescript',
      language: 'mixed',
      database: 'postgresql', orm: 'sqlalchemy', packageManager: 'pip',
      testing: ['pytest'],
    }));

    assert.match(yaml, /type: fullstack/);
    assert.match(yaml, /language: mixed/);
    assert.match(yaml, /backend: fastapi/);
    assert.match(yaml, /backend_language: python/);
    assert.match(yaml, /frontend: nextjs/);
    assert.match(yaml, /frontend_language: typescript/);
    assert.match(yaml, /database: postgresql/);
    assert.match(yaml, /orm: sqlalchemy/);

    const { status, out } = validateYaml(t, yaml);
    assert.equal(status, 0, `validate should pass; output:\n${out}`);
  });

  test('fullstack: TypeScript both sides → typescript (not mixed)', (t) => {
    const yaml = buildProjectYaml(wizardResult({
      type: 'fullstack',
      backend: 'hono', backendLanguage: 'typescript',
      frontend: 'nextjs', frontendLanguage: 'typescript',
      language: 'typescript',
      database: 'postgresql', orm: 'drizzle', packageManager: 'pnpm',
    }));
    assert.match(yaml, /type: fullstack/);
    assert.match(yaml, /language: typescript/);
    assert.match(yaml, /backend_language: typescript/);
    assert.match(yaml, /frontend_language: typescript/);
    const { status, out } = validateYaml(t, yaml);
    assert.equal(status, 0, `validate should pass; output:\n${out}`);
  });

  test('backend-only: omits frontend, keeps DB/ORM', (t) => {
    const yaml = buildProjectYaml(wizardResult({
      type: 'backend',
      backend: 'fastapi', backendLanguage: 'python',
      frontend: undefined, frontendLanguage: undefined,
      language: 'python',
      database: 'postgresql', orm: 'sqlalchemy', packageManager: 'poetry',
      testing: ['pytest'],
    }));
    assert.match(yaml, /type: backend/);
    assert.match(yaml, /language: python/);
    assert.match(yaml, /backend: fastapi/);
    assert.match(yaml, /backend_language: python/);
    // No frontend lines.
    assert.doesNotMatch(yaml, /frontend:/);
    assert.doesNotMatch(yaml, /frontend_language:/);
    // DB/ORM allowed with a backend.
    assert.match(yaml, /database: postgresql/);
    assert.match(yaml, /orm: sqlalchemy/);

    const { status, out } = validateYaml(t, yaml);
    assert.equal(status, 0, `validate should pass; output:\n${out}`);
  });

  test('frontend-only: omits backend + DB/ORM', (t) => {
    const yaml = buildProjectYaml(wizardResult({
      type: 'frontend',
      backend: undefined, backendLanguage: undefined,
      frontend: 'astro', frontendLanguage: 'typescript',
      language: 'typescript',
      database: undefined, orm: undefined, packageManager: 'pnpm',
      testing: ['vitest'],
    }));
    assert.match(yaml, /type: frontend/);
    assert.match(yaml, /language: typescript/);
    assert.match(yaml, /frontend: astro/);
    assert.match(yaml, /frontend_language: typescript/);
    // No backend / DB / ORM.
    assert.doesNotMatch(yaml, /backend:/);
    assert.doesNotMatch(yaml, /backend_language:/);
    assert.doesNotMatch(yaml, /database:/);
    assert.doesNotMatch(yaml, /orm:/);

    const { status, out } = validateYaml(t, yaml);
    assert.equal(status, 0, `validate should pass; output:\n${out}`);
  });
});

// ─── Backward compatibility ──────────────────────────────────────────────────

describe('backward compatibility (SPEC-037)', () => {
  test('OLD project.yaml (single language, no new fields) still validates', (t) => {
    const oldYaml = `project:
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
    const { status, out } = validateYaml(t, oldYaml);
    assert.equal(status, 0, `old project.yaml must still validate; output:\n${out}`);
  });

  test("repo-style project.yaml (language: mixed, null stack) still validates", (t) => {
    const repoLike = `project:
  name: "forge"
  slug: "forge"
  language: "mixed"
  mode: "enterprise"
  status: "active"
stack:
  backend: null
  frontend: null
  database: null
  orm: null
  package_manager: "npm"
  testing:
    - node-test
    - pytest
runtimes:
  active:
    - claude-code
`;
    const { status, out } = validateYaml(t, repoLike);
    assert.equal(status, 0, `repo-style project.yaml must validate; output:\n${out}`);
  });

  test('new project.type + per-side language pass the schema', (t) => {
    const yaml = `project:
  name: "New"
  slug: "new"
  language: mixed
  type: fullstack
  mode: standard
  status: active
stack:
  backend: fastapi
  backend_language: python
  frontend: nextjs
  frontend_language: typescript
  database: postgresql
  orm: sqlalchemy
runtimes:
  active:
    - claude-code
`;
    const { status, out } = validateYaml(t, yaml);
    assert.equal(status, 0, `new fields must pass the schema; output:\n${out}`);
  });
});
