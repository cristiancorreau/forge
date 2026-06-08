import { bold, dim } from './colors.js';
import { borderChars } from './ascii.js';

// Strip ANSI color/style escape sequences so width math counts only the
// VISIBLE characters. Measuring with raw .length counts the invisible color
// codes (e.g. green(...) adds ~9 chars), which inflates the width unevenly per
// line and makes the right border drift — the box "se descuadra", most visibly
// on Windows PowerShell where the issue was reported.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const visLen = (s: string): number => s.replace(ANSI_RE, '').length;

export function box(title: string, lines: string[]): string {
  const b = borderChars();
  const width = Math.max(visLen(title), ...lines.map(visLen)) + 4;
  const top = b.topLeft + b.horizontal.repeat(width) + b.topRight;
  const bottom = b.bottomLeft + b.horizontal.repeat(width) + b.bottomRight;
  // Pad by visible width: padEnd would count the ANSI codes and mis-align.
  const pad = (s: string) => {
    const fill = Math.max(0, width - 2 - visLen(s));
    return b.vertical + ' ' + s + ' '.repeat(fill) + ' ' + b.vertical;
  };
  return [
    top,
    pad(bold(title)),
    pad(dim(b.horizontal.repeat(visLen(title)))),
    ...lines.map(pad),
    bottom,
  ].join('\n');
}
