#!/usr/bin/env node
/**
 * forge — SessionStart hook: session-start.js
 *
 * Deterministic environment checks at the start of a session, in pure JS with
 * zero Python dependency (the YAML parsing the shell version delegated to
 * python3 is done in-process here). Checks: git available, branch is not
 * main/master, uncommitted changes, project.yaml present with project.name /
 * project.mode, and production env vars when the project declares a deploy.
 *
 * Exits 2 only when a critical tool (git) is missing; otherwise exits 0.
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

// Minimal YAML reader for the flat/nested subset forge writes (2/4-space indent).
function parseYamlMinimal(text) {
  const result = {};
  let section = null;
  let subSection = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const val = trimmed.slice(colon + 1).trim();
    if (indent === 0) { section = key; subSection = null; result[key] = val || {}; }
    else if (indent === 2 && section) {
      subSection = key;
      if (typeof result[section] !== 'object' || result[section] === null) result[section] = {};
      result[section][key] = val || {};
    } else if (indent === 4 && section && subSection) {
      if (typeof result[section][subSection] !== 'object' || result[section][subSection] === null) result[section][subSection] = {};
      if (val) result[section][subSection][key] = val;
    }
  }
  return result;
}

function findProjectYaml() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'project.yaml');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const warnLines = [];
const labels = [];

// Check 1 — git available (critical).
if (sh('git --version') === null) {
  process.stdout.write('forge session: ERROR — herramientas críticas faltantes:\n');
  process.stdout.write('  error: git no está instalado o no está en PATH\n');
  process.exit(2);
}

// Check 2 — branch is not main/master.
const branch = sh('git branch --show-current') || '';
if (branch === 'main' || branch === 'master') {
  warnLines.push(`branch '${branch}' — considera trabajar en una feature branch`);
  labels.push(`[branch ${branch}]`);
}

// Check 3 — uncommitted changes.
const status = sh('git status --short') || '';
if (status) {
  warnLines.push('cambios sin commitear en el worktree');
  labels.push('[cambios sin commitear]');
}

// Check 4 — project.yaml present.
const yamlPath = findProjectYaml();
if (!yamlPath) {
  warnLines.push('project.yaml no encontrado — ejecutar forge init');
  labels.push('[sin project.yaml]');
} else {
  let data = {};
  try { data = parseYamlMinimal(fs.readFileSync(yamlPath, 'utf8')); } catch { /* ignore */ }
  const project = (data && typeof data.project === 'object') ? data.project : {};

  // Check 5 — required project fields.
  const missing = [];
  if (!project.name) missing.push('project.name');
  if (!project.mode) missing.push('project.mode');
  if (missing.length) warnLines.push(`project.yaml faltan campos: ${missing.join(',')}`);

  // Check 6 — production env vars when a deploy is declared.
  if (data.deploy) {
    const prodVars = Object.keys(process.env).filter(k => /^(PROD_|PRODUCTION_|PROD$|PRODUCTION$)/.test(k));
    if (prodVars.length) {
      warnLines.push(`variables de producción activas en sesión: ${prodVars.join(', ')} — verificar que es intencional`);
    }
  }
}

if (warnLines.length === 0) {
  process.exit(0); // silent — all OK
}

process.stdout.write(`forge session: ${warnLines.length} advertencia(s) — ${labels.join(' ')}\n`);
for (const w of warnLines) process.stdout.write('  warn: ' + w + '\n');
process.exit(0);
