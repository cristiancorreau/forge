import boxen from 'boxen';
import chalk from 'chalk';
import { VERSION } from '../version.js';
import { FORGE_BANNER } from './banner.js';

export function printHeader(): void {
  const banner = FORGE_BANNER.map(l => chalk.cyan(l)).join('\n');
  const content =
    banner + '\n' +
    chalk.dim('Configure any project for AI agents') + '  ' + chalk.dim('v' + VERSION) + '\n' +
    chalk.dim('Claude Code · OpenCode · Codex · Kiro');

  const output = boxen(content, {
    borderStyle: 'double',
    borderColor: 'cyan',
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
  });

  process.stdout.write(output + '\n');
}

export function printSection(title: string): void {
  process.stdout.write('\n' + chalk.bold('► ') + chalk.bold(title) + '\n\n');
}

export function printDetected(items: string[]): void {
  if (items.length === 0) return;
  printSection('Detected technologies:');

  // 3 columns
  const cols = 3;
  const rows = Math.ceil(items.length / cols);
  for (let r = 0; r < rows; r++) {
    let line = '  ';
    for (let c = 0; c < cols; c++) {
      const idx = r + c * rows;
      if (idx < items.length) {
        line += chalk.green('✔ ') + chalk.bold(items[idx]).padEnd(20);
      }
    }
    process.stdout.write(line.trimEnd() + '\n');
  }
}

export function printAgentList(agents: Array<{ name: string; tech: string }>): void {
  printSection(`Agents to install (${agents.length})`);
  agents.forEach((a, i) => {
    const num = chalk.dim(String(i + 1).padStart(2) + '.');
    const name = chalk.cyan(a.name.padEnd(30));
    const tech = chalk.dim('← ' + a.tech);
    process.stdout.write(`  ${num} ${name} ${tech}\n`);
  });
}
