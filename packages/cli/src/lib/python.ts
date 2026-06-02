import { spawnSync, execSync } from 'child_process';

const PYTHON_CANDIDATES = ['python3', 'python'];

export function findPython(): string | null {
  for (const bin of PYTHON_CANDIDATES) {
    try {
      const result = spawnSync(bin, ['--version'], { encoding: 'utf8' });
      if (result.status === 0) {
        const version = result.stdout || result.stderr || '';
        const match = version.match(/Python (\d+)\.(\d+)/);
        if (match && (parseInt(match[1]) > 3 || (parseInt(match[1]) === 3 && parseInt(match[2]) >= 9))) {
          return bin;
        }
      }
    } catch {
      // not found, try next
    }
  }
  return null;
}

export function hasPyyaml(python: string): boolean {
  const result = spawnSync(python, ['-c', 'import yaml'], { encoding: 'utf8' });
  return result.status === 0;
}

export function runPython(script: string, args: string[]): number {
  const python = findPython();
  if (!python) {
    console.error(
      'Error: Python 3.9+ is required but was not found.\n\n' +
      'Install Python:\n' +
      '  macOS:  brew install python3\n' +
      '  Ubuntu: sudo apt install python3\n' +
      '  Win:    https://python.org/downloads\n'
    );
    return 1;
  }

  if (!hasPyyaml(python)) {
    console.error(
      'Error: pyyaml is required but not installed.\n\n' +
      `  ${python} -m pip install pyyaml\n`
    );
    return 1;
  }

  const result = spawnSync(python, [script, ...args], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  return result.status ?? 1;
}
