import { resolveScript } from '../lib/paths.js';
import { runPython } from '../lib/python.js';

const HELP = `Usage: forge audit [options]

Audit a project against the forge standard. Detects missing agents,
outdated profiles, incomplete hooks, and available opportunities.

Options:
  --json             Output results as JSON (suitable for CI)
  --only <id,...>    Audit only specific agents or profiles
  -h, --help         Show this help
`;

export async function audit(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  const script = resolveScript('forge-audit.py');
  return runPython(script, args);
}
