#!/usr/bin/env node
/**
 * Copies forge assets from the repo root into packages/cli/assets/.
 * Run before npm pack or npm publish.
 */
import { cpSync, rmSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR   = join(__dirname, '..');
const REPO_ROOT = join(CLI_DIR, '..', '..');
const ASSETS    = join(CLI_DIR, 'assets');

// Clean and recreate assets/
if (existsSync(ASSETS)) rmSync(ASSETS, { recursive: true });
mkdirSync(ASSETS, { recursive: true });

const DIRS  = ['core', 'adapters', 'profiles', 'templates', 'scripts', 'hooks'];
const FILES = ['forge.py', 'manifest.json', 'requirements.txt'];
// Top-level package metadata (also copied to CLI root for npm)
const META  = ['LICENSE', 'README.md', 'CHANGELOG.md'];

function sizeKB(path) {
  try {
    const s = statSync(path);
    return s.isDirectory() ? '(dir)' : `${Math.round(s.size / 1024)}KB`;
  } catch { return '?'; }
}

let totalBytes = 0;

function trackSize(destPath) {
  try {
    const s = statSync(destPath);
    if (!s.isDirectory()) totalBytes += s.size;
  } catch {}
}

console.log('Building forge assets...\n');

for (const dir of DIRS) {
  const src  = join(REPO_ROOT, dir);
  const dest = join(ASSETS, dir);
  if (!existsSync(src)) { console.log(`  skip  ${dir}/ (not found)`); continue; }
  cpSync(src, dest, { recursive: true, filter: (s) => !s.includes('__pycache__') && !s.includes('.pytest_cache') });
  console.log(`  copied ${dir}/`);
}

for (const file of FILES) {
  const src  = join(REPO_ROOT, file);
  const dest = join(ASSETS, file);
  if (!existsSync(src)) { console.log(`  skip  ${file} (not found)`); continue; }
  cpSync(src, dest);
  trackSize(dest);
  console.log(`  copied ${file}`);
}

for (const file of META) {
  const src  = join(REPO_ROOT, file);
  const dest = join(CLI_DIR, file);
  if (!existsSync(src)) { console.log(`  skip  ${file} (not found)`); continue; }
  cpSync(src, dest);
  trackSize(dest);
  console.log(`  copied ${file} → cli root`);
}

// Walk assets/ to compute total size
import { readdirSync } from 'fs';
function walkSize(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkSize(p);
    else { try { totalBytes += statSync(p).size; } catch {} }
  }
}
walkSize(ASSETS);

const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
console.log(`\nAssets ready — ${totalMB} MB total`);

if (parseFloat(totalMB) > 10) {
  console.warn('WARNING: assets exceed 10 MB — check for unnecessary files');
  process.exit(1);
}
