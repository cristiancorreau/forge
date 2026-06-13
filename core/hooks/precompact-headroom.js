#!/usr/bin/env node
/**
 * forge — PreCompact hook: precompact-headroom.js
 * Justo antes de que el runtime compacte el contexto, recuerda releer el punto
 * de re-anclaje determinístico .forge/state/STATE.md (SPEC-062) para no perder
 * el "big picture". Advisory: exit 0 siempre, no bloquea. Zero Python.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function findStateFile() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.forge', 'state', 'STATE.md');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  // The event payload is not required; the reminder is unconditional on compaction.
  const statePath = findStateFile();
  if (!statePath) process.exit(0);

  let summary = '';
  try {
    const content = fs.readFileSync(statePath, 'utf8');
    // Take the first non-empty, non-comment lines as a short headroom summary.
    const lines = content.split('\n')
      .filter(l => l.trim() && !l.trim().startsWith('<!--'))
      .slice(0, 6);
    summary = lines.join('\n  ');
  } catch { /* unreadable → just point at the file */ }

  process.stdout.write(
    `forge: el contexto está por compactarse — re-ancla en .forge/state/STATE.md\n` +
    `  antes de continuar, para no perder el panorama del proyecto.\n` +
    (summary ? `\n  ${summary}\n` : '')
  );
  process.exit(0);
});
