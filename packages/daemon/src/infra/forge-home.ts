/**
 * Resolución de $FORGE_HOME (default ~/.forge). FORGE_HOME existe para aislar
 * tests (DB y daemon.json temporales) — SPEC-077 § 3.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

export function forgeHome(): string {
  return process.env.FORGE_HOME ?? join(homedir(), '.forge');
}

export function defaultDbPath(): string {
  return join(forgeHome(), 'forge.db');
}

export function daemonJsonPath(): string {
  return join(forgeHome(), 'daemon.json');
}
