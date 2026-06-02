import { resolveScript } from '../lib/paths.js';
import { runPython } from '../lib/python.js';

const HELP = `Usage: forge validate [options]

Validate project.yaml in the current directory against the forge v2 schema.
Exits with code 1 if validation fails (suitable for CI pre-checks).

Options:
  --json      Output errors as JSON
  -h, --help  Show this help
`;

export async function validate(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  const script = resolveScript('forge-validate-project-yaml.py');
  return runPython(script, args);
}
