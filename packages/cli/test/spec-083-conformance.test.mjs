// SPEC-083 P1 — suite de conformidad de salida estándar.
//
// Garantiza que todo lo que forge genera es 100% conforme a los estándares que
// un orquestador externo (mingako) hereda sin integración:
//   - AGENTS.md (agents.md / Linux Foundation): markdown plano, sin frontmatter,
//     un solo H1, fences balanceados, tablas bien formadas. Forge emite el
//     AGENTS.md de la raíz y, cuando agents.scope mapea agentes a subdirectorios
//     (monorepo), un AGENTS.md anidado por scope que materializa la precedencia
//     del estándar (el archivo más cercano al código gana).
//   - Skills (agentskills.io): SKILL.md con frontmatter YAML, `name` kebab-case
//     (<=64 chars) igual al directorio, `description` no vacía (<=1024 chars).
//   - Agentes `.claude/agents/*.md`: frontmatter YAML parseable con name,
//     description y tools; model presente; skills/mcpServers tipados cuando existen.
//   - Config JSON generada (settings.json, hooks de Kiro, mcpServers del export):
//     parseable y con el shape que esperan los runtimes.
//   - Runtimes rules-based (los 15 del registro): documento de reglas markdown
//     estándar en la ruta convencional de cada runtime.
//
// Corre la CLI compilada (dist/cli.js) en directorios temporales, como
// spec-083-json-contract.test.mjs. Requiere build previo (npm run build:all).
//
//     node --test test/spec-083-conformance.test.mjs

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const CLI = join(DIST, 'cli.js');
const ASSETS = join(__dirname, '..', 'assets');

// Los 4 runtimes nativos con conformidad verificable (SPEC-083 P1).
const NATIVE_RUNTIMES = ['claude-code', 'opencode', 'codex', 'kiro'];

let parseFrontmatter, parseAgentTools;
before(async () => {
  assert.ok(existsSync(CLI), 'dist/cli.js no existe — correr npm run build:all primero');
  assert.ok(existsSync(join(ASSETS, 'core', 'skills')), 'assets/core/skills no existe — correr npm run build:all primero');
  const unitRegistry = await import(pathToFileURL(join(DIST, 'lib', 'unit-registry.js')).href);
  parseFrontmatter = unitRegistry.parseFrontmatter;
  parseAgentTools = unitRegistry.parseAgentTools;
});

/** Corre la CLI compilada. Devuelve { status, stdout, stderr }. */
function runForge(args, opts = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, FORGE_HOME: '', FORGE_NO_BUN: '1', FORGE_NO_DASHBOARD: '1' },
  });
  return { status: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-083p1-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Fixture: project.yaml completo (agentes, compliance, profiles, mcp, deploy). */
function writeFixtureYaml(dir) {
  writeFileSync(join(dir, 'project.yaml'), `project:
  name: "demo-conformance"
  slug: "demo-conformance"
  mode: standard
  language: typescript
stack:
  backend: express
  frontend: nextjs
  database: postgresql
  testing:
    - vitest
agents:
  active:
    - orchestrator
    - backend-engineer
    - frontend-engineer
  compliance:
    - compliance-reviewer
deploy:
  provider: vercel
mcp:
  servers:
    - name: postgres
      auto_approve:
        - query
`);
}

// ── Validadores de markdown (estándar AGENTS.md: markdown plano) ─────────────

/** Divide en líneas ignorando el contenido dentro de fences ```...```. */
function linesOutsideFences(md) {
  const out = [];
  let inFence = false;
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence) out.push(line);
  }
  return { lines: out, fenceBalanced: !inFence };
}

