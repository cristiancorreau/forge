import { bold, dim } from './colors.js';

export function box(title: string, lines: string[]): string {
  const width = Math.max(title.length, ...lines.map(l => l.length)) + 4;
  const top = '┌' + '─'.repeat(width) + '┐';
  const bottom = '└' + '─'.repeat(width) + '┘';
  const pad = (s: string) => '│ ' + s.padEnd(width - 2) + ' │';
  return [
    top,
    pad(bold(title)),
    pad(dim('─'.repeat(title.length))),
    ...lines.map(pad),
    bottom,
  ].join('\n');
}
