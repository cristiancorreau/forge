#!/usr/bin/env node
/**
 * dogfood.mjs — Harness de dogfood para forge (SPEC-052)
 *
 * Corre detección de stack, recommend y adopt --dry-run sobre una lista de repos
 * sin escribir nada en ellos. Emite docs/analysis/dogfood-<fecha>.json y .md.
 *
 * Uso:
 *   node scripts/dogfood.mjs --help
 *   node scripts/dogfood.mjs --date 2026-06-07 --repos /path/a,/path/b
 *   node scripts/dogfood.mjs --date 2026-06-07  # usa scripts/dogfood.repos.json
 *   node scripts/dogfood.mjs --date 2026-06-07 --run-tests
 *
 * Requiere el CLI compilado en packages/cli/dist/cli.js.
 * ESM puro, solo stdlib de Node (node:child_process, node:fs, node:path, node:crypto).
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CLI_ENTRY = join(REPO_ROOT, 'packages', 'cli', 'dist', 'cli.js');
const DEFAULT_REPOS_CONFIG = join(__dirname, 'dogfood.repos.json');
const OUTPUT_DIR = join(REPO_ROOT, 'docs', 'analysis');

// ---------------------------------------------------------------------------
// CLI arg parsing (stdlib only — no minimist/yargs)
// ---------------------------------------------------------------------------

/** @param {string[]} argv @param {string[]} names @returns {string|null} */
function argValue(argv, names) {
  for (const name of names) {
    const idx = argv.indexOf(name);
    if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
  }
  return null;
}

/** @param {string[]} argv @param {string[]} names @returns {boolean} */
function argFlag(argv, names) {
  return names.some(n => argv.includes(n));
}

const HELP = `
Usage: node scripts/dogfood.mjs [options]

Harness de dogfood para forge (SPEC-052). Corre en DRY-RUN sobre repos ajenos
(no escribe nada en ellos). Emite docs/analysis/dogfood-<fecha>.{json,md}.

Options:
  --date YYYY-MM-DD   Fecha del artefacto (requerida; si se omite usa placeholder)
  --repos <paths>     Lista de repos separados por coma (absolutos)
                      Si se omite, lee scripts/dogfood.repos.json
  --run-tests         Opcional: corre la suite de tests del repo (puede ser lento)
  -h, --help          Muestra esta ayuda

Archivo de configuración (alternativa a --repos):
  scripts/dogfood.repos.json   Array de { path, stack_esperado }
  scripts/dogfood.repos.example.json  Ejemplo commiteado (no usar rutas reales aquí)

Requerimientos:
  packages/cli/dist/cli.js debe existir (corre 'npm run build:all' en packages/cli/)
`;

// ---------------------------------------------------------------------------
// Stack detection via CLI subprocess
// ---------------------------------------------------------------------------

/**
 * Llama a `forge recommend --json` en el directorio del repo.
 * Devuelve el objeto JSON parseado o null si falla.
 * @param {string} repoPath
 * @returns {{ stack: object, recommendations: object[] } | null}
 */
