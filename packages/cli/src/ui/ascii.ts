/**
 * ASCII-safe rendering mode.
 *
 * The static UI (boxes, banner, header, the `forge panel` snapshot) uses Unicode
 * box-drawing glyphs (│ ┌ └ ─ ┐ ┘ …). Legacy Windows consoles (conhost,
 * PowerShell 5, a non-UTF-8 code page) mangle these into mojibake. `useAscii()`
 * decides when to degrade to a plain-ASCII charset instead:
 *
 *   - `FORGE_ASCII=1`  → always ASCII (also useful for CI log readability).
 *   - `FORGE_ASCII=0`  → always Unicode (escape hatch on Windows).
 *   - win32 without a modern terminal (no `WT_SESSION`, i.e. not Windows
 *     Terminal) → ASCII, because the legacy host likely can't render the glyphs.
 *   - everything else (macOS/Linux, or Windows Terminal) → Unicode.
 *
 * Color is intentionally NOT handled here: chalk already detects support and
 * honours `NO_COLOR`/`FORCE_COLOR`, and Node enables VT processing on Win10+.
 */

export interface AsciiOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export function useAscii(opts: AsciiOptions = {}): boolean {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;

  // Explicit override wins, in both directions.
  if (env.FORGE_ASCII === '1') return true;
  if (env.FORGE_ASCII === '0') return false;

  // Legacy Windows console (not Windows Terminal) → ASCII.
  if (platform === 'win32' && !env.WT_SESSION) return true;

  return false;
}

export interface BorderChars {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}

const UNICODE_BORDERS: BorderChars = {
  topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
  horizontal: '─', vertical: '│',
};

const ASCII_BORDERS: BorderChars = {
  topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+',
  horizontal: '-', vertical: '|',
};

/** Border charset for the current (or injected) environment. */
export function borderChars(opts: AsciiOptions = {}): BorderChars {
  return useAscii(opts) ? ASCII_BORDERS : UNICODE_BORDERS;
}

/**
 * boxen `borderStyle` to use: `'classic'` (+ - |) for ASCII mode, otherwise the
 * caller's preferred Unicode style (e.g. `'round'`, `'double'`).
 */
export function boxenBorderStyle(
  unicodeStyle: string,
  opts: AsciiOptions = {},
): string {
  return useAscii(opts) ? 'classic' : unicodeStyle;
}

/**
 * OpenTUI `BorderCharacters` shape (12 glyphs). Mirrored here so this
 * dependency-light module doesn't import the OpenTUI types.
 */
export interface TuiBorderChars {
  topLeft: string; topRight: string; bottomLeft: string; bottomRight: string;
  horizontal: string; vertical: string;
  topT: string; bottomT: string; leftT: string; rightT: string; cross: string;
}

const TUI_ASCII_BORDER: TuiBorderChars = {
  topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+',
  horizontal: '-', vertical: '|',
  topT: '+', bottomT: '+', leftT: '+', rightT: '+', cross: '+',
};

/**
 * Custom ASCII border characters for OpenTUI `BoxRenderable`s in ASCII mode
 * (legacy Windows consoles mangle the Unicode box glyphs into mojibake). Returns
 * `undefined` otherwise, so OpenTUI keeps the caller's Unicode `borderStyle`.
 * Spread into box options as `customBorderChars: tuiBorderChars()` — additive and
 * gated: a no-op on macOS/Linux/Windows Terminal.
 */
export function tuiBorderChars(opts: AsciiOptions = {}): TuiBorderChars | undefined {
  return useAscii(opts) ? TUI_ASCII_BORDER : undefined;
}
