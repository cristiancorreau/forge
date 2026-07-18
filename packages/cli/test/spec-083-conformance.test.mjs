// SPEC-083 P1 — suite de conformidad de salida estándar.
//
// Garantiza que todo lo que forge genera es 100% conforme a los estándares que
// un orquestador externo (mingako) hereda sin integración:
//   - AGENTS.md (agents.md / Linux Foundation): markdown plano, sin frontmatter,
//     un solo H1, fences balanceados, tablas bien formadas. Forge emite un único
//     AGENTS.md en la raíz (la precedencia anidada queda en manos del estándar:
//     el más cercano al código gana; forge no genera AGENTS.md anidados).
//   - Skills (agentskills.io): SKILL.md con frontmatter YAML, `name` kebab-case
//     (<=64 chars) igual al directorio, `description` no vacía (<=1024 chars).
//   - Agentes `.claude/agents/*.md`: frontmatter YAML parseable con name,
//     description y tools; model presente; skills/mcpServers tipados cuando existen.
//   - Config JSON generada (settings.json, hooks de Kiro, mcpServers del export):
//     parseable y con el shape que esperan los runtimes.
//
// Corre la CLI compilada (dist/cli.js) en directorios temporales, como
// spec-083-json-contract.test.mjs. Requiere build previo (npm run build:all).
//
//     node --test test/spec-083-conformance.test.mjs

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync,
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

    test(`generate --runtime ${runtime}: un único AGENTS.md en la raíz (sin anidados)`, (t) => {
      // Forge no emite AGENTS.md anidados: la precedencia anidada del estándar
      // (el archivo más cercano al código gana) queda intacta para el usuario.
      const dir = makeTmpDir(t);
      writeFixtureYaml(dir);
      const res = runForge(['generate', '--runtime', runtime, '--force'], { cwd: dir });
      assert.equal(res.status, 0, res.stderr || res.stdout);

      const found = [];
      const walk = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const full = join(d, e.name);
          if (e.isDirectory()) walk(full);
          else if (e.name === 'AGENTS.md') found.push(full);
        }
      };
      walk(dir);
      assert.deepEqual(found, [join(dir, 'AGENTS.md')], `${runtime}: AGENTS.md solo en la raíz`);
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
