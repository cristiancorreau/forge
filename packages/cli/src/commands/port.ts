/**
 * `forge port <runtime>` — port a forge project to another AI coding runtime,
 * and report exactly how much of the config carries over (SPEC-073).
 *
 * This is forge's concrete answer to "how portable is my setup between Claude
 * Code, Codex, Cursor, …?": project.yaml is the single source of truth, every
 * runtime's native config is *generated*, and this command quantifies the gap.
 *
 *   forge port codex            # generate Codex native config + portability report
 *   forge port cursor --report  # only print/write the portability matrix
 *   forge port codex --json     # machine-readable matrix (stable, snapshot-safe)
 *
 * Generation of the native files is delegated to `forge generate` (same code
 * path, full rich install: hooks, .githooks fallback, .forge/state). This
 * command adds the portability matrix and writes the report under .forge/port/.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';
import { getRuntime, runtimeIds } from '../lib/generators/registry.js';
import { portabilityMatrix, renderPortabilityReport, bucketIcon } from '../lib/portability.js';
import { generate } from './generate.js';
import { VERSION } from '../version.js';
import { bold, dim, green, red, yellow, gray, cyan } from '../ui/colors.js';

const ALL_RUNTIME_IDS = runtimeIds();

const HELP = `Usage: forge port <runtime> [options]

Port a forge project to another AI coding runtime and report how much config carries over.
project.yaml is the single source of truth; native config is generated, not hand-written.

Runtimes:
  ${ALL_RUNTIME_IDS.join(', ')}

Options:
  --report     Only compute the portability matrix (do NOT write native config)
  --json       Print the portability matrix as stable JSON (implies --report)
  --dry-run    Show what would be generated without writing files
  --force      Overwrite existing files without prompting
  -h, --help   Show this help

Classification:
  portable  Same artifact serves every runtime, untouched (project.yaml, docs/specs/, MCP)
  adapted   Regenerated automatically per runtime; same semantics, native format
  vendor    No equivalent in the target; manual setup or lost (runtime settings/secrets)

Examples:
  forge port codex                 # generate Codex config + report
  forge port cursor --report       # matrix only, write .forge/port/cursor-report.md
  forge port codex --json          # machine-readable matrix
`;

const BUCKET_COLOR = {
  portable: green,
  adapted: yellow,
  vendor: red,
} as const;

export async function port(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const jsonMode = args.includes('--json');
  const reportOnly = args.includes('--report') || jsonMode;
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const target = args.find(a => !a.startsWith('-'));

  if (!target) {
    process.stderr.write('forge port: falta el runtime destino. Ver `forge port --help`.\n');
    return 1;
  }

  const descriptor = getRuntime(target);
  if (!descriptor) {
    process.stderr.write(`forge port: runtime desconocido "${target}".\n  Disponibles: ${ALL_RUNTIME_IDS.join(', ')}\n`);
    return 1;
  }

  const yamlPath = findProjectYaml(process.cwd());
  if (!yamlPath) {
    process.stderr.write('forge port: no se encontró project.yaml\n  forge init para inicializar el proyecto.\n');
    return 1;
  }

  let config: ReturnType<typeof loadProjectYaml>;
  try {
    config = loadProjectYaml(yamlPath);
  } catch (e: unknown) {
    process.stderr.write(`forge port: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }

  const root = join(yamlPath, '..');
  const projectName = config.project.name ?? 'Proyecto';
  const matrix = portabilityMatrix(config, descriptor);

  // Machine-readable: emit and stop.
  if (jsonMode) {
    process.stdout.write(JSON.stringify(matrix, null, 2) + '\n');
    return 0;
  }

  // Generate the target's native config unless --report.
  let genExit = 0;
  if (!reportOnly) {
    const genArgs = ['--runtime', target];
    if (dryRun) genArgs.push('--dry-run');
    if (force) genArgs.push('--force');
    genExit = await generate(genArgs);
  }

  // Portability report (Markdown), written under .forge/port/ unless dry-run.
  const report = renderPortabilityReport(matrix, projectName, VERSION);
  const reportRel = join('.forge', 'port', `${target}-report.md`);
  let reportStatus = 'DRY-RUN';
  if (!dryRun) {
    const reportDir = join(root, '.forge', 'port');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(root, reportRel), report, 'utf-8');
    reportStatus = 'OK';
  }

  // Terminal summary.
  console.log(cyan(bold('forge port')) + dim(` — ${projectName} → ${descriptor.label}`) + '\n');
  for (const d of matrix.dimensions) {
    const color = BUCKET_COLOR[d.portability];
    const icon = color(bucketIcon(d.portability).padEnd(2));
    console.log(`  [${icon}] ${d.dimension.padEnd(34)} ${gray(d.portability)}`);
  }
  const s = matrix.summary;
  console.log('');
  console.log(
    `  ${green(`${s.portable} portable`)}  ·  ${yellow(`${s.adapted} adaptada(s)`)}  ·  ${red(`${s.vendor} vendor-specific`)}  (de ${s.total})`,
  );
  console.log('');
  if (reportOnly) {
    console.log(dim(`  Reporte: ${reportStatus === 'OK' ? reportRel : '(dry-run, no escrito)'}`));
  } else {
    console.log(dim(`  Config nativa: ${matrix.surfaces.join(', ') || descriptor.label}`));
    console.log(dim(`  Reporte: ${reportStatus === 'OK' ? reportRel : '(dry-run, no escrito)'}`));
    console.log(dim(`  Sugerencia: agrega "${target}" a runtimes.active en project.yaml para fijar el destino.`));
  }
  console.log('');

  return genExit;
}
