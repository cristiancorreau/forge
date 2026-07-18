// Tests for lib/unit-registry.ts (SPEC-063) — registro declarativo de capacidades.
// Pure, offline, deterministic. Build first: npm run build:all.
//
//     node --test test/unit-registry.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const ASSETS = join(__dirname, '..', 'assets');

let R; // unit-registry module

before(async () => {
  assert.ok(
    existsSync(join(DIST, 'lib', 'unit-registry.js')),
    'dist not built — run npm run build:all',
  );
  R = await import(pathToFileURL(join(DIST, 'lib', 'unit-registry.js')).href);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const AGENT_TOOLS = {
  orchestrator: 'Read, Grep, Glob, Bash, Edit, Write, Agent, WebFetch',
  'backend-engineer': 'Read, Grep, Glob, Bash, Edit, Write',
};

function agentMd(name, tools) {
  return `---
name: ${name}
description: ${name} de prueba.
model: sonnet
tools: ${tools}
tier: 1
---

# ${name}
`;
}

/** Construye un forge root sintetico con agentes/skills y un units.yaml. */
function makeForgeRoot(agents, skills, yamlBody) {
  const root = mkdtempSync(join(tmpdir(), 'forge-units-'));
  const agentsDir = join(root, 'core', 'agents');
  const skillsDir = join(root, 'core', 'skills');
  const regDir = join(root, 'core', 'registry');
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(regDir, { recursive: true });

  for (const [name, tools] of Object.entries(agents)) {
    writeFileSync(join(agentsDir, `${name}.md`), agentMd(name, tools));
  }
  for (const name of skills) {
    mkdirSync(join(skillsDir, name), { recursive: true });
    writeFileSync(join(skillsDir, name, 'SKILL.md'), `# Skill: ${name}\n`);
  }
  writeFileSync(join(regDir, 'units.yaml'), yamlBody);
  return root;
}

const BASE_YAML = `agents:
  - name: orchestrator
    scope: /
    tools: [Read, Grep, Glob, Bash, Edit, Write, Agent, WebFetch]
    outputs: [plan]
  - name: backend-engineer
    scope: /
    tools: [Read, Grep, Glob, Bash, Edit, Write]
    outputs: [endpoints]
skills:
  - name: spec
    scope: /
    tools: []
    outputs: [spec]
`;

// ── Real registry (assets/core/registry/units.yaml) ───────────────────────────

describe('SPEC-063 registro real', () => {
  test('loadUnits carga el registro core publicado en assets', () => {
    const unitsPath = join(ASSETS, 'core', 'registry', 'units.yaml');
    assert.ok(existsSync(unitsPath), 'assets/core/registry/units.yaml falta — build:assets no lo copió');
    const units = R.loadUnits(unitsPath);
    assert.ok(units.agents.length >= 7, 'el registro debe cubrir los agentes core');
    assert.ok(units.skills.length >= 1, 'el registro debe cubrir skills core');
  });

  test('parity OK del registro real contra assets/core', () => {
    const forgeRoot = join(ASSETS, '..'); // assets/ funciona como forge root
    const unitsPath = join(ASSETS, 'core', 'registry', 'units.yaml');
    const units = R.loadUnits(unitsPath);
    const parity = R.checkUnitParity(ASSETS, units);
    assert.equal(parity.ok, true, `parity falló: ${parity.errors.join('; ')}`);
    const contracts = R.checkToolContracts(ASSETS, units);
    assert.equal(contracts.ok, true, `contratos de tools fallaron: ${contracts.errors.join('; ')}`);
    void forgeRoot;
  });
});

// ── Synthetic forge root ───────────────────────────────────────────────────────

describe('SPEC-063 parity sintetica', () => {
  test('parity OK cuando registro y disco coinciden', () => {
    const root = makeForgeRoot(
      { orchestrator: AGENT_TOOLS.orchestrator, 'backend-engineer': AGENT_TOOLS['backend-engineer'] },
      ['spec'],
      BASE_YAML,
    );
    try {
      const units = R.loadUnits(join(root, 'core', 'registry', 'units.yaml'));
      const parity = R.checkUnitParity(root, units);
      assert.equal(parity.ok, true, parity.errors.join('; '));
      assert.deepEqual(parity.errors, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('parity FALLA si se agrega un agente en disco sin registrarlo', () => {
    const root = makeForgeRoot(
      {
        orchestrator: AGENT_TOOLS.orchestrator,
        'backend-engineer': AGENT_TOOLS['backend-engineer'],
        // Agente extra NO presente en BASE_YAML → debe romper parity.
        'rogue-agent': 'Read, Grep',
      },
      ['spec'],
      BASE_YAML,
    );
    try {
      const units = R.loadUnits(join(root, 'core', 'registry', 'units.yaml'));
      const parity = R.checkUnitParity(root, units);
      assert.equal(parity.ok, false, 'parity debió fallar por agente no registrado');
      assert.ok(
        parity.errors.some(e => e.includes('rogue-agent') && e.includes('ausente de units.yaml')),
        `error esperado no encontrado: ${parity.errors.join('; ')}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('parity FALLA si el registro lista un agente sin archivo en disco', () => {
    const yamlWithGhost = `agents:
  - name: orchestrator
    scope: /
    tools: [Read, Grep, Glob, Bash, Edit, Write, Agent, WebFetch]
    outputs: [plan]
  - name: backend-engineer
    scope: /
    tools: [Read, Grep, Glob, Bash, Edit, Write]
    outputs: [endpoints]
  - name: ghost-engineer
    scope: /
    tools: [Read]
    outputs: [nada]
skills:
  - name: spec
    scope: /
    tools: []
    outputs: [spec]
`;
    const root = makeForgeRoot(
      { orchestrator: AGENT_TOOLS.orchestrator, 'backend-engineer': AGENT_TOOLS['backend-engineer'] },
      ['spec'],
      yamlWithGhost,
    );
    try {
      const units = R.loadUnits(join(root, 'core', 'registry', 'units.yaml'));
      const parity = R.checkUnitParity(root, units);
      assert.equal(parity.ok, false, 'parity debió fallar por agente fantasma');
      assert.ok(
        parity.errors.some(e => e.includes('ghost-engineer') && e.includes('falta core/agents')),
        `error esperado no encontrado: ${parity.errors.join('; ')}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('checkToolContracts FALLA si el frontmatter usa un tool fuera del contrato', () => {
    // backend-engineer declara un tool extra (NotebookEdit) no permitido por el contrato.
    const root = makeForgeRoot(
      {
        orchestrator: AGENT_TOOLS.orchestrator,
        'backend-engineer': 'Read, Grep, Glob, Bash, Edit, Write, NotebookEdit',
      },
      ['spec'],
      BASE_YAML,
    );
    try {
      const units = R.loadUnits(join(root, 'core', 'registry', 'units.yaml'));
      const contracts = R.checkToolContracts(root, units);
      assert.equal(contracts.ok, false, 'el contrato de tools debió fallar');
      assert.ok(
        contracts.errors.some(e => e.includes('backend-engineer') && e.includes('NotebookEdit')),
        `error esperado no encontrado: ${contracts.errors.join('; ')}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('parseAgentTools parsea la lista separada por comas del frontmatter', () => {
    const tools = R.parseAgentTools(agentMd('x', 'Read, Grep, Glob'));
    assert.deepEqual(tools, ['Read', 'Grep', 'Glob']);
  });
});

// ── splitFrontmatter / stripFrontmatter (helper único del fence '---') ───────

describe('splitFrontmatter / stripFrontmatter', () => {
  const DOC = '---\nname: demo\ndescription: x\n---\n\n# Título\n\ncuerpo\n';

  test('splitFrontmatter separa fence y cuerpo', () => {
    const { frontmatter, body } = R.splitFrontmatter(DOC);
    assert.equal(frontmatter, '---\nname: demo\ndescription: x\n---\n');
    assert.equal(body, '\n# Título\n\ncuerpo\n');
    assert.equal(frontmatter + body, DOC, 'split debe ser sin pérdida');
  });

  test('splitFrontmatter sin fence devuelve el documento entero como body', () => {
    const md = '# Sin frontmatter\n';
    assert.deepEqual(R.splitFrontmatter(md), { frontmatter: '', body: md });
  });

  test('stripFrontmatter quita fence y blancos posteriores; tolera CRLF', () => {
    assert.equal(R.stripFrontmatter(DOC), '# Título\n\ncuerpo\n');
    assert.equal(
      R.stripFrontmatter('---\r\nname: demo\r\n---\r\n\r\n# T\r\n'),
      '# T\r\n',
    );
    assert.equal(R.stripFrontmatter('# Plano\n'), '# Plano\n');
  });

  test('parseFrontmatter y splitFrontmatter comparten el mismo contrato de fence', () => {
    const fm = R.parseFrontmatter(DOC);
    assert.equal(fm.name, 'demo');
    // Un documento que parseFrontmatter no reconoce tampoco debe dividirse.
    const noFence = 'texto\n---\nname: x\n---\n';
    assert.deepEqual(R.parseFrontmatter(noFence), {});
    assert.equal(R.splitFrontmatter(noFence).frontmatter, '');
  });
});
