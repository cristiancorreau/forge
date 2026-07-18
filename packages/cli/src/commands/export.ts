/**
 * `forge export` — emite el modelo resuelto del proyecto (SPEC-083 P2).
 *
 * Con --json imprime por stdout el manifiesto machine-readable que valida
 * contra export.schema.json (@cristiancorreau/forge-schemas,
 * $id forge://schemas/v4/export). Sin --json, un resumen humano corto.
 *
 * Exit codes: 0 = ok, 1 = error de ejecución (sin project.yaml, YAML inválido).
 */
import { buildExportModel } from '../lib/export-model.js';
import { bold, dim, cyan } from '../ui/colors.js';

const HELP = `Usage: forge export [options]

Emite el modelo resuelto del proyecto: agentes + tools + skills + comandos +
MCP servers por runtime, a partir de project.yaml y los archivos instalados.

Options:
  --json      Salida JSON estable (valida contra export.schema.json, schemaVersion "1")
  -h, --help  Muestra esta ayuda

Exit codes:
  0  export generado
  1  error de ejecución (sin project.yaml o project.yaml inválido)
`;

export async function exportCmd(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  const jsonMode = args.includes('--json');

  let model: ReturnType<typeof buildExportModel>;
  try {
    model = buildExportModel(process.cwd());
  } catch (e: unknown) {
    process.stderr.write(`forge export: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }

  if (jsonMode) {
    process.stdout.write(JSON.stringify(model, null, 2) + '\n');
    return 0;
  }

  // Resumen humano corto.
  console.log(cyan(bold('forge export')) + dim(` — ${model.project.name}`) + '\n');
  console.log(`  ${bold('Runtimes:')}    ${model.project.runtimes.join(', ') || dim('(ninguno)')}`);
  console.log(`  ${bold('Profiles:')}    ${model.project.profiles.join(', ') || dim('(ninguno)')}`);
  console.log(`  ${bold('Agentes:')}     ${model.agents.length}`);
  console.log(`  ${bold('Comandos:')}    ${model.commands.length}`);
  console.log(`  ${bold('Skills:')}      ${model.skills.length}`);
  console.log(`  ${bold('MCP servers:')} ${model.mcpServers.length}`);
  console.log('\n' + dim('  Usa --json para el manifiesto completo (export.schema.json).'));
  return 0;
}