/** Asserts de estructura markdown estándar sobre un documento generado. */
function assertStandardMarkdown(md, label) {
  assert.ok(md.trim().length > 0, `${label}: documento vacío`);
  assert.ok(!/^---\r?\n/.test(md), `${label}: no debe tener frontmatter YAML (markdown plano)`);

  const { lines, fenceBalanced } = linesOutsideFences(md);
  assert.ok(fenceBalanced, `${label}: code fences sin cerrar`);

  const h1s = lines.filter(l => /^# /.test(l));
  assert.equal(h1s.length, 1, `${label}: debe tener exactamente un H1 (tiene ${h1s.length}: ${JSON.stringify(h1s)})`);

  const firstContent = lines.find(l => l.trim().length > 0);
  assert.ok(/^# /.test(firstContent ?? ''), `${label}: la primera línea de contenido debe ser el H1`);

  // Tablas: cada separador bien formado y con header en la línea anterior.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\|[\s\-:|]+\|\s*$/.test(line) && /-/.test(line)) {
      assert.ok(
        /^\|.*\|\s*$/.test(lines[i - 1] ?? ''),
        `${label}: separador de tabla sin fila de header (línea ${i + 1})`,
      );
    }
  }
}

// ── AGENTS.md (opencode, codex) ──────────────────────────────────────────────

/** Rutas absolutas de todos los archivos llamados `name` bajo `dir`. */
function findFilesNamed(dir, name) {
  const found = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === name) found.push(full);
    }
  };
  walk(dir);
  return found.sort();
}

describe('SPEC-083 P1 — AGENTS.md conforme al estándar', () => {
  for (const runtime of ['opencode', 'codex']) {
    test(`generate --runtime ${runtime}: AGENTS.md es markdown estándar`, (t) => {
      const dir = makeTmpDir(t);
      writeFixtureYaml(dir);
      const res = runForge(['generate', '--runtime', runtime, '--force'], { cwd: dir });
      assert.equal(res.status, 0, res.stderr || res.stdout);

      const path = join(dir, 'AGENTS.md');
      assert.ok(existsSync(path), `${runtime}: AGENTS.md no generado`);
      assertStandardMarkdown(readFileSync(path, 'utf-8'), `${runtime}/AGENTS.md`);
    });

    test(`generate --runtime ${runtime}: sin agents.scope, un único AGENTS.md en la raíz`, (t) => {
      // Sin scopes por agente no hay precedencia que materializar: un solo
      // AGENTS.md en la raíz, sin archivos anidados espurios.
      const dir = makeTmpDir(t);
      writeFixtureYaml(dir);
      const res = runForge(['generate', '--runtime', runtime, '--force'], { cwd: dir });
      assert.equal(res.status, 0, res.stderr || res.stdout);

      assert.deepEqual(
        findFilesNamed(dir, 'AGENTS.md'), [join(dir, 'AGENTS.md')],
        `${runtime}: AGENTS.md solo en la raíz`,
      );
    });

    test(`generate --runtime ${runtime}: agents.scope emite AGENTS.md anidados (precedencia de monorepo)`, (t) => {
      // SPEC-083 P1: "AGENTS.md conforme al estándar (incluida precedencia
      // anidada en monorepos)". Cada directorio con agentes scoped recibe su
      // AGENTS.md; el estándar resuelve por cercanía (el más próximo gana).
      const dir = makeTmpDir(t);
      writeFileSync(join(dir, 'project.yaml'), `project:
  name: "demo-mono"
  slug: "demo-mono"
  mode: standard
agents:
  active:
    - orchestrator
    - backend-engineer
    - frontend-engineer
  scope:
    orchestrator: /
    backend-engineer: apps/api
    frontend-engineer: apps/web/
`);
      const res = runForge(['generate', '--runtime', runtime, '--force'], { cwd: dir });
      assert.equal(res.status, 0, res.stderr || res.stdout);

      for (const [sub, agent] of [['apps/api', 'backend-engineer'], ['apps/web', 'frontend-engineer']]) {
        const nested = join(dir, sub, 'AGENTS.md');
        assert.ok(existsSync(nested), `${runtime}: falta ${sub}/AGENTS.md`);
        const md = readFileSync(nested, 'utf-8');
        assertStandardMarkdown(md, `${runtime}/${sub}/AGENTS.md`);
        assert.ok(md.includes(agent), `${runtime}: ${sub}/AGENTS.md no menciona ${agent}`);
        assert.ok(/precedencia|prioridad/i.test(md), `${runtime}: ${sub}/AGENTS.md no documenta la precedencia`);
      }

      // scope '/' (orchestrator) no genera anidado: raíz + los dos scopes, nada más.
      assert.deepEqual(
        findFilesNamed(dir, 'AGENTS.md'),
        [join(dir, 'AGENTS.md'), join(dir, 'apps', 'api', 'AGENTS.md'), join(dir, 'apps', 'web', 'AGENTS.md')].sort(),
        `${runtime}: AGENTS.md esperados en raíz y scopes`,
      );
      assertStandardMarkdown(readFileSync(join(dir, 'AGENTS.md'), 'utf-8'), `${runtime}/AGENTS.md (con scopes)`);
    });
  }

  test('AGENTS.md de opencode y codex mencionan los agentes declarados', (t) => {
    for (const runtime of ['opencode', 'codex']) {
      const dir = makeTmpDir(t);
      writeFixtureYaml(dir);
      runForge(['generate', '--runtime', runtime, '--force'], { cwd: dir });
      const md = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
      for (const agent of ['orchestrator', 'backend-engineer', 'frontend-engineer', 'compliance-reviewer']) {
        assert.ok(md.includes(agent), `${runtime}: AGENTS.md no menciona ${agent}`);
      }
    }
  });
});

