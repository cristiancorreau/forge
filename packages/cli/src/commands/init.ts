import { resolveScript } from '../lib/paths.js';
import { runPython } from '../lib/python.js';

const HELP = `Usage: forge init [options]

Initialize forge in a project. Creates project.yaml via interactive wizard
and generates agent files for the selected runtime.

Options:
  --runtime <name>   Target runtime: claude-code, opencode, codex, kiro
  --dry-run          Show what would be created without writing files
  --force            Skip confirmation prompts
  -h, --help         Show this help
`;

export async function init(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  const script = resolveScript('forge-init.py');
  return runPython(script, args);
}
