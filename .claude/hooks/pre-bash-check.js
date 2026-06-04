#!/usr/bin/env node
/**
 * forge — PreToolUse hook: pre-bash-check.js
 * Blocks destructive commands in production context. Zero Python dependency.
 *
 * Context: on 2026-04-28, --force-reset was accidentally executed against
 * production DB, deleting 225 users and 35 forms. This hook prevents recurrence.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEBUG = !['', '0', 'false', 'False'].includes(process.env.DEBUG || '');
const dbg = msg => DEBUG && process.stdout.write(`[forge-hook-debug] ${msg}\n`);

// ---------------------------------------------------------------------------
// Load project.yaml (minimal YAML parser for flat key: value)
// ---------------------------------------------------------------------------
function loadProjectYaml() {
  try {
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, 'project.yaml');
      if (fs.existsSync(candidate)) {
        const text = fs.readFileSync(candidate, 'utf8');
        return parseYamlMinimal(text);
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (e) { dbg(`project.yaml load error: ${e}`); }
  return {};
}

function parseYamlMinimal(text) {
  // Minimal parser: handles nested sections and key: value pairs
  const result = {};
  let currentSection = null;
  let currentSubSection = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim();
    if (indent === 0) { currentSection = key; currentSubSection = null; if (val) result[key] = val; else result[key] = {}; }
    else if (indent === 2 && currentSection) { currentSubSection = key; if (!result[currentSection] || typeof result[currentSection] !== 'object') result[currentSection] = {}; if (val) result[currentSection][key] = val; else result[currentSection][key] = {}; }
    else if (indent === 4 && currentSection && currentSubSection) { if (!result[currentSection][currentSubSection] || typeof result[currentSection][currentSubSection] !== 'object') result[currentSection][currentSubSection] = {}; if (val) result[currentSection][currentSubSection][key] = val; }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Dangerous patterns
// ---------------------------------------------------------------------------
const DANGEROUS = [
  [/--force-reset/,                             '--force-reset'],
  [/prisma\s+migrate\s+reset/i,                'prisma migrate reset'],
  [/DROP\s+TABLE/i,                            'DROP TABLE'],
  [/TRUNCATE\s+/i,                             'TRUNCATE'],
  [/DELETE\s+FROM\s+\w+\s*;/i,                'DELETE FROM sin WHERE'],
  [/DROP\s+DATABASE/i,                         'DROP DATABASE'],
  [/dropdb\s+/,                                'dropdb'],
  [/rm\s+-rf\s+\//,                            'rm -rf /'],
  [/git\s+push\s+--force(?!\s+--with-lease)/,  'git push --force sin --with-lease'],
];

function matchDangerous(command) {
  for (const [re, label] of DANGEROUS) {
    if (re.test(command)) return label;
  }
  return null;
}

function matchForbidden(command, project) {
  try {
    const forbidden = (project.rules || {}).forbidden_in_production;
    if (!Array.isArray(forbidden)) return null;
    for (const pattern of forbidden) {
      if (new RegExp(pattern).test(command)) return pattern;
    }
  } catch (e) { dbg(`forbidden_in_production error: ${e}`); }
  return null;
}

function isProductionContext(command, project) {
  const deploy = project.deploy || {};
  const prodUrl = deploy.production_url || '';
  const projectId = deploy.project_id || '';
  if (prodUrl && command.includes(prodUrl)) { dbg(`prod context: URL match`); return true; }
  if (projectId && command.includes(projectId)) { dbg(`prod context: project_id match`); return true; }
  for (const key of Object.keys(process.env)) {
    if (/^(PROD_|PRODUCTION_|PROD$|PRODUCTION$)/i.test(key) && process.env[key]) { dbg(`prod context: env ${key}`); return true; }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  if (!raw.trim()) { dbg('empty stdin'); process.exit(0); }
  let data;
  try { data = JSON.parse(raw); } catch (e) { dbg(`parse error: ${e}`); process.exit(0); }

  const toolName = data.tool_name || '';
  if (toolName !== 'Bash') process.exit(0);

  const command = (data.tool_input || {}).command || '';
  if (!command) process.exit(0);
  dbg(`command: ${command.slice(0, 200)}`);

  const project = loadProjectYaml();
  const label = matchDangerous(command) || matchForbidden(command, project);
  if (!label) process.exit(0);

  const snippet = command.slice(0, 120) + (command.length > 120 ? '...' : '');
  const inProd = isProductionContext(command, project);

  if (inProd) {
    process.stdout.write(
      `forge: BLOQUEADO — comando destructivo detectado en contexto de producción.\n\n` +
      `  Comando: ${snippet}\n  Patrón: ${label}\n\n` +
      `  Ejecutá esto MANUALMENTE con plena consciencia de que afecta producción.\n\n` +
      `  Lección del 2026-04-28: --force-reset borró 225 usuarios en producción.\n`
    );
    process.exit(2);
  } else {
    process.stdout.write(
      `forge: ADVERTENCIA — comando potencialmente destructivo.\n\n` +
      `  Comando: ${snippet}\n  Patrón: ${label}\n\n` +
      `  Si apunta a producción, cancelá y ejecutá manualmente.\n`
    );
    process.exit(0);
  }
});