// ── Nested AGENTS.md: guards de seguridad ────────────────────────────────────

describe('SPEC-083 P1 — nested AGENTS.md: traversal y archivos manuales', () => {
  test('nestedAgentsSurfaces rechaza traversal, separadores Windows y drive letters', async () => {
    const { nestedAgentsSurfaces } = await import(
      pathToFileURL(join(DIST, 'lib', 'generators', 'opencode.js')).href
    );
    const surfacesFor = (scope) => nestedAgentsSurfaces({
      project: { name: 'x', mode: 'standard' },
      agents: { active: Object.keys(scope), scope },
    });

    // Escapes que deben rechazarse: POSIX, Windows y mixtos.
    for (const bad of [
      '../../outside', '..', './..',
      '..\\x', 'a\\..\\..\\b', '..\\..\\outside',
      'C:\\x', 'C:/x', 'c:x',
      '/', '', '.',
    ]) {
      assert.deepEqual(
        surfacesFor({ 'backend-engineer': bad }), [],
        `scope '${bad}' no debe emitir AGENTS.md anidado`,
      );
    }

    // Casos legítimos: separador POSIX y separador Windows normalizado.
    for (const good of ['apps/api', 'apps\\api', './apps/api/', '/apps/api']) {
      const surfaces = surfacesFor({ 'backend-engineer': good });
      assert.equal(surfaces.length, 1, `scope '${good}' debe emitir un anidado`);
      assert.equal(surfaces[0].path, 'apps/api/AGENTS.md', `scope '${good}' debe normalizar a apps/api/AGENTS.md`);
    }
  });

  test('generate con scopes maliciosos no escribe AGENTS.md fuera de los scopes válidos', (t) => {
    const dir = makeTmpDir(t);
    writeFileSync(join(dir, 'project.yaml'), `project:
  name: "demo-evil"
  slug: "demo-evil"
  mode: standard
agents:
  active:
    - backend-engineer
    - frontend-engineer
  scope:
    backend-engineer: "..\\\\..\\\\outside"
    frontend-engineer: "../../outside"
`);
    const res = runForge(['generate', '--runtime', 'opencode', '--force'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr || res.stdout);
    assert.deepEqual(
      findFilesNamed(dir, 'AGENTS.md'), [join(dir, 'AGENTS.md')],
      'solo debe existir el AGENTS.md de la raíz',
    );
    assert.ok(!existsSync(join(dirname(dirname(dir)), 'outside')), 'no debe escribir fuera de la raíz');
  });

  for (const runtime of ['opencode', 'codex']) {
    test(`generate --runtime ${runtime} --force: un AGENTS.md anidado escrito a mano NUNCA se sobrescribe`, (t) => {
      const dir = makeTmpDir(t);
      writeFileSync(join(dir, 'project.yaml'), `project:
  name: "demo-manual"
  slug: "demo-manual"
  mode: standard
agents:
  active:
    - backend-engineer
  scope:
    backend-engineer: apps/api
`);
      const manual = '# Guía interna del equipo API\n\nEscrita a mano, sin marcador de forge.\n';
      mkdirSync(join(dir, 'apps', 'api'), { recursive: true });
      writeFileSync(join(dir, 'apps', 'api', 'AGENTS.md'), manual);

      const res = runForge(['generate', '--runtime', runtime, '--force'], { cwd: dir });
      assert.equal(res.status, 0, res.stderr || res.stdout);
      assert.equal(
        readFileSync(join(dir, 'apps', 'api', 'AGENTS.md'), 'utf-8'), manual,
        `${runtime}: --force no debe destruir un AGENTS.md manual`,
      );
      const out = res.stdout + res.stderr;
      assert.ok(/manual/i.test(out), `${runtime}: debe avisar que el archivo manual se conserva`);
    });

    test(`generate --runtime ${runtime} --force: un AGENTS.md anidado generado por forge SÍ se regenera`, (t) => {
      const dir = makeTmpDir(t);
      writeFileSync(join(dir, 'project.yaml'), `project:
  name: "demo-regen"
  slug: "demo-regen"
  mode: standard
agents:
  active:
    - backend-engineer
  scope:
    backend-engineer: apps/api
`);
      mkdirSync(join(dir, 'apps', 'api'), { recursive: true });
      writeFileSync(
        join(dir, 'apps', 'api', 'AGENTS.md'),
        '# Viejo\n\n> Generado por forge v2 (versión anterior).\n',
      );

      const res = runForge(['generate', '--runtime', runtime, '--force'], { cwd: dir });
      assert.equal(res.status, 0, res.stderr || res.stdout);
      const md = readFileSync(join(dir, 'apps', 'api', 'AGENTS.md'), 'utf-8');
      assert.ok(md.includes('backend-engineer'), `${runtime}: el anidado con marcador debe regenerarse con --force`);
      assert.ok(!md.includes('# Viejo'), `${runtime}: el contenido viejo debe reemplazarse`);
    });
  }
});

// ── Runtimes rules-based (los 15 del registro) ───────────────────────────────

describe('SPEC-083 P1 — runtimes rules-based emiten markdown estándar', () => {
  test('cada runtime rules-based genera su documento de reglas conforme en la ruta convencional', async (t) => {
    // "Test de conformidad en CI por cada emisor": el registro es la fuente de
    // verdad — todo runtime kind:'rules' queda cubierto automáticamente.
    const { RUNTIMES } = await import(pathToFileURL(join(DIST, 'lib', 'generators', 'registry.js')).href);
    const rules = RUNTIMES.filter(r => r.kind === 'rules');
    assert.ok(rules.length >= 15, `esperaba >=15 runtimes rules-based en el registro, hay ${rules.length}`);

    for (const rt of rules) {
      const dir = makeTmpDir(t);
      writeFixtureYaml(dir);
      const res = runForge(['generate', '--runtime', rt.id, '--force'], { cwd: dir });
      assert.equal(res.status, 0, `${rt.id}: ${res.stderr || res.stdout}`);

      const relPath = rt.surfaces({ project: { name: 'x', mode: 'standard' } })[0].path;
      const abs = join(dir, relPath);
      assert.ok(existsSync(abs), `${rt.id}: falta ${relPath}`);
      const md = readFileSync(abs, 'utf-8');
      assertStandardMarkdown(md, `${rt.id}/${relPath}`);
      for (const agent of ['orchestrator', 'backend-engineer', 'compliance-reviewer']) {
        assert.ok(md.includes(agent), `${rt.id}: ${relPath} no menciona ${agent}`);
      }
    }
  });
});

// ── CLAUDE.md + .claude/ (claude-code) ───────────────────────────────────────

describe('SPEC-083 P1 — claude-code: CLAUDE.md, agentes y settings.json', () => {
  // Un solo init compartido entre los tests del bloque (init es costoso).
  let projectDir;
  before(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'forge-083p1-init-'));
    writeFileSync(join(projectDir, 'answers.json'), JSON.stringify({
      name: 'Demo Conformance', type: 'fullstack',
      backend: 'laravel', backendLanguage: 'php',
      frontend: 'nextjs', frontendLanguage: 'typescript',
      mode: 'standard', runtime: 'claude-code',
      testing: ['pest'], skills: ['spec', 'session-start'],
    }));
    const res = runForge(['init', '--from', 'answers.json'], { cwd: projectDir });
    assert.equal(res.status, 0, res.stderr || res.stdout);
  });
  after(() => rmSync(projectDir, { recursive: true, force: true }));

  test('CLAUDE.md generado es markdown estándar', () => {
    const path = join(projectDir, 'CLAUDE.md');
    assert.ok(existsSync(path), 'CLAUDE.md no generado');
    assertStandardMarkdown(readFileSync(path, 'utf-8'), 'CLAUDE.md');
  });

  test('cada .claude/agents/*.md tiene frontmatter completo (name, description, tools, model)', () => {
    const agentsDir = join(projectDir, '.claude', 'agents');
    const files = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    assert.ok(files.length >= 5, `pocos agentes instalados: ${files.length}`);

    for (const file of files) {
      const content = readFileSync(join(agentsDir, file), 'utf-8');
      const fm = parseFrontmatter(content);
      const label = `.claude/agents/${file}`;

      assert.ok(Object.keys(fm).length > 0, `${label}: frontmatter YAML no parseable o ausente`);
      assert.equal(fm.name, basename(file, '.md'), `${label}: name debe coincidir con el archivo`);
      assert.equal(typeof fm.description, 'string', `${label}: description ausente`);
      assert.ok(fm.description.trim().length > 0, `${label}: description vacía`);
      assert.ok(fm.description.length <= 1024, `${label}: description >1024 chars`);
      assert.ok(typeof fm.model === 'string' && fm.model.length > 0, `${label}: model ausente`);

      const tools = parseAgentTools(content);
      assert.ok(tools.length > 0, `${label}: tools ausentes en el frontmatter`);
      for (const tool of tools) assert.ok(/^\S+$/.test(tool), `${label}: tool malformada '${tool}'`);

      // skills / mcpServers: opcionales, pero si existen deben ser listas de strings.
      for (const key of ['skills', 'mcpServers', 'mcp_servers']) {
        if (fm[key] === undefined) continue;
        const val = Array.isArray(fm[key])
          ? fm[key]
          : String(fm[key]).split(',').map(s => s.trim()).filter(Boolean);
        assert.ok(val.length > 0, `${label}: ${key} declarado pero vacío`);
        for (const v of val) assert.equal(typeof v, 'string', `${label}: ${key} contiene un valor no-string`);
      }
    }
  });

  test('skills/mcpServers del frontmatter sobreviven la instalación (caso positivo, no vacuo)', () => {
    // El fixture instala el profile laravel (backend: laravel), cuyo
    // laravel-specialist declara skills y mcpServers en su markdown fuente.
    // Este test garantiza que el check de arriba tiene un caso positivo real:
    // si un emisor rompe esas claves (las pierde o las malforma), esto falla.
    const path = join(projectDir, '.claude', 'agents', 'laravel-specialist.md');
    assert.ok(existsSync(path), 'laravel-specialist.md no instalado por el profile laravel');
    const fm = parseFrontmatter(readFileSync(path, 'utf-8'));

    const toList = (v) => Array.isArray(v)
      ? v.map(s => String(s).trim())
      : String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);

    const skills = toList(fm.skills);
    assert.ok(skills.length > 0, 'laravel-specialist debe declarar skills en el frontmatter instalado');
    assert.ok(skills.includes('laravel-eloquent'), `skills no incluye laravel-eloquent: ${JSON.stringify(skills)}`);
    for (const s of skills) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/, `skill malformada: '${s}'`);

    const servers = toList(fm.mcpServers);
    assert.ok(servers.length > 0, 'laravel-specialist debe declarar mcpServers en el frontmatter instalado');
    assert.ok(servers.includes('laravel-boost'), `mcpServers no incluye laravel-boost: ${JSON.stringify(servers)}`);
  });

  test('.claude/settings.json es JSON válido con el shape de Claude Code', () => {
    const path = join(projectDir, '.claude', 'settings.json');
    assert.ok(existsSync(path), 'settings.json no generado');
    const settings = JSON.parse(readFileSync(path, 'utf-8'));

    assert.ok(Array.isArray(settings.permissions?.allow), 'permissions.allow debe ser lista');
    for (const p of settings.permissions.allow) assert.equal(typeof p, 'string');

    assert.ok(settings.hooks && typeof settings.hooks === 'object', 'hooks ausente');
    for (const [event, entries] of Object.entries(settings.hooks)) {
      assert.ok(Array.isArray(entries), `hooks.${event} debe ser lista`);
      for (const entry of entries) {
        assert.ok(Array.isArray(entry.hooks), `hooks.${event}[].hooks debe ser lista`);
        for (const h of entry.hooks) {
          assert.equal(h.type, 'command', `hooks.${event}: type debe ser 'command'`);
          assert.equal(typeof h.command, 'string', `hooks.${event}: command debe ser string`);
        }
      }
    }
  });
});

