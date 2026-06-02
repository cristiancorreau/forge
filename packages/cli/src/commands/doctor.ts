import { findPython, hasPyyaml } from '../lib/python.js';
import { resolveForgeRoot } from '../lib/paths.js';

export async function doctor(_args: string[]): Promise<number> {
  let ok = true;

  console.log('forge doctor — environment check\n');

  // Python
  const python = findPython();
  if (python) {
    console.log(`  ✓ Python: ${python}`);
  } else {
    console.log('  ✗ Python 3.9+ not found');
    console.log('    macOS:  brew install python3');
    console.log('    Ubuntu: sudo apt install python3');
    console.log('    Win:    https://python.org/downloads');
    ok = false;
  }

  // pyyaml
  if (python) {
    if (hasPyyaml(python)) {
      console.log('  ✓ pyyaml: installed');
    } else {
      console.log('  ✗ pyyaml not found');
      console.log(`    ${python} -m pip install pyyaml`);
      ok = false;
    }
  }

  // forge root
  try {
    const root = resolveForgeRoot();
    console.log(`  ✓ forge root: ${root}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ✗ forge root: ${msg}`);
    ok = false;
  }

  // project.yaml
  const { existsSync } = await import('fs');
  const { join } = await import('path');
  const projectYaml = join(process.cwd(), 'project.yaml');
  if (existsSync(projectYaml)) {
    console.log('  ✓ project.yaml: found');
  } else {
    console.log('  ~ project.yaml: not found (run forge init)');
  }

  console.log('');
  if (ok) {
    console.log('All checks passed.');
  } else {
    console.log('Some checks failed. Fix the issues above and run forge doctor again.');
  }

  return ok ? 0 : 1;
}
