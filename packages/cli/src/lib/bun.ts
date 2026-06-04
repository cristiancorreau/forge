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

/** Inputs to the (pure) relaunch decision. Everything is injected so the matrix
 * — darwin/win32/linux × bun present/absent × TTY × WT_SESSION × the force/no
 * overrides — is unit-testable on any host without spawning a process. */
export interface RelaunchDecisionOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Resolved bun binary path/command, or null when Bun isn't installed. */
  bunPath?: string | null;
  /** Whether both stdin and stdout are real TTYs (panels need a real terminal). */
  isTTY?: boolean;
  /** True when forge is already executing under the Bun runtime. */
  alreadyBun?: boolean;
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

/**
 * True when the current win32 console is "capable" of an OpenTUI render — i.e.
 * Windows Terminal (`WT_SESSION`) or any host advertising `TERM_PROGRAM`
 * (VS Code's integrated terminal, etc.). Legacy conhost / PowerShell 5 set
 * neither and would mangle the full-screen alt-screen UI, so we treat them as
 * incapable and prefer the (improved) Node fallback there.
 */
function win32TerminalIsCapable(env: NodeJS.ProcessEnv): boolean {
  return !!env.WT_SESSION || !!env.TERM_PROGRAM;
}

/**
 * Pure decision: should forge re-launch itself under Bun to render an OpenTUI
 * panel? Parameterised on platform/env/bunPath/isTTY/alreadyBun so the full
 * matrix is unit-testable on any host.
 *
 * Gates (all must pass): not already under Bun, not already relaunched
 * (`FORGE_BUN_RELAUNCH=1`), not opted out (`FORGE_NO_BUN=1`), a real TTY, and a
 * resolved Bun binary. Beyond that:
 *   - `FORGE_FORCE_BUN=1` forces the relaunch (skips the win32 terminal gate).
 *   - On win32, only auto-relaunch when the console is capable (Windows Terminal
 *     or `TERM_PROGRAM`); otherwise prefer the Node fallback to avoid a broken
 *     OpenTUI render on a legacy console.
 *   - On macOS/Linux, relaunch whenever Bun is present and we have a TTY.
 */
export function shouldRelaunchUnderBun(opts: RelaunchDecisionOptions = {}): boolean {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const bunPath = opts.bunPath ?? null;
  const isTTY = opts.isTTY ?? false;
  const alreadyBun = opts.alreadyBun ?? false;

  if (alreadyBun) return false;                        // we ARE Bun — nothing to do
  if (env.FORGE_BUN_RELAUNCH === '1') return false;    // already relaunched (guard)
  if (env.FORGE_NO_BUN === '1') return false;          // explicit opt-out
  if (!isTTY) return false;                            // panels need a real TTY
  if (!bunPath) return false;                          // Bun not installed

  // Explicit force overrides the platform/terminal heuristic (once gated above).
  if (env.FORGE_FORCE_BUN === '1') return true;

  // Legacy Windows consoles can't render OpenTUI cleanly → prefer Node fallback.
  if (platform === 'win32' && !win32TerminalIsCapable(env)) return false;

  return true;
}

/**
 * Spawn the resolved Bun binary to re-run the CLI entry, inheriting stdio and
 * propagating the child's exit code to the caller. Sets the
 * `FORGE_BUN_RELAUNCH=1` guard so the relaunched process won't recurse.
 *
 * `bunPath` must be the absolute path/command from {@link findBun} and
 * `cliEntry` a real filesystem path from {@link resolveCliEntry} (fileURLToPath
 * — valid on Windows). Returns the exit code to pass to `process.exit`.
 */
export function relaunchUnderBun(
  bunPath: string,
  cliEntry: string,
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): number {
  const result = spawnSync(bunPath, [cliEntry, ...argv], {
    stdio: 'inherit',
    env: { ...env, FORGE_BUN_RELAUNCH: '1' },
  });
  return result.status ?? 0;
}

/** Inputs to the fallback-hint decision (injected for testability). */
export interface FallbackHintOptions {
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  alreadyBun?: boolean;
}

/** The one-line friendly hint shown when forge runs the Node fallback because
 * Bun is absent (or gated). */
export const BUN_FALLBACK_HINT =
  'Tip: instalá Bun para el panel completo — https://bun.sh';

/**
 * Return the friendly Bun hint, or `null` when it shouldn't be shown. Shown only
 * in a TTY, never under Bun (OpenTUI is already in use), and never when the user
 * opted out (`FORGE_NO_BUN=1`) — there's no point nudging someone who disabled it.
 */
export function bunFallbackHint(opts: FallbackHintOptions = {}): string | null {
  const env = opts.env ?? process.env;
  const isTTY = opts.isTTY ?? false;
  const alreadyBun = opts.alreadyBun ?? false;
  if (alreadyBun) return null;
  if (!isTTY) return null;
  if (env.FORGE_NO_BUN === '1') return null;
  return BUN_FALLBACK_HINT;
}