function runRecommendJson(repoPath) {
  if (!existsSync(CLI_ENTRY)) return null;
  const result = spawnSync(process.execPath, [CLI_ENTRY, 'recommend', '--json'], {
    cwd: repoPath,
    encoding: 'utf-8',
    timeout: 15_000,
  });
  if (result.error || result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/**
 * Llama a `forge adopt --dry-run` en el directorio del repo.
 * Devuelve { ok: boolean, output: string, sha256: string|null }.
 * El adopt --dry-run imprime el plan pero no escribe nada.
 * @param {string} repoPath
 * @returns {{ ok: boolean, output: string, sha256: string|null }}
 */
function runAdoptDryRun(repoPath) {
  if (!existsSync(CLI_ENTRY)) return { ok: false, output: 'CLI no compilado', sha256: null };
  const result = spawnSync(
    process.execPath,
    [CLI_ENTRY, 'adopt', repoPath, '--dry-run', '--yes', '--no-wiki'],
    {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 20_000,
    },
  );
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  const ok = result.status === 0 && !result.error;
  // SHA-256 del output del plan como proxy de "manifest válido y estable"
  const sha256 = ok ? createHash('sha256').update(output).digest('hex') : null;
  return { ok, output, sha256 };
}

/**
 * Detecta si el repo tiene una suite de tests declarada.
 * Devuelve { detected: boolean, runner: string|null, command: string|null }.
 * @param {string} repoPath
 * @returns {{ detected: boolean, runner: string|null, command: string|null }}
 */
function detectTestSuite(repoPath) {
  // Node / TypeScript: package.json#scripts.test
  const pkgPath = join(repoPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const testScript = pkg?.scripts?.test;
      if (testScript && testScript !== 'echo "Error: no test specified" && exit 1') {
        return { detected: true, runner: 'npm', command: `npm test` };
      }
    } catch { /* ignore */ }
  }

  // Python: pytest.ini / pyproject.toml con [tool.pytest] / setup.cfg
  if (
    existsSync(join(repoPath, 'pytest.ini')) ||
    existsSync(join(repoPath, 'setup.cfg'))
  ) {
    return { detected: true, runner: 'pytest', command: 'pytest' };
  }
  if (existsSync(join(repoPath, 'pyproject.toml'))) {
    const pyproject = readFileSync(join(repoPath, 'pyproject.toml'), 'utf-8');
    if (/\[tool\.pytest/.test(pyproject) || /\[tool\.poetry\.scripts\]/.test(pyproject)) {
      return { detected: true, runner: 'pytest', command: 'pytest' };
    }
  }

  // PHP: composer.json con scripts.test
  if (existsSync(join(repoPath, 'composer.json'))) {
    try {
      const composer = JSON.parse(readFileSync(join(repoPath, 'composer.json'), 'utf-8'));
      if (composer?.scripts?.test) {
        return { detected: true, runner: 'composer', command: 'composer test' };
      }
    } catch { /* ignore */ }
  }

  return { detected: false, runner: null, command: null };
}

/**
 * Corre la suite de tests del repo (solo si --run-tests).
 * @param {string} repoPath
 * @param {{ runner: string|null, command: string|null }} suite
 * @returns {'green'|'red'|'skipped'}
 */
function runTestSuite(repoPath, suite) {
  if (!suite.command) return 'skipped';
  const [cmd, ...args] = suite.command.split(' ');
  const result = spawnSync(cmd, args, {
    cwd: repoPath,
    encoding: 'utf-8',
    timeout: 120_000,
    shell: true,
  });
  return result.status === 0 && !result.error ? 'green' : 'red';
}

// ---------------------------------------------------------------------------
// Stack comparison
// ---------------------------------------------------------------------------

/**
 * Compara el stack detectado con el esperado.
 * Los campos null en stack_esperado se ignoran (no se verifican).
 * @param {object} detected
 * @param {object} expected
 * @returns {{ ok: boolean, mismatches: string[] }}
 */
function compareStack(detected, expected) {
  const FIELDS = ['language', 'backend', 'frontend', 'packageManager'];
  const mismatches = [];
  for (const field of FIELDS) {
    if (expected[field] === undefined || expected[field] === null) continue;
    const detVal = detected[field] ?? null;
    const expVal = expected[field];
    if (detVal !== expVal) {
      mismatches.push(`${field}: esperado="${expVal}" detectado="${detVal ?? 'null'}"`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

// ---------------------------------------------------------------------------
// Per-repo analysis
// ---------------------------------------------------------------------------

/**
 * @typedef {object} RepoResult
 * @property {string} repo
 * @property {string} path
 * @property {object|null} stack_esperado
 * @property {object|null} stack_detectado
 * @property {boolean|null} deteccion_ok
 * @property {string[]} deteccion_mismatches
 * @property {object[]} recommendations
 * @property {boolean|null} plan_valido
 * @property {string|null} plan_sha256
 * @property {{ detected: boolean, runner: string|null, command: string|null }} tests_suite
 * @property {'green'|'red'|'skipped'|null} tests_before
 * @property {null} turns_to_green
 * @property {null} guardrail_block_rate
 * @property {string|null} error
 */

/**
 * @param {string} repoPath
 * @param {object} stackEsperado
 * @param {boolean} runTests
 * @returns {RepoResult}
 */
function analyzeRepo(repoPath, stackEsperado, runTests) {
  const repoName = repoPath.split('/').pop() ?? repoPath;

  const recommendResult = runRecommendJson(repoPath);
  const stackDetectado = recommendResult?.stack ?? null;
  const recommendations = recommendResult?.recommendations ?? [];

  let deteccionOk = null;
  let deteccionMismatches = [];
  if (stackDetectado && stackEsperado) {
    const cmp = compareStack(stackDetectado, stackEsperado);
    deteccionOk = cmp.ok;
    deteccionMismatches = cmp.mismatches;
  }

  const adoptResult = runAdoptDryRun(repoPath);
  const planValido = adoptResult.ok;
  const planSha256 = adoptResult.sha256;

  const testsSuite = detectTestSuite(repoPath);
  let testsBefore = null; // default: no corremos tests
  if (runTests && testsSuite.detected) {
    testsBefore = runTestSuite(repoPath, testsSuite);
  }

  return {
    repo: repoName,
    path: repoPath,
    stack_esperado: stackEsperado ?? null,
    stack_detectado: stackDetectado,
    deteccion_ok: deteccionOk,
    deteccion_mismatches: deteccionMismatches,
    recommendations,
    plan_valido: planValido,
    plan_sha256: planSha256,
    tests_suite: testsSuite,
    tests_before: testsBefore,
    // Campos de sesión en vivo — no los llena el harness
    turns_to_green: null,
    guardrail_block_rate: null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Output rendering
// ---------------------------------------------------------------------------

/**
 * @param {RepoResult[]} results
 * @param {string} date
 * @returns {string}
 */
function renderMarkdown(results, date) {
  const lines = [
    `# Dogfood report — ${date}`,
    '',
    '> Generado por `scripts/dogfood.mjs` (SPEC-052). Los campos `turns_to_green` y',
    '> `guardrail_block_rate` requieren sesión en vivo y se completan aparte.',
    '',
    '| repo | stack_esperado | stack_detectado | deteccion_ok | recommend (N) | plan_valido | tests_before | turns_to_green | guardrail_block_rate |',
    '|------|---------------|----------------|:------------:|:-------------:|:-----------:|:------------:|:--------------:|:--------------------:|',
  ];

  for (const r of results) {
    if (r.error) {
      lines.push(`| **${r.repo}** | — | — | — | — | — | — | — | — |`);
      lines.push(`| _error: ${r.error}_ | | | | | | | | |`);
      continue;
    }
    const esperado = r.stack_esperado
      ? (r.stack_esperado.note ?? r.stack_esperado.language ?? '—')
      : '—';
    const detectado = r.stack_detectado
      ? [r.stack_detectado.language, r.stack_detectado.backend, r.stack_detectado.frontend]
          .filter(Boolean).join('+') || '—'
      : '—';
    const detOk = r.deteccion_ok === null ? '—' : r.deteccion_ok ? 'ok' : `NO (${r.deteccion_mismatches.join('; ')})`;
    const nRecs = r.recommendations.length;
    const plan = r.plan_valido === null ? '—' : r.plan_valido ? 'ok' : 'FAIL';
    const tests = r.tests_before ?? 'no corrido';

    lines.push(
      `| **${r.repo}** | ${esperado} | ${detectado} | ${detOk} | ${nRecs} | ${plan} | ${tests} | null | null |`,
    );
  }

  lines.push('');
  lines.push('## Detalle de recomendaciones');
  lines.push('');
  for (const r of results) {
    if (r.error) continue;
    lines.push(`### ${r.repo}`);
    if (r.recommendations.length === 0) {
      lines.push('_Sin recomendaciones detectadas._');
    } else {
      for (const rec of r.recommendations) {
        lines.push(`- **[${rec.type}]** \`${rec.id}\` (${rec.category}) — ${rec.why} _(señal: ${rec.signal})_`);
      }
    }
    if (r.deteccion_mismatches.length > 0) {
      lines.push('');
      lines.push('**Mismatches de detección:**');
      for (const m of r.deteccion_mismatches) lines.push(`- ${m}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);

  if (argFlag(argv, ['-h', '--help'])) {
    process.stdout.write(HELP + '\n');
    process.exit(0);
  }

  // Verificar que el CLI está compilado
  if (!existsSync(CLI_ENTRY)) {
    console.error(`ERROR: CLI no compilado. Corré primero:\n  cd packages/cli && npm run build:all\n  (entry esperado: ${CLI_ENTRY})`);
    process.exit(1);
  }

  // Fecha
  let date = argValue(argv, ['--date']);
  if (!date) {
    console.warn('AVISO: --date no provisto. Usando placeholder "FECHA-NO-SETEADA".');
    date = 'FECHA-NO-SETEADA';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('ERROR: --date debe tener formato YYYY-MM-DD');
    process.exit(1);
  }

  const runTests = argFlag(argv, ['--run-tests']);

  // Cargar lista de repos
  /** @type {Array<{ path: string, stack_esperado?: object }>} */
  let repoEntries = [];

  const reposArg = argValue(argv, ['--repos']);
  if (reposArg) {
    repoEntries = reposArg.split(',').map(p => ({ path: resolve(p.trim()), stack_esperado: null }));
  } else if (existsSync(DEFAULT_REPOS_CONFIG)) {
    try {
      repoEntries = JSON.parse(readFileSync(DEFAULT_REPOS_CONFIG, 'utf-8'));
    } catch (err) {
      console.error(`ERROR: No se pudo parsear ${DEFAULT_REPOS_CONFIG}: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.error(
      `ERROR: No se encontró scripts/dogfood.repos.json ni se pasó --repos.\n` +
      `Copiá scripts/dogfood.repos.example.json a scripts/dogfood.repos.json y editá las rutas.`,
    );
    process.exit(1);
  }

  if (repoEntries.length === 0) {
    console.error('ERROR: La lista de repos está vacía.');
    process.exit(1);
  }

  console.log(`\nforge dogfood harness (SPEC-052) — ${date}`);
  console.log(`CLI: ${CLI_ENTRY}`);
  console.log(`Repos: ${repoEntries.length}  run-tests: ${runTests}\n`);

  // Analizar repos (try/catch por repo — uno que falla no tumba el resto)
  /** @type {RepoResult[]} */
  const results = [];

  for (const entry of repoEntries) {
    const repoPath = resolve(entry.path ?? entry);
    const repoName = repoPath.split('/').pop() ?? repoPath;
    process.stdout.write(`  Analizando ${repoName} ...`);

    if (!existsSync(repoPath)) {
      process.stdout.write(' NO EXISTE\n');
      results.push({
        repo: repoName,
        path: repoPath,
        stack_esperado: entry.stack_esperado ?? null,
        stack_detectado: null,
        deteccion_ok: null,
        deteccion_mismatches: [],
        recommendations: [],
        plan_valido: null,
        plan_sha256: null,
        tests_suite: { detected: false, runner: null, command: null },
        tests_before: null,
        turns_to_green: null,
        guardrail_block_rate: null,
        error: 'directorio no encontrado',
      });
      continue;
    }

    try {
      const result = analyzeRepo(repoPath, entry.stack_esperado ?? null, runTests);
      results.push(result);
      const status = result.deteccion_ok === true ? 'ok' : result.deteccion_ok === false ? 'mismatch' : 'sin stack_esperado';
      process.stdout.write(` ${status} | plan=${result.plan_valido ? 'ok' : 'FAIL'} | recs=${result.recommendations.length}\n`);
    } catch (err) {
      process.stdout.write(` ERROR\n`);
      results.push({
        repo: repoName,
        path: repoPath,
        stack_esperado: entry.stack_esperado ?? null,
        stack_detectado: null,
        deteccion_ok: null,
        deteccion_mismatches: [],
        recommendations: [],
        plan_valido: null,
        plan_sha256: null,
        tests_suite: { detected: false, runner: null, command: null },
        tests_before: null,
        turns_to_green: null,
        guardrail_block_rate: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Emitir artefactos
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = join(OUTPUT_DIR, `dogfood-${date}.json`);
  const mdPath = join(OUTPUT_DIR, `dogfood-${date}.md`);

  const jsonPayload = {
    generated_by: 'scripts/dogfood.mjs',
    spec: 'SPEC-052',
    date,
    cli_entry: CLI_ENTRY,
    run_tests: runTests,
    repos: results,
  };

  writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf-8');
  writeFileSync(mdPath, renderMarkdown(results, date), 'utf-8');

  const ok = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;
  console.log(`\nArtefactos emitidos:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
  console.log(`\nResumen: ${ok} repos analizados, ${failed} con error.`);
  if (failed > 0) {
    console.log('  Repos con error:');
    for (const r of results.filter(r => r.error)) {
      console.log(`    - ${r.repo}: ${r.error}`);
    }
  }
  console.log('');
}

main().catch(err => {
  console.error('ERROR fatal:', err);
  process.exit(1);
});
