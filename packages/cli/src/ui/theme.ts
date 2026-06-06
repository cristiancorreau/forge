/**
 * forge UI theme — ember/amber on near-black, matching the landing page so the
 * terminal and the website share one identity. Shared by the static header
 * (chalk) and the OpenTUI wizard/dashboard/panel.
 */
export const THEME = {
  // Primary accent. The key is named `cyan` for back-compat with the existing
  // TUI code (which references C.cyan everywhere), but the VALUE is forge's
  // ember accent — it used to be #00e5ff.
  cyan: '#ff8a1c',
  // Brighter accent for values/highlights (e.g. "TypeScript · Node 20").
  amber: '#ffb454',
  yellow: '#ffd740',
  green: '#56d364',
  red: '#f85149',
  muted: '#8b949e',
  dim: '#5a5f66',
  bg: '#0a0a0b',
  bgPanel: '#141416',
  bgInput: '#1c1c20',
  bgFocus: '#2a2420',
  white: '#e6edf3',
} as const;

/** Per-row ember gradient for the 6-line FORGE banner (top → bottom). */
export const BANNER_GRADIENT = [
  '#ffc163', '#ffb04a', '#ff9f30', '#ff8a1c', '#f9761b', '#f2641a',
] as const;

/** Color for banner row `i` (falls back to the accent for extra rows). */
export function bannerRowColor(i: number): string {
  return BANNER_GRADIENT[i] ?? THEME.cyan;
}
