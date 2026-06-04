#!/usr/bin/env node
/**
 * Forge v2 — SessionStart hook: session-start.js (cross-platform, Node).
 *
 * Verifies the environment at the start of a session: git present, branch is not
 * main/master, no uncommitted changes, project.yaml exists with name+mode, and
 * production env vars are not leaking into a local session. Warnings only (exit 0)
 * unless a critical tool (git) is missing (exit 2).
 *
 * Cross-platform replacement for session-start.sh: runs on Windows/PowerShell,
 * macOS and Linux with only `node` (no bash, no python). YAML is scanned with a
 * minimal regex (no dependency) — enough for project.name / project.mode / deploy.
 */
'use strict';

const { spawnSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { join, dirname } = require('path');

function run(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    return { status: r.status, out: (r.stdout || '').trim() };
  } catch {
    return { status: 1, out: '' };
  }
}

function hasCommand(cmd) {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  try {
    return spawnSync(locator, [cmd], { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
}

let checksTotal = 0;
let checksPassed = 0;
let hasError = false;
const lines = [];

function check(result) {
  checksTotal++;
  if (result === 'ok') {
    checksPassed++;
  } else if (result.startsWith('error:')) {
    hasError = true;
    lines.push('  error: ' + result.slice('error:'.length).trim());
  } else {
    lines.push('  warn: ' + result.replace(/^warn:\s*/, '').trim());
  }
}

// ── Check 1 — git available (critical) ─────────────────────────────────────
if (!hasCommand('git')) {
  check('error: git no está instalado o no está en PATH');
} else {
  check('ok');
}

if (hasError) {
  process.stdout.write('forge session: ERROR — herramientas críticas faltantes:\n');
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(2);
}

// ── Check 2 — branch is not main/master ────────────────────────────────────
const branch = run('git', ['branch', '--show-current']).out;
if (branch === 'main' || branch === 'master') {
  check(`warn: branch '${branch}' — considera trabajar en una feature branch`);
} else {
  check('ok');
}

// ── Check 3 — uncommitted changes ──────────────────────────────────────────
const gitStatus = run('git', ['status', '--short']).out;
if (gitStatus) {
  check('warn: cambios sin commitear en el worktree');
} else {
  check('ok');
}

// ── Check 4/5/6 — project.yaml exists, has fields, prod-env ────────────────
let projectYamlPath = '';
let searchDir = process.cwd();
for (let i = 0; i < 6; i++) {
  const candidate = join(searchDir, 'project.yaml');
  if (existsSync(candidate)) { projectYamlPath = candidate; break; }
  const parent = dirname(searchDir);
  if (parent === searchDir) break;
  searchDir = parent;
}

if (!projectYamlPath) {
  check('warn: project.yaml no encontrado — ejecutar forge init');
} else {
  check('ok');
  let yaml = '';
  try { yaml = readFileSync(projectYamlPath, 'utf8'); } catch { yaml = ''; }

  // Minimal scan for project.name / project.mode under the `project:` block.
  const projectBlock = yaml.match(/^project:\s*$([\s\S]*?)(?=^\S|\Z)/m);
  const block = projectBlock ? projectBlock[1] : '';
  const hasName = /^\s+name:\s*\S/m.test(block);
  const hasMode = /^\s+mode:\s*\S/m.test(block);
  const missing = [];
  if (!hasName) missing.push('project.name');
  if (!hasMode) missing.push('project.mode');
  if (missing.length === 0) {
    check('ok');
  } else {
    check('warn: project.yaml faltan campos: ' + missing.join(','));
  }

  // Prod-env leakage only matters when a deploy is configured.
  const hasDeploy = /^deploy:\s*$/m.test(yaml) || /^deploy:\s+\S/m.test(yaml);
  if (hasDeploy) {
    const prodVars = Object.keys(process.env).filter(k =>
      /^(PROD_|PRODUCTION_|PROD$|PRODUCTION$)/.test(k));
    if (prodVars.length) {
      check('warn: variables de producción activas en sesión: ' + prodVars.join(', ') + ' — verificar que es intencional');
    } else {
      check('ok');
    }
  } else {
    check('ok');
  }
}

// ── Output ─────────────────────────────────────────────────────────────────
const warnings = checksTotal - checksPassed;
if (warnings === 0) process.exit(0);

const labels = [];
if (branch === 'main' || branch === 'master') labels.push(`[branch ${branch}]`);
if (gitStatus) labels.push('[cambios sin commitear]');
if (!projectYamlPath) labels.push('[sin project.yaml]');

process.stdout.write(`forge session: ${warnings} advertencia(s) — ${labels.join(' ')}\n`);
process.stdout.write(lines.join('\n') + '\n');
process.exit(0);