// ── Kiro (steering markdown + hooks JSON) ────────────────────────────────────

describe('SPEC-083 P1 — kiro: steering y hooks', () => {
  test('generate --runtime kiro: steering *.md no vacíos y hooks *.json parseables', (t) => {
    const dir = makeTmpDir(t);
    writeFixtureYaml(dir);
    const res = runForge(['generate', '--runtime', 'kiro', '--force'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr || res.stdout);

    const steering = join(dir, '.kiro', 'steering');
    for (const f of ['product.md', 'structure.md', 'agents.md', 'commands.md']) {
      const p = join(steering, f);
      assert.ok(existsSync(p), `.kiro/steering/${f} no generado`);
      const md = readFileSync(p, 'utf-8');
      assert.ok(md.trim().length > 0, `.kiro/steering/${f} vacío`);
      const { fenceBalanced } = linesOutsideFences(md);
      assert.ok(fenceBalanced, `.kiro/steering/${f}: fences sin cerrar`);
    }

    const hooksDir = join(dir, '.kiro', 'hooks');
    const hookFiles = readdirSync(hooksDir).filter(f => f.endsWith('.json'));
    assert.ok(hookFiles.length >= 3, `pocos hooks kiro: ${hookFiles.length}`);
    for (const f of hookFiles) {
      const hook = JSON.parse(readFileSync(join(hooksDir, f), 'utf-8'));
      const label = `.kiro/hooks/${f}`;
      assert.equal(typeof hook.name, 'string', `${label}: name`);
      assert.equal(typeof hook.description, 'string', `${label}: description`);
      assert.equal(typeof hook.event, 'string', `${label}: event`);
      assert.equal(typeof hook.condition?.type, 'string', `${label}: condition.type`);
      assert.equal(typeof hook.action?.type, 'string', `${label}: action.type`);
      assert.equal(typeof hook.action?.message, 'string', `${label}: action.message`);
    }
  });
});

// ── Skills (agentskills.io) ──────────────────────────────────────────────────

describe('SPEC-083 P1 — skills conformes a agentskills.io', () => {
  const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  test('toda skill del bundle tiene SKILL.md con frontmatter name/description conformes', () => {
    const skillsDir = join(ASSETS, 'core', 'skills');
    const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory());
    assert.ok(dirs.length >= 20, `pocas skills en el bundle: ${dirs.length}`);

    for (const entry of dirs) {
      const label = `core/skills/${entry.name}`;
      const skillMd = join(skillsDir, entry.name, 'SKILL.md');
      assert.ok(existsSync(skillMd), `${label}: falta SKILL.md`);

      const fm = parseFrontmatter(readFileSync(skillMd, 'utf-8'));
      assert.ok(Object.keys(fm).length > 0, `${label}: SKILL.md sin frontmatter YAML parseable`);

      // name: obligatorio, kebab-case, <=64 chars, igual al directorio.
      assert.equal(typeof fm.name, 'string', `${label}: frontmatter sin name`);
      assert.equal(fm.name, entry.name, `${label}: name ('${fm.name}') debe ser igual al directorio`);
      assert.ok(KEBAB.test(fm.name), `${label}: name no es kebab-case`);
      assert.ok(fm.name.length <= 64, `${label}: name >64 chars`);

      // description: obligatoria, no vacía, <=1024 chars.
      assert.equal(typeof fm.description, 'string', `${label}: frontmatter sin description`);
      assert.ok(fm.description.trim().length > 0, `${label}: description vacía`);
      assert.ok(fm.description.length <= 1024, `${label}: description >1024 chars`);
    }
  });

  test('el bundle de assets y core/ del repo tienen las mismas skills', () => {
    const repoSkills = join(__dirname, '..', '..', '..', 'core', 'skills');
    if (!existsSync(repoSkills)) return; // instalación npm: no hay repo root
    const listDirs = (d) => readdirSync(d, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name).sort();
    assert.deepEqual(
      listDirs(join(ASSETS, 'core', 'skills')), listDirs(repoSkills),
      'assets/core/skills desincronizado del repo — correr npm run build:assets',
    );
  });

  test('forge add: el SKILL.md instalado conserva el frontmatter YAML al inicio', (t) => {
    // forge add también ESCRIBE un SKILL.md (.claude/skills/<name>/). Según
    // agentskills.io el frontmatter debe abrir el archivo; el header de
    // provenance de forge va después del frontmatter, nunca antes.
    const dir = makeTmpDir(t);
    writeFixtureYaml(dir); // marca la raíz del proyecto para forge add
    const src = join(dir, 'src-skill');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'SKILL.md'), `---
name: demo-ext
description: Skill externa de prueba para la suite de conformidad.
---
# Skill: demo-ext

Contenido de prueba, sin hallazgos de seguridad.

Triggers: /demo-ext
`);
    const res = runForge(['add', './src-skill', '--yes'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr || res.stdout);

    const installed = readFileSync(join(dir, '.claude', 'skills', 'demo-ext', 'SKILL.md'), 'utf-8');
    assert.match(installed, /^---\r?\n/, 'el frontmatter YAML debe abrir el archivo instalado');
    const fm = parseFrontmatter(installed);
    assert.equal(fm.name, 'demo-ext', 'name del frontmatter debe sobrevivir la instalación');
    assert.equal(typeof fm.description, 'string', 'description del frontmatter debe sobrevivir la instalación');
    assert.ok(installed.includes('Origen externo (forge add)'), 'la provenance sigue presente tras el frontmatter');
  });

  // El bundle estático (validado arriba) no es lo único que hereda un consumidor:
  // la CLI también ENTREGA cuerpos de skill por stdout (forge session-start /
  // session-close, con y sin --json). Ese output es cuerpo markdown puro: el
  // frontmatter YAML es metadata del bundle y no debe filtrarse al consumidor.
  const SKILL_FM = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
  for (const cmd of ['session-start', 'session-close']) {
    test(`forge ${cmd} --json: body es el cuerpo del skill sin frontmatter`, () => {
      const res = runForge([cmd, '--json']);
      assert.equal(res.status, 0, res.stderr || res.stdout);

      const json = JSON.parse(res.stdout);
      assert.equal(json.id, cmd);
      assert.equal(typeof json.body, 'string', `${cmd}: body ausente`);
      assert.ok(!/^---\r?\n/.test(json.body), `${cmd}: body incluye frontmatter YAML`);
      assert.match(json.body, /^# Skill: /, `${cmd}: body debe empezar en el H1 del skill`);

      // Contrato exacto: body === SKILL.md del bundle menos su frontmatter.
      const raw = readFileSync(join(ASSETS, 'core', 'skills', cmd, 'SKILL.md'), 'utf-8');
      assert.equal(json.body, raw.replace(SKILL_FM, '').replace(/^(?:[ \t]*\r?\n)+/, ''));
    });

    test(`forge ${cmd}: la salida de terminal no filtra el frontmatter`, () => {
      const res = runForge([cmd]);
      assert.equal(res.status, 0, res.stderr || res.stdout);
      // eslint-disable-next-line no-control-regex
      const plain = res.stdout.replace(/\x1b\[[0-9;]*m/g, '');
      assert.ok(!new RegExp(`^name: ${cmd}$`, 'm').test(plain), `${cmd}: imprime el name del frontmatter`);
      assert.ok(!/^description: /m.test(plain), `${cmd}: imprime la description del frontmatter`);
      assert.match(plain, /^# Skill: /m, `${cmd}: no imprime el cuerpo del skill`);
    });
  }
});

// ── Config MCP (modelo exportado) ────────────────────────────────────────────

describe('SPEC-083 P1 — config MCP', () => {
  test('los mcpServers del modelo exportado tienen el shape estable {name, autoApprove?}', (t) => {
    const dir = makeTmpDir(t);
    writeFixtureYaml(dir);
    const res = runForge(['export', '--json'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr);

    const model = JSON.parse(res.stdout);
    assert.ok(Array.isArray(model.mcpServers), 'mcpServers debe ser lista');
    assert.equal(model.mcpServers.length, 1);
    for (const server of model.mcpServers) {
      assert.equal(typeof server.name, 'string', 'mcpServers[].name debe ser string');
      assert.ok(server.name.length > 0, 'mcpServers[].name vacío');
      if (server.autoApprove !== undefined) {
        assert.ok(Array.isArray(server.autoApprove), 'autoApprove debe ser lista');
        for (const a of server.autoApprove) assert.equal(typeof a, 'string');
      }
    }
  });
});

// ── Cobertura: los 4 nativos generan su superficie primaria sin errores ──────

describe('SPEC-083 P1 — generate cubre los 4 runtimes nativos', () => {
  test('cada runtime nativo genera su superficie primaria con exit 0', (t) => {
    const primary = {
      'claude-code': 'CLAUDE.md',
      'opencode': 'AGENTS.md',
      'codex': 'AGENTS.md',
      'kiro': join('.kiro', 'steering', 'product.md'),
    };
    for (const runtime of NATIVE_RUNTIMES) {
      const dir = makeTmpDir(t);
      writeFixtureYaml(dir);
      const res = runForge(['generate', '--runtime', runtime, '--force'], { cwd: dir });
      assert.equal(res.status, 0, `${runtime}: ${res.stderr || res.stdout}`);
      assert.ok(existsSync(join(dir, primary[runtime])), `${runtime}: falta ${primary[runtime]}`);
    }
  });
});
