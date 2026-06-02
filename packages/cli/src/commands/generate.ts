import { resolveScript } from '../lib/paths.js';
import { runPython } from '../lib/python.js';

const HELP = `Usage: forge generate [options]

Generate runtime configuration files from project.yaml.
Auto-detects active runtimes by filesystem markers.

Options:
  --runtime <name>   Generate for specific runtime: claude-code, opencode, codex, kiro, all
  --dry-run          Show what would be generated without writing files
  --force            Overwrite existing files without prompting
  -h, --help         Show this help

Examples:
  forge generate                       # auto-detect runtimes
  forge generate --runtime claude-code
  forge generate --runtime all --dry-run
`;

export async function generate(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  const script = resolveScript('forge-generate-all.py');
  return runPython(script, args);
}
