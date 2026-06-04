#!/usr/bin/env node
/**
 * forge — PreToolUse hook: pre-edit-check.js
 * Branch guard, debug detection, hardcoded secret detection. Zero Python dependency.
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEBUG = !['', '0', 'false', 'False'].includes(process.env.DEBUG || '');
const dbg = msg => DEBUG && process.stdout.write(`[forge-hook-debug] ${msg}\n`);

// ---------------------------------------------------------------------------
// project.yaml — minimal loader (no YAML dependency, mirrors pre-bash-check.js)
// Only needs `mode` and `rules.require_spec_before_implementation`, both of
// which are flat or one-level-nested scalars.
// ---------------------------------------------------------------------------
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'project.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function loadProjectYaml() {
  try {
    let dir = process.cwd();
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, 'project.yaml');
      if (fs.existsSync(candidate)) {
        return { text: fs.readFileSync(candidate, 'utf8'), root: dir };
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (e) { dbg(`project.yaml load error: ${e}`); }
  return { text: '', root: findRepoRoot(process.cwd()) };
}

// Match either a top-level `mode: enterprise` or a nested `project.mode`.
function isEnterpriseMode(text) {
  return /^\s*mode\s*:\s*["']?enterprise["']?/m.test(text || '');
}

// The hard gate is opt-in: only escalates to a block when the project
// explicitly enables `rules.require_spec_before_implementation`.
function specGateRequired(text) {
  return /require_spec_before_implementation\s*:\s*(true|yes|on)\b/i.test(text || '');
}

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------
const CODE_EXTS = new Set(['.py','.ts','.js','.tsx','.jsx','.php','.rb','.go','.rs','.java','.cs','.cpp','.c','.sh']);
const NON_CODE_EXTS = new Set(['.md','.yaml','.yml','.json','.toml','.txt','.lock']);
const ROOT_PROTECTED = new Set(['README.md','CLAUDE.md','CHANGELOG.md','AGENTS.md']);
const PROTECTED_DIRS = ['docs/', '.claude/'];

function isCodeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (CODE_EXTS.has(ext)) return true;
  if (NON_CODE_EXTS.has(ext)) return false;
  return false;
}

function isExemptFromBranchGuard(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  for (const d of PROTECTED_DIRS) {
    if (norm.startsWith(d) || norm.includes(`/${d.replace(/\/$/, '')}`)) return true;
  }
  const base = path.basename(norm);
  if (ROOT_PROTECTED.has(base)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Branch guard
// ---------------------------------------------------------------------------
function getCurrentBranch() {
  try {
    return execSync('git branch --show-current', { encoding: 'utf8', timeout: 3000 }).trim();
  } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Debug detection patterns per language
// ---------------------------------------------------------------------------
const DEBUG_PATTERNS = [
  { re: /\bconsole\.(log|debug|warn|error|trace)\s*\(/, lang: 'TypeScript/JavaScript' },
  { re: /\bprint\s*\(/, lang: 'Python' },
  { re: /\bdd\s*\(/, lang: 'PHP (dd)' },
  { re: /\bvar_dump\s*\(/, lang: 'PHP (var_dump)' },
  { re: /\bdump\s*\(/, lang: 'PHP (dump)' },
  { re: /\bdebugger\b/, lang: 'JavaScript debugger' },
  { re: /\bbinding\.pry\b/, lang: 'Ruby (binding.pry)' },
  { re: /\bbyebug\b/, lang: 'Ruby (byebug)' },
  { re: /\bp\s+\w+/, lang: 'Ruby (p)' },
];

function detectDebugStatements(content) {
  const found = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    for (const { re, lang } of DEBUG_PATTERNS) {
      if (re.test(line)) {
        found.push({ line: idx + 1, snippet: line.trim().slice(0, 80), lang });
        break;
      }
    }
  });
  return found;
}

// ---------------------------------------------------------------------------
// Secret detection
// ---------------------------------------------------------------------------
const SECRET_PATTERNS = [
  { re: /(?:password|passwd|pwd)\s*=\s*['"][^'"]{4,}['"]/i, label: 'password hardcodeado' },
  { re: /(?:api_?key|apikey)\s*=\s*['"][^'"]{8,}['"]/i, label: 'API key hardcodeada' },
  { re: /(?:secret|token)\s*=\s*['"][^'"]{8,}['"]/i, label: 'secret/token hardcodeado' },
  { re: /sk-[a-zA-Z0-9]{20,}/, label: 'OpenAI API key' },
  { re: /ghp_[a-zA-Z0-9]{30,}/, label: 'GitHub Personal Access Token' },
  { re: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/, label: 'JWT token' },
];

function detectSecrets(content) {
  const found = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    for (const { re, label } of SECRET_PATTERNS) {
      if (re.test(line)) {
        found.push({ line: idx + 1, label, snippet: line.trim().slice(0, 60) + '...' });
        break;
      }
    }
  });
  return found;
}

// ---------------------------------------------------------------------------
// Spec gate (issue #28) — require an APPROVED spec in docs/specs/ before code
// edits on a feature branch. BACKWARD-COMPATIBLE: warns by default, escalates
// to a hard block ONLY when mode=enterprise AND require_spec_before_implementation.
// ---------------------------------------------------------------------------
const PROTECTED_BRANCHES = new Set(['main', 'master', 'develop']);

// A spec file counts as APPROVED when a status/estado header line names APPROVED
// on its own (not the template's "DRAFT | REVIEW | APPROVED | IMPLEMENTED" menu).
function specIsApproved(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    if (!/^\s*>?\s*(estado|status)\s*:/i.test(line)) continue;
    const value = line.replace(/^\s*>?\s*(estado|status)\s*:/i, '').trim();
    if (/\bAPPROVED\b/i.test(value) && !value.includes('|')) return true;
  }
  return false;
}

// Returns true when docs/specs/ holds at least one APPROVED spec.
function hasApprovedSpec(repoRoot) {
  const specsDir = path.join(repoRoot, 'docs', 'specs');
  let entries;
  try { entries = fs.readdirSync(specsDir); } catch { return false; }
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    if (name === '_template.md' || name === 'README.md') continue;
    try {
      if (specIsApproved(fs.readFileSync(path.join(specsDir, name), 'utf8'))) return true;
    } catch { /* ignore unreadable spec */ }
  }
  return false;
}

