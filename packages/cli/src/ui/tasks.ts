import { Listr, type ListrTask } from 'listr2';
import chalk from 'chalk';

export interface InstallTask {
  title: string;
  task: () => void | Promise<void>;
  tech?: string;
}

/**
 * Runs an installation task list with listr2 — renders checkmarks as each task completes,
 * matching the autoskills aesthetic.
 */
export async function runTasks(
  sectionTitle: string,
  tasks: InstallTask[],
): Promise<void> {
  process.stdout.write('\n' + chalk.bold('► ') + chalk.bold(sectionTitle) + '\n\n');

  const listrTasks: ListrTask[] = tasks.map(t => ({
    title: chalk.cyan(t.title) + (t.tech ? chalk.dim('  ← ' + t.tech) : ''),
    task: async () => { await t.task(); },
  }));

  const runner = new Listr(listrTasks, {
    concurrent: false,
    rendererOptions: {
      collapseErrors: false,
      showSkipMessage: false,
    },
  });

  await runner.run();
}
