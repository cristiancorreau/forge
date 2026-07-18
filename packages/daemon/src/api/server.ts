/**
 * Servidor HTTP mínimo de Fase 1 (SPEC-077 § 5).
 *
 * Elección de stack: node:http puro, sin Hono. Motivo: los tests del paquete
 * corren con `node --test` sin Bun, y node:http no agrega dependencias ni
 * riesgo de resolución ESM; la superficie de Fase 1 son 4 rutas. SPEC-082
 * (dueña de la API completa) lo migrará a Hono sobre Bun.serve — el contrato
 * visible (prefijo /api/v1, bearer token, shape de error) ya es el de SPEC-082,
 * así que la migración no cambia clientes.
 *
 * Reglas adoptadas de SPEC-082: bind EXCLUSIVO 127.0.0.1 (0.0.0.0 es
 * inexpresable), puerto default 41414 (--port / FORGE_DAEMON_PORT), token
 * bearer aleatorio por arranque, errores { error: { code, message } } sin
 * stack ni message de excepciones internas.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import type { ProjectsDeps } from '@cristiancorreau/forge-daemon-core';
import { createProjectsRoutes, apiError } from './projects.js';
import { createProjectsDeps, normalizeProjectPath } from '../deps.js';
import { startManifestWatcher, type ManifestWatcherHandle } from '../infra/manifest-watcher.js';
import { forgeHome, daemonJsonPath } from '../infra/forge-home.js';

export const DEFAULT_PORT = 41414;

export interface ServerOptions {
  /** Puerto (0 = efímero, para tests). Default: FORGE_DAEMON_PORT o 41414. */
  port?: number;
  /** Deps preconstruidas (tests); si faltan se componen sobre $FORGE_HOME. */
  deps?: ProjectsDeps;
  /** Arrancar el watcher de project.yaml (default true). */
  watch?: boolean;
}

export interface ServerHandle {
  port: number;
  token: string;
  close(): Promise<void>;
}

export function resolvePort(cliPort?: number): number {
  if (cliPort !== undefined && Number.isInteger(cliPort) && cliPort >= 0) return cliPort;
  const env = process.env.FORGE_DAEMON_PORT;
  if (env !== undefined) {
    const parsed = Number.parseInt(env, 10);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535) return parsed;
  }
  return DEFAULT_PORT;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (status === 204 || body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

export async function startServer(opts: ServerOptions = {}): Promise<ServerHandle> {
  const port = resolvePort(opts.port);
  const token = randomBytes(32).toString('hex');

  let ownedClose: (() => void) | null = null;
  let deps = opts.deps;
  if (!deps) {
    const handle = createProjectsDeps();
    deps = handle.deps;
    ownedClose = handle.close;
  }

  const routes = createProjectsRoutes(deps, normalizeProjectPath);
  let watcher: ManifestWatcherHandle | null = null;
  if (opts.watch !== false) {
    watcher = await startManifestWatcher(deps);
  }

  const server = createServer((req, res) => {
    void (async () => {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${token}`) {
        sendJson(res, 401, apiError('unauthorized', 'missing or invalid bearer token'));
        return;
      }

      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      let body: unknown;
      const raw = await readBody(req);
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw);
        } catch {
          sendJson(res, 400, apiError('validation_failed', 'request body is not valid JSON'));
          return;
        }
      }

      const result = await routes(req.method ?? 'GET', url.pathname, body);
      if (result === null) {
        sendJson(res, 404, apiError('not_found', 'no such route'));
        return;
      }
      sendJson(res, result.status, result.body);
    })().catch(() => {
      // throw no controlado: nunca serializar stack ni message interno
      if (!res.headersSent) {
        sendJson(res, 500, apiError('internal', 'internal error'));
      } else {
        res.end();
      }
    });
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    // Bind exclusivo a loopback: no hay opción de hostname (SPEC-082 § 2).
    server.listen(port, '127.0.0.1', () => resolvePromise());
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;

  // Archivo de descubrimiento (~/.forge/daemon.json, modo 0600) — mismo shape
  // que SPEC-078/082. FORGE_HOME lo redirige en tests.
  mkdirSync(forgeHome(), { recursive: true });
  writeFileSync(
    daemonJsonPath(),
    JSON.stringify({ pid: process.pid, port: boundPort, token, startedAt: new Date().toISOString() }, null, 2) + '\n',
    { mode: 0o600 },
  );

  return {
    port: boundPort,
    token,
    close: async () => {
      watcher?.close();
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
      try {
        rmSync(daemonJsonPath(), { force: true });
      } catch {
        // best-effort
      }
      ownedClose?.();
    },
  };
}
