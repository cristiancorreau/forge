'use strict';

/**
 * Mapeo PURO accion -> args de la CLI de forge.
 *
 * Mismo contrato conceptual que el webview de la extension (ipc.ts):
 * la GUI nunca reimplementa la generacion de config; solo arma los args
 * y deja que el motor (dist/cli.js de forge) haga el trabajo via spawn.
 *
 * Contrato:
 *   init     -> ['init', '--from', <file>]            (+ '--dry-run' si payload.dryRun)
 *   adopt    -> ['adopt', '--yes', ...extras]         (+ '--dry-run' si payload.dryRun)
 *   audit    -> ['audit', '--json']
 *   doctor   -> ['doctor']
 *   generate -> ['generate']                          (o ['generate', '--runtime', <runtime>])
 *
 * Es deliberadamente sin efectos secundarios para poder testearlo con
 * `node --test` sin Electron.
 *
 * @param {string} action
 * @param {object} [payload]
 * @returns {string[]} args para spawn de la CLI
 */
function toArgs(action, payload) {
  const p = payload || {};

  switch (action) {
    case 'init': {
      if (!p.from || typeof p.from !== 'string' || p.from.trim() === '') {
        throw new Error("La accion 'init' requiere payload.from (ruta del archivo).");
      }
      const args = ['init', '--from', p.from];
      if (p.dryRun) args.push('--dry-run');
      return args;
    }

    case 'adopt': {
      const args = ['adopt', '--yes'];
      if (p.dryRun) args.push('--dry-run');
      return args;
    }

    case 'audit':
      return ['audit', '--json'];

    case 'doctor':
      return ['doctor'];

    case 'generate': {
      if (p.runtime && typeof p.runtime === 'string' && p.runtime.trim() !== '') {
        return ['generate', '--runtime', p.runtime];
      }
      return ['generate'];
    }

    default:
      throw new Error(`Accion desconocida: ${String(action)}`);
  }
}

module.exports = { toArgs };
