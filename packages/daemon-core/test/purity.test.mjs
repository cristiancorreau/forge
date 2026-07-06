// Regla dura de pureza (SPEC-076 § 9, SPEC-074 Principio 2):
// ningún archivo de src/ importa node:*, bun:*, builtins desnudos, sqlite ni
// http — solo tipos de @cristiancorreau/forge-schemas y módulos propios.
//
// Este test SÍ usa node:fs: es infraestructura de test, no dominio.
//
// Verificación manual de regresión: agregar temporalmente
//   import 'node:fs';
// a src/index.ts y correr `node --test test/purity.test.mjs` → debe FALLAR
// con "src/index.ts importa 'node:fs'". (Verificado durante SPEC-076.)
//
// Equivalente por grep:
//   grep -rE "from ['\"](node:|bun:)" packages/daemon-core/src  → sin resultados

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, '..');
const SRC = join(PKG, 'src');

const BARE_BUILTINS = new Set([
  'fs', 'path', 'os', 'child_process', 'http', 'https', 'net', 'crypto',
  'url', 'stream', 'util', 'events', 'worker_threads',
]);
const ALLOWED_PACKAGE = '@cristiancorreau/forge-schemas';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Extrae los specifiers de import/export-from/dynamic import/require. */
function importSpecs(source) {
  const specs = [];
  const patterns = [
    /\bimport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,   // import x from '...'
    /\bimport\s*['"]([^'"]+)['"]/g,                  // import '...' (side-effect)
    /\bexport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,   // export ... from '...'
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,       // import('...')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,      // require('...')
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

function violations(spec) {
  if (spec.startsWith('node:') || spec.startsWith('bun:')) return `prefijo node:/bun: (${spec})`;
  const bare = spec.split('/')[0];
  if (BARE_BUILTINS.has(bare)) return `builtin desnudo (${spec})`;
  if (spec.toLowerCase().includes('sqlite')) return `sqlite (${spec})`;
  if (spec.startsWith('.')) return null; // módulo propio
  const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : bare;
  if (pkgName !== ALLOWED_PACKAGE) return `paquete no permitido (${spec})`;
  return null;
}

describe('pureza de daemon-core (SPEC-076 § 9)', () => {
  test('ningún archivo de src/ importa node:/bun:/builtins/sqlite/paquetes ajenos', () => {
    const files = walk(SRC);
    assert.ok(files.length >= 20, `se esperaban >= 20 archivos .ts en src/, hay ${files.length}`);
    const offenders = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      for (const spec of importSpecs(source)) {
        const why = violations(spec);
        if (why) offenders.push(`${file.slice(PKG.length + 1)} importa '${spec}' — ${why}`);
      }
    }
    assert.deepEqual(offenders, [], `violaciones de pureza:\n${offenders.join('\n')}`);
  });

  test('dependencies de package.json ⊆ {@cristiancorreau/forge-schemas}', () => {
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf-8'));
    const deps = Object.keys(pkg.dependencies ?? {});
    const extra = deps.filter((d) => d !== ALLOWED_PACKAGE);
    assert.deepEqual(extra, [], `dependencies no permitidas: ${extra.join(', ')}`);
  });

  test('el detector reconoce un import prohibido (autotest del lint)', () => {
    assert.equal(violations('node:fs'), 'prefijo node:/bun: (node:fs)');
    assert.equal(violations('bun:sqlite'), 'prefijo node:/bun: (bun:sqlite)');
    assert.equal(violations('fs'), 'builtin desnudo (fs)');
    assert.equal(violations('better-sqlite3'), 'sqlite (better-sqlite3)');
    assert.equal(violations('hono'), 'paquete no permitido (hono)');
    assert.equal(violations('./types.js'), null);
    assert.equal(violations('@cristiancorreau/forge-schemas'), null);
  });
});
