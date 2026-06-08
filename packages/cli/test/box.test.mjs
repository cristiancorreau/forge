// Guard for ui/box.ts: every rendered line must have the same VISIBLE width,
// even when the content carries ANSI color codes. The reported bug ("la
// decoración se descuadra" on Windows PowerShell, in `forge wiki status` and
// `forge skills`) was width math counting the invisible color escapes.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const visLen = (s) => s.replace(ANSI_RE, '').length;

let box, colors;

before(async () => {
  assert.ok(existsSync(join(DIST, 'ui', 'box.js')), 'dist not built — run "npm run build:all"');
  box = (await import(pathToFileURL(join(DIST, 'ui', 'box.js')).href)).box;
  colors = await import(pathToFileURL(join(DIST, 'ui', 'colors.js')).href);
});

describe('ui/box visible-width alignment', () => {
  test('all lines share the same visible width with ANSI-colored content', () => {
    const { green, cyan, red, dim } = colors;
    // Mirrors the real `forge wiki status` / `forge skills` content: mixed
    // colors and lengths — the exact shape that used to descuadrar.
    const lines = [
      `Total de páginas (excl. raw): ${green('4')}`,
      `Fuentes en raw/: ${cyan('0')}`,
      `0/0 páginas en el índice`,
      red('Faltan: index.md, log.md'),
      `21 skill(s) · ${green('4 activa(s)')} en ${dim('project.yaml')}`,
    ];
    const out = box(green('Wiki saludable'), lines).split('\n');
    const widths = out.map(visLen);
    const first = widths[0];
    for (let i = 0; i < out.length; i++) {
      assert.equal(widths[i], first,
        `línea ${i} ancho visible ${widths[i]} ≠ ${first}: ${JSON.stringify(out[i].replace(ANSI_RE, ''))}`);
    }
  });

  test('plain (uncolored) box also aligns', () => {
    const out = box('Título', ['una línea', 'otra más larga que la anterior']).split('\n');
    const widths = out.map(visLen);
    assert.ok(widths.every(w => w === widths[0]), 'todas las líneas igual ancho');
  });
});
