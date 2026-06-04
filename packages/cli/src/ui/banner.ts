/**
 * FORGE ASCII banner — shared by the static header (chalk/boxen) and the
 * OpenTUI wizard/dashboard headers. Plain Unicode box-drawing glyphs only (no
 * ANSI), so it is safe to feed into OpenTUI Text content and to colorize with
 * either chalk or OpenTUI styled-text helpers.
 */
export const FORGE_BANNER: readonly string[] = [
  '███████╗ ██████╗ ██████╗  ██████╗ ███████╗',
  '██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝',
  '█████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ',
  '██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ',
  '██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗',
  '╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
];

/** Number of rows the banner occupies (used to size OpenTUI header panels). */
export const FORGE_BANNER_HEIGHT = FORGE_BANNER.length;