const SPEC_GATE_MSG =
  `forge: no se encontró una spec APPROVED en docs/specs/.\n\n` +
  `  El flujo spec-first (SDD) exige una spec aprobada antes de editar código.\n\n` +
  `  Para crearla:\n` +
  `    1. cp docs/specs/_template.md docs/specs/<id>-<slug>.md\n` +
  `    2. completá Contexto, Decisión y Criterios de aceptación\n` +
  `    3. pasá el encabezado a "Estado: APPROVED" tras la revisión\n\n` +
  `  Detalle del gate: docs/spec-gate-flow.md\n`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  if (!raw.trim()) { process.exit(0); }
  let data;
  try { data = JSON.parse(raw); } catch { process.exit(0); }

  const toolName = data.tool_name || '';
  if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) process.exit(0);

  const toolInput = data.tool_input || {};
  const filePath = toolInput.file_path || toolInput.path || '';
  if (!filePath) process.exit(0);

  dbg(`file: ${filePath}`);

  const warnings = [];

  // 1. Branch guard
  if (!isExemptFromBranchGuard(filePath) && isCodeFile(filePath)) {
    const branch = getCurrentBranch();
    dbg(`branch: ${branch}`);
    if (branch === 'main' || branch === 'master') {
      process.stdout.write(
        `forge: BLOQUEADO — editando código directamente en ${branch}.\n\n` +
        `  Archivo: ${filePath}\n\n` +
        `  Creá una rama antes de editar código:\n` +
        `    git checkout -b feat/descripcion\n\n` +
        `  Ramas de documentación (.md, .yaml, .json) están permitidas en ${branch}.\n`
      );
      process.exit(2);
    }

    // 1b. Spec gate — require an APPROVED spec on feature branches.
    if (!PROTECTED_BRANCHES.has(branch) && branch) {
      const { text, root } = loadProjectYaml();
      if (!hasApprovedSpec(root)) {
        const block = isEnterpriseMode(text) && specGateRequired(text);
        dbg(`spec gate: no APPROVED spec — ${block ? 'BLOCK (enterprise)' : 'WARN'}`);
        if (block) {
          process.stdout.write(SPEC_GATE_MSG);
          process.exit(2);
        }
        warnings.push(
          `Spec gate: no hay una spec APPROVED en docs/specs/.\n` +
          `    El flujo spec-first lo recomienda antes de editar código.\n` +
          `    (Solo advertencia; se vuelve bloqueante con mode=enterprise +\n` +
          `     rules.require_spec_before_implementation. Ver docs/spec-gate-flow.md)`
        );
      }
    }
  }

  // 2. Debug and secret detection on new content
  const newContent = toolInput.new_string || toolInput.content || '';
  if (newContent && isCodeFile(filePath)) {
    const debugHits = detectDebugStatements(newContent);
    const secretHits = detectSecrets(newContent);

    if (debugHits.length > 0) {
      const items = debugHits.map(h => `    línea ${h.line}: ${h.snippet} (${h.lang})`).join('\n');
      warnings.push(`Debug statements detectados:\n${items}`);
    }
    if (secretHits.length > 0) {
      const items = secretHits.map(h => `    línea ${h.line}: ${h.label} — ${h.snippet}`).join('\n');
      warnings.push(`Posibles secrets hardcodeados:\n${items}\n  Usar variables de entorno en su lugar.`);
    }
  }

  if (warnings.length > 0) {
    process.stdout.write(
      `forge: ADVERTENCIA — revisá antes de continuar:\n\n` +
      warnings.map(w => `  • ${w}`).join('\n\n') + '\n'
    );
    // Don't block — just warn
  }

  process.exit(0);
});
