#!/usr/bin/env node
/**
 * forge — PreToolUse hook: pre-edit-check.js
 * Branch guard, debug detection, hardcoded secret detection. Zero Python dependency.
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const DEBUG = !['', '0', 'false', 'False'].includes(process.env.DEBUG || '');
const dbg = msg => DEBUG && process.stdout.write(`[forge-hook-debug] ${msg}\n`);

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
