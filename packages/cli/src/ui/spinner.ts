import { green, red, yellow, dim, gray } from './colors.js';

type ItemStatus = 'pending' | 'running' | 'done' | 'error' | 'skip';

interface SpinnerItem {
  runtime: string;
  file: string;
  status: ItemStatus;
}

const ICON: Record<ItemStatus, string> = {
  pending: '  ',
  running: dim('…'),
  done:    green('✓'),
  error:   red('✗'),
  skip:    yellow('~'),
};

function renderLine(item: SpinnerItem): string {
  const icon = ICON[item.status];
  const rt = item.runtime.padEnd(12);
  const f = item.status === 'pending' ? gray(item.file) : item.file;
  return `  ${icon} ${rt}  ${f}`;
}

export function createSpinner(items: Array<{ runtime: string; file: string }>) {
  const state: SpinnerItem[] = items.map(i => ({ ...i, status: 'pending' as ItemStatus }));
  let printed = false;

  function render() {
    if (printed) {
      // Move cursor up N lines to overwrite
      process.stdout.write(`\x1b[${state.length}A`);
    }
    for (const item of state) {
      process.stdout.write('\r\x1b[K' + renderLine(item) + '\n');
    }
    printed = true;
  }

  return {
    start() {
      render();
    },
    update(runtime: string, status: 'running' | 'done' | 'error' | 'skip', file?: string) {
      const item = state.find(i => i.runtime === runtime);
      if (!item) return;
      item.status = status;
      if (file) item.file = file;
      render();
    },
    stop() {
      // Cursor already at end after last render
    },
  };
}
