const NO_COLOR = process.env['NO_COLOR'] !== undefined || !process.stdout.isTTY;

function wrap(code: number, reset: number) {
  return (s: string) => NO_COLOR ? s : `\x1b[${code}m${s}\x1b[${reset}m`;
}

export const bold   = wrap(1, 22);
export const dim    = wrap(2, 22);
export const green  = wrap(32, 39);
export const red    = wrap(31, 39);
export const yellow = wrap(33, 39);
export const cyan   = wrap(36, 39);
export const gray   = wrap(90, 39);

export const icons = {
  ok:    green('✓'),
  warn:  yellow('!'),
  error: red('✗'),
  info:  cyan('i'),
  skip:  yellow('~'),
};
