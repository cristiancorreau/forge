/**
 * FORGE ASCII banner — shared by the static header (chalk/boxen) and the
 * OpenTUI wizard/dashboard headers. The default banner uses Unicode box-drawing
 * block glyphs (no ANSI), so it is safe to feed into OpenTUI Text content and to
 * colorize with either chalk or OpenTUI styled-text helpers.
 *
 * On legacy Windows consoles those block glyphs render as mojibake, so an
 * ASCII-only fallback is provided and selected via `useAscii()`.
 */
import { useAscii, type AsciiOptions } from './ascii.js';

export const FORGE_BANNER: readonly string[] = [
  '███████╗ ██████╗ ██████╗  ██████╗ ███████╗',
  '██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝',
  '█████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ',
  '██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ',
  '██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗',
  '╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
];

/** Pure-ASCII fallback banner for legacy Windows consoles. */
export const FORGE_BANNER_ASCII: readonly string[] = [
  ' ___ ___  ___  ___ ___ ',
  '| __/ _ \\| _ \\/ __| __|',
  "| _| (_) |   / (_ | _| ",
  '|_| \\___/|_|_\\\\___|___|',
];

/** Number of rows the (Unicode) banner occupies (used to size OpenTUI panels). */
export const FORGE_BANNER_HEIGHT = FORGE_BANNER.length;

/**
 * The banner rows to render for the current (or injected) environment: the
 * Unicode block banner normally, or the ASCII fallback when `useAscii()` is on.
 */
export function forgeBanner(opts: AsciiOptions = {}): readonly string[] {
  return useAscii(opts) ? FORGE_BANNER_ASCII : FORGE_BANNER;
}
