/**
 * Cross-platform Bun resolver, shared by `forge init` and `forge panel`.
 *
 * OpenTUI panels require the Bun runtime. When forge runs under plain Node it
 * re-launches itself under Bun (if available) so the panels can render. Locating
 * the Bun binary differs by platform:
 *   - POSIX (macOS/Linux): `bun` on PATH (`which`), then `~/.bun/bin/bun` and the
 *     Homebrew/`/usr/local` locations.
 *   - Windows: `bun` on PATH (`where`), then `%USERPROFILE%\.bun\bin\bun.exe`
 *     (the default Bun installer location).
 *
 * Everything is parameterised on `platform`/`env` so the resolution logic is
 * unit-testable on any OS (inject `'win32'` to assert the Windows candidate).
 */
import { posix as posixPath, win32 as win32Path } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

export interface BunResolveOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

/**
 * Ordered list of candidate `bun` binaries for a platform. The first entry is
 * always the bare command name so a Bun already on PATH wins. On win32 the home
 * candidate uses `%USERPROFILE%\.bun\bin\bun.exe`; on POSIX it uses
 * `$HOME/.bun/bin/bun` plus the common system install paths.
 *
 * Exported (and pure) so tests can assert the candidate set without spawning.
 */
export function bunCandidates(opts: BunResolveOptions = {}): string[] {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;

  // Build candidate paths with the TARGET platform's join (win32Path/posixPath),
  // not the host's, so resolution is identical whether forge runs on Windows,
  // macOS or Linux (and so the unit tests are host-independent).
  if (platform === 'win32') {
    const userProfile = env.USERPROFILE
      ?? (env.HOMEDRIVE && env.HOMEPATH ? win32Path.join(env.HOMEDRIVE, env.HOMEPATH) : '');
    const candidates = ['bun.exe', 'bun'];
    if (userProfile) candidates.push(win32Path.join(userProfile, '.bun', 'bin', 'bun.exe'));
    return candidates;
  }

  const home = env.HOME ?? '';
  return [
    'bun',
    ...(home ? [posixPath.join(home, '.bun', 'bin', 'bun')] : []),
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
  ];
}

/**
 * Resolve a usable `bun` binary path/command, or `null` if none works. Probes
 * each candidate with `bun --version`. On win32 it also tries `where bun` (the
 * Windows equivalent of `which`) to discover a Bun that lives outside the known
 * candidate list. Returns the candidate string suitable for passing to
 * `spawnSync` as the command.
 */
export function findBun(opts: BunResolveOptions = {}): string | null {
  const env = opts.env ?? process.env;
  if (env.FORGE_NO_BUN === '1') return null; // explicit opt-out

  const platform = opts.platform ?? process.platform;

  for (const bin of bunCandidates({ platform, env })) {
    try {
      const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 2000 });
      if (r.status === 0) return bin;
    } catch { /* try next */ }
  }

  // Last resort: ask the OS where bun lives (`where` on Windows, `which` on POSIX).
  const locator = platform === 'win32' ? 'where' : 'which';
  try {
    const r = spawnSync(locator, ['bun'], { encoding: 'utf8', timeout: 2000 });
    if (r.status === 0) {
      const first = String(r.stdout ?? '').split(/\r?\n/).map(s => s.trim()).find(Boolean);
      if (first) {
        const probe = spawnSync(first, ['--version'], { encoding: 'utf8', timeout: 2000 });
        if (probe.status === 0) return first;
      }
    }
  } catch { /* not found */ }

  return null;
}

/**
 * Resolve the compiled CLI entrypoint (`dist/cli.js`) from an `import.meta.url`.
 * Uses `fileURLToPath` rather than `URL.pathname`: on Windows `pathname` yields
 * `/C:/...` (a leading slash + drive), which is not a valid path for `spawn`.
 */
export function resolveCliEntry(metaUrl: string): string {
  return fileURLToPath(new URL('../cli.js', metaUrl));
}
