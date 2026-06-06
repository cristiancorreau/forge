const NO_COLOR = process.env['NO_COLOR'] !== undefined || !process.stdout.isTTY;

function wrap(code: number, reset: number) {
  return (s: string) => NO_COLOR ? s : `\x1b[${code}m${s}\x1b[${reset}m`;
}

/** 24-bit truecolor wrapper (for the ember accent that matches the landing). */
function wrap24(r: number, g: number, b: number) {
  return (s: string) => NO_COLOR ? s : `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
}

export const bold   = wrap(1, 22);
export const dim    = wrap(2, 22);
export const green  = wrap(32, 39);
export const red    = wrap(31, 39);
export const yellow = wrap(33, 39);
export const gray   = wrap(90, 39);

// forge's ember accent (matches the landing / TUI theme).
export const ember  = wrap24(0xff, 0x8a, 0x1c); // #ff8a1c
export const amber  = wrap24(0xff, 0xb4, 0x54); // #ffb454
// `cyan` was the previous accent; keep the name for compatibility but render it
// as ember so every command's accent matches the landing in one place.
export const cyan   = ember;

export const icons = {
  ok:    green('✓'),
  warn:  yellow('!'),
  error: red('✗'),
  info:  ember('i'),
  skip:  yellow('~'),
};
