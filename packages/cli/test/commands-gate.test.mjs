// Stack-gated slash commands: the laravel-* commands must only land in a project
// whose `laravel` profile is active — not in a non-Laravel project. Reported from
// the desktop GUI: a TypeScript project got laravel-*.md under .claude/commands/.
//
//   node --test test/commands-gate.test.mjs
//
// The CLI must be built first (npm run build:all).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

function initWith(yaml) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-cmd-'));
  writeFileSync(join(dir, 'project.yaml'), yaml);
  const r = spawnSync('node', [CLI, 'init', '--force'], { cwd: dir, encoding: 'utf8', env: { ...process.env, FORGE_NO_BUN: '1' } });
  assert.equal(r.status, 0, `init failed: ${r.stderr || r.stdout}`);
  return dir;
}

const cmds = (dir) => readdirSync(join(dir, '.claude', 'commands')).filter(f => f.endsWith('.md'));

const NEXTJS = `project: {name: T, slug: t, language: typescript, mode: standard, status: active}
stack: {frontend: nextjs}
agents: {active: [orchestrator, backend-engineer], compliance: [], profiles: [nextjs-admin]}
runtimes: {active: [claude-code]}
`;
const LARAVEL = `project: {name: T, slug: t, language: php, mode: standard, status: active}
stack: {backend: laravel}
agents: {active: [orchestrator, backend-engineer], compliance: [], profiles: [laravel]}
runtimes: {active: [claude-code]}
`;

describe('slash commands are stack-gated by profile', () => {
  test('a non-Laravel project gets NO laravel-* commands (but keeps the universal ones)', () => {
    const dir = initWith(NEXTJS);
    try {
      const list = cmds(dir);
      assert.equal(list.filter(f => f.startsWith('laravel-')).length, 0, `no laravel commands; got: ${list.join(', ')}`);
      assert.ok(list.includes('plan.md'), 'universal SDD commands still installed');
      assert.ok(list.includes('new-feature.md'));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a Laravel project DOES get the laravel-* commands', () => {
    const dir = initWith(LARAVEL);
    try {
      const list = cmds(dir);
      assert.ok(list.includes('laravel-eloquent.md'), `laravel commands installed; got: ${list.join(', ')}`);
      assert.equal(list.filter(f => f.startsWith('laravel-')).length, 5, 'all 5 laravel commands present');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('reconfiguring Laravel → non-Laravel prunes the orphan laravel-* commands', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-cmd-'));
    try {
      writeFileSync(join(dir, 'project.yaml'), LARAVEL);
      spawnSync('node', [CLI, 'init', '--force'], { cwd: dir, encoding: 'utf8', env: { ...process.env, FORGE_NO_BUN: '1' } });
      assert.ok(cmds(dir).some(f => f.startsWith('laravel-')), 'laravel commands installed first');
      writeFileSync(join(dir, 'project.yaml'), NEXTJS);
      spawnSync('node', [CLI, 'init', '--force'], { cwd: dir, encoding: 'utf8', env: { ...process.env, FORGE_NO_BUN: '1' } });
      assert.equal(cmds(dir).filter(f => f.startsWith('laravel-')).length, 0, 'laravel commands pruned on reconfigure');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
