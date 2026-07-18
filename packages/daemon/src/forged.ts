#!/usr/bin/env node
/**
 * forged — daemon de FORGE v4. Fase 1: `forged serve` (solo foreground;
 * start/stop/status llegan con SPEC-078). SPEC-077 § 5.
 */
import { startServer, resolvePort } from './api/server.js';
import { daemonJsonPath } from './infra/forge-home.js';

const USAGE = `Usage: forged serve [--port N]

Serve the FORGE control-plane API on 127.0.0.1 (default port 41414).
The bearer token is regenerated on every launch and written to
${daemonJsonPath()} (mode 0600) as { pid, port, token, startedAt }.

Options:
  --port N     Port to bind on 127.0.0.1 (also FORGE_DAEMON_PORT)
  -h, --help   Show this help
`;

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const [cmd, ...rest] = args;

  if (cmd === '-h' || cmd === '--help' || cmd === undefined) {
    process.stdout.write(USAGE);
    return cmd === undefined ? 1 : 0;
  }
  if (cmd !== 'serve') {
    process.stderr.write(`forged: unknown command "${cmd}"\n\n${USAGE}`);
    return 1;
  }

  let cliPort: number | undefined;
  const portIdx = rest.indexOf('--port');
  if (portIdx >= 0) {
    const parsed = Number.parseInt(rest[portIdx + 1] ?? '', 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      process.stderr.write('forged: --port must be an integer between 0 and 65535\n');
      return 1;
    }
    cliPort = parsed;
  }

  const handle = await startServer({ port: resolvePort(cliPort) });
  process.stdout.write(`forged: listening on http://127.0.0.1:${handle.port}/api/v1 (pid ${process.pid})\n`);
  process.stdout.write(`forged: bearer token written to ${daemonJsonPath()} (mode 0600)\n`);

  const shutdown = () => {
    void handle.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Foreground: queda vivo hasta señal.
  return await new Promise<number>(() => {});
}

main().then(
  (code) => {
    if (code !== 0) process.exit(code);
  },
  (err: unknown) => {
    process.stderr.write(`forged: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
