#!/usr/bin/env node
/**
 * Forge v2 — Stop hook: post-turn-check.js (cross-platform, Node).
 *
 * Runs after each Claude turn. Detects modified files (git) and runs a light
 * type/syntax check per language. Always exits 0 (never blocks).
 *
 * This is the cross-platform replacement for post-turn-check.sh: it runs on
 * Windows/PowerShell, macOS and Linux with only `node` (no bash, no python).
 * Behaviour matches the .sh version: TypeScript → tsc --noEmit, PHP → composer
 * validate, Python → py_compile, Ruby → ruby -c. A `scripts.check` command in
 * project.yaml overrides the auto-detection.
 */
'use strict';

const { spawnSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');

/** Run a command, capture combined output (best-effort, never throws). */
function run(cmd, args, opts = {}) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false, ...opts });
    return ((r.stdout || '') + (r.stderr || '')).trim();
  } catch {
    return '';
  }
}

/** True if `cmd` resolves on PATH (cross-platform: `where` on win32, `which` elsewhere). */
function hasCommand(cmd) {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  try {
    const r = spawnSync(locator, [cmd], { encoding: 'utf8' });
    return r.status === 0;
  } catch {
    return false;
  }
}

function head(text, n) {
  return text.split(/\r?\n/).slice(0, n).join('\n');
}

// ── Step 1 — find modified files ───────────────────────────────────────────
const modified = run('git', ['diff', '--name-only', 'HEAD']);
const staged = run('git', ['diff', '--name-only', '--cached']);
const allChanged = (modified + '\n' + staged)
  .split(/\r?\n/)
  .map(s => s.trim())
  .filter(Boolean);

if (allChanged.length === 0) process.exit(0);

const filesMatching = (re) => allChanged.filter(f => re.test(f));

// ── Step 2 — read project config (minimal YAML scan, no deps) ──────────────
let customCheck = '';
if (existsSync('project.yaml')) {
  try {
    const yaml = readFileSync('project.yaml', 'utf8');
    // Match a nested `scripts:` block then a `check:` entry under it.
    const scriptsBlock = yaml.match(/^scripts:\s*$([\s\S]*?)(?=^\S|\Z)/m);
    if (scriptsBlock) {
      const m = scriptsBlock[1].match(/^\s+check:\s*["']?(.+?)["']?\s*$/m);
      if (m) customCheck = m[1].trim();
    }
  } catch { /* ignore */ }
}

// ── Step 3 — run checks ────────────────────────────────────────────────────
const out = [];

if (customCheck) {
  // Run the user-defined check through the platform shell.
  const shell = process.platform === 'win32';
  const res = run(customCheck, [], { shell });
  if (res) out.push(head(res, 20));
} else {
  // TypeScript / JavaScript
  if (filesMatching(/\.(ts|tsx)$/).length > 0) {
    let tsc = '';
    if (existsSync('turbo.json') && hasCommand('pnpm')) {
      tsc = head(run('pnpm', ['turbo', 'typecheck']) || run('pnpm', ['tsc', '--noEmit']), 20);
    } else if (hasCommand('pnpm')) {
      tsc = head(run('pnpm', ['tsc', '--noEmit']), 20);
    } else if (hasCommand('npx')) {
      tsc = head(run('npx', ['tsc', '--noEmit']), 20);
    }
    if (tsc) out.push('[tsc] ' + tsc);
  }

  // PHP
  if (filesMatching(/\.php$/).length > 0 && existsSync('composer.json') && hasCommand('composer')) {
    const php = head(run('composer', ['validate', '--no-check-publish']), 10);
    if (php) out.push('[composer] ' + php);
  }

  // Python
  const pyFiles = filesMatching(/\.py$/).filter(existsSync);
  if (pyFiles.length > 0 && hasCommand('python3')) {
    const lines = [];
    for (const f of pyFiles) {
      const r = run('python3', ['-m', 'py_compile', f]);
      if (r) lines.push(`${f}: ${r}`);
    }
    if (lines.length) out.push('[python] ' + lines.join('\n'));
  }

  // Ruby
  const rbFiles = filesMatching(/\.rb$/).filter(existsSync);
  if (rbFiles.length > 0 && existsSync('Gemfile') && hasCommand('bundle')) {
    const lines = [];
    for (const f of rbFiles) {
      const r = head(run('bundle', ['exec', 'ruby', '-c', f]), 10);
      if (r) lines.push(`${f}: ${r}`);
    }
    if (lines.length) out.push('[ruby] ' + lines.join('\n'));
  }
}

// ── Step 4 — report ────────────────────────────────────────────────────────
const report = out.filter(Boolean).join('\n');
if (report) {
  console.log('-- Forge post-turn check --------------------');
  console.log(report);
  console.log('---------------------------------------------');
}

process.exit(0);
