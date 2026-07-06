#!/usr/bin/env node
/**
 * Copia los artefactos generados no compilables por tsc (.mjs / .d.mts) a
 * dist/, junto al index.js emitido. Parte de `npm run build`.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, '..');
mkdirSync(join(PKG, 'dist'), { recursive: true });
for (const f of ['validators.gen.mjs', 'validators.gen.d.mts']) {
  copyFileSync(join(PKG, 'src', f), join(PKG, 'dist', f));
}
console.log('copy-gen-to-dist: validators.gen.mjs, validators.gen.d.mts → dist/');
