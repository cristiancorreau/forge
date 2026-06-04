import { bold, dim } from './colors.js';
import { borderChars } from './ascii.js';

export function box(title: string, lines: string[]): string {
  const b = borderChars();
  const width = Math.max(title.length, ...lines.map(l => l.length)) + 4;
  const top = b.topLeft + b.horizontal.repeat(width) + b.topRight;
  const bottom = b.bottomLeft + b.horizontal.repeat(width) + b.bottomRight;
  const pad = (s: string) => b.vertical + ' ' + s.padEnd(width - 2) + ' ' + b.vertical;
  return [
    top,
    pad(bold(title)),
    pad(dim(b.horizontal.repeat(title.length))),
    ...lines.map(pad),
    bottom,
  ].join('\n');
}
