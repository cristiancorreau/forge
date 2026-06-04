// Regression test for the "## Agentes y su scope" table in CLAUDE.md.
//
// Bug (SPEC-030): generateClaudeMd built the agent table only from
// agents.active + agents.compliance and IGNORED agents.specialized (Tier 3).
// For a project whose team is entirely Tier 3 (like the forge repo itself:
// 7 forge-* agents in agents.specialized, active empty) the regenerated
// CLAUDE.md had NO agent table at all.
//
// This suite imports the compiled generator directly (a pure function) and
// asserts on its output. Build first with `npm run build:all`.
//
//     node --test test/claude-md-specialized.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { generateClaudeMd } = await import(
  join(__dirname, '..', 'dist', 'lib', 'generators', 'claude-code.js')
);

describe('generateClaudeMd — Tier 3 specialized agents', () => {
  test('renders specialized agents in the table when active is empty', () => {
    const md = generateClaudeMd({
      project: { name: 'forge', mode: 'enterprise' },
      agents: {
        active: [],
        compliance: [],
        specialized: ['forge-cli-engineer', 'forge-quality-reviewer'],
      },
    });

    assert.match(md, /## Agentes y su scope/, 'table section must be present');
    assert.match(md, /\| Agente \| Scope \| Cuándo usarlo \|/);
    // Each specialized agent is a row in the table.
    assert.match(md, /\| `forge-cli-engineer` \|/);
    assert.match(md, /\| `forge-quality-reviewer` \|/);
    // Fallback trigger points the reader to the agent's own file.
    assert.match(md, /ver `\.claude\/agents\/forge-cli-engineer\.md`/);
    // Fallback scope is `/` when no per-agent scope is configured.
    assert.match(md, /\| `forge-cli-engineer` \| `\/` \|/);
  });

  test('uses agents.scope for a specialized agent when configured', () => {
    const md = generateClaudeMd({
      project: { name: 'forge', mode: 'enterprise' },
      agents: {
        specialized: ['forge-cli-engineer'],
        scope: { 'forge-cli-engineer': 'packages/cli/src' },
      },
    });
    assert.match(md, /\| `forge-cli-engineer` \| `packages\/cli\/src` \|/);
  });

  test('still renders active and compliance agents unchanged', () => {
    const md = generateClaudeMd({
      project: { name: 'demo', mode: 'standard' },
      agents: {
        active: ['backend-engineer'],
        compliance: [],
        specialized: ['forge-cli-engineer'],
      },
      paths: { api: 'src/api' },
    });
    // active agent keeps its hardcoded trigger + path-derived scope.
    assert.match(md, /\| `backend-engineer` \| `src\/api` \| endpoints, middleware/);
    // and the specialized agent is appended.
    assert.match(md, /\| `forge-cli-engineer` \|/);
  });

  test('omits the table when active, compliance and specialized are all empty', () => {
    const md = generateClaudeMd({
      project: { name: 'empty', mode: 'startup' },
      agents: { active: [], compliance: [], specialized: [] },
    });
    assert.doesNotMatch(md, /## Agentes y su scope/);
  });
});
