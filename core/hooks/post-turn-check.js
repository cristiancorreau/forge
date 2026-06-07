#!/usr/bin/env node
/**
 * forge — Stop hook: post-turn-check.js
 *
 * Runs after each agent turn. Detects modified files and runs type/syntax
 * checks on them. Pure JS with zero Python dependency: the YAML parsing the
 * shell version delegated to python3 is done in-process here. Language checkers
 * (tsc, composer, ruby -c, and python's py_compile for .py files) are still
 * invoked when files of that language changed — those are project toolchains,
 * not a forge dependency. Always exits 0 (never blocks).
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

function run(cmd, n) {
  let out;
  try { out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  return out.split('\n').filter((_, i) => i < n).join('\n').trim();
}

function has(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore', shell: '/bin/sh' }); return true; }
  catch { return false; }
}

// Minimal YAML reader (2/4-space indent), enough for scripts.check.
function parseYamlMinimal(text) {
  const result = {};
  let section = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    let val = trimmed.slice(colon + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (indent === 0) { section = key; result[key] = val || {}; }
    else if (indent === 2 && section) {
      if (typeof result[section] !== 'object' || result[section] === null) result[section] = {};
      result[section][key] = val;
    }
  }
  return result;
}

// Step 1 — changed files (modified + staged).
const modified = sh('git diff --name-only HEAD');
const staged = sh('git diff --name-only --cached');
const changed = [...new Set((modified + '\n' + staged).split('\n').map(s => s.trim()).filter(Boolean))];
if (changed.length === 0) process.exit(0);

// Step 2 — project config.
let customCheck = '';
if (fs.existsSync('project.yaml')) {
  try {
    const data = parseYamlMinimal(fs.readFileSync('project.yaml', 'utf8'));
    if (data.scripts && typeof data.scripts === 'object' && data.scripts.check) customCheck = String(data.scripts.check);
  } catch { /* ignore */ }
}

const matching = (re) => changed.filter(f => re.test(f));
const parts = [];

// Step 3 — run checks.
if (customCheck) {
  const out = run(customCheck, 20);
  if (out) parts.push(out);
} else {
  // TypeScript / JavaScript
  if (matching(/\.(ts|tsx)$/).length) {
    let out = '';
    if (fs.existsSync('turbo.json') && has('pnpm')) out = run('pnpm turbo typecheck', 20) || run('pnpm tsc --noEmit', 20);
    else if (has('pnpm')) out = run('pnpm tsc --noEmit', 20);
    else if (has('npx')) out = run('npx tsc --noEmit', 20);
    if (out) parts.push('[tsc] ' + out);
  }

  // PHP
  if (matching(/\.php$/).length && fs.existsSync('composer.json') && has('composer')) {
    const out = run('composer validate --no-check-publish', 10);
    if (out) parts.push('[composer] ' + out);
  }

  // Python (project toolchain — only invoked when .py files changed)
  const pyFiles = matching(/\.py$/).filter(f => fs.existsSync(f));
  if (pyFiles.length && has('python3')) {
    const lines = [];
    for (const f of pyFiles) {
      const res = run(`python3 -m py_compile ${JSON.stringify(f)}`, 20);
      if (res) lines.push(`${f}: ${res}`);
    }
    if (lines.length) parts.push('[python] ' + lines.join('\n'));
  }

  // Ruby
  const rbFiles = matching(/\.rb$/).filter(f => fs.existsSync(f));
  if (rbFiles.length && fs.existsSync('Gemfile') && has('bundle')) {
    const lines = [];
    for (const f of rbFiles) {
      const res = run(`bundle exec ruby -c ${JSON.stringify(f)}`, 10);
      if (res) lines.push(`${f}: ${res}`);
    }
    if (lines.length) parts.push('[ruby] ' + lines.join('\n'));
  }
}

// Step 4 — report.
if (parts.length) {
  process.stdout.write('── Forge post-turn check ─────────────────\n');
  process.stdout.write(parts.join('\n') + '\n');
  process.stdout.write('──────────────────────────────────────────\n');
}

process.exit(0);
