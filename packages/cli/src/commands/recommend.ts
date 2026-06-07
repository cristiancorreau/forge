import { writeFileSync, readFileSync, existsSync } from 'fs';
import * as p from '@clack/prompts';
import { bold, dim, green, cyan, gray, yellow } from '../ui/colors.js';
import { box } from '../ui/box.js';
import { resolveForgeRoot } from '../lib/paths.js';
import { installItem } from '../lib/catalog-install.js';
import { CATEGORY_LABELS } from '../lib/catalog-unified.js';
import {
  recommend as runRecommend,
  groupRecommendations,
  manualInstallCommand,
  buildBundle,
  type RecommendBundle,
} from '../lib/recommend.js';

const HELP = `Usage: forge recommend [options]

Read-only advisor: analiza el stack detectado y recomienda los mejores items del
catálogo de forge (skills/profiles instalables + MCP servers/frameworks), con un
WHY anclado en la señal de detección. No escribe nada salvo que pases --apply.

Options:
  -c, --category <cat>   Filtra por categoría (profile, mcp-server, framework, ...)
  --top <n>              Máximo por categoría (default: 2)
  --intent "<texto>"     Describe tu objetivo; se registra en el bundle (sin LLM)
  --interactive          Flujo conversacional: pide intent, confirma, muestra recos
  --export <file>        Escribe el RecommendBundle como JSON a <file>
  --apply [file]         Sin argumento: instala las recos en vivo. Con <file>: lee
                         el bundle JSON y aplica solo los items installable:true
  --json                 Salida como JSON (recos en vivo)
  -h, --help             Muestra esta ayuda

Examples:
  forge recommend
  forge recommend --intent "quiero CI con tests end-to-end"
  forge recommend --interactive
  forge recommend --export bundle.json
  forge recommend --apply bundle.json
  forge recommend --apply
  forge recommend --category profile
  forge recommend --json
`;

function getOptionValue(args: string[], names: string[]): string | undefined {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  }
  return undefined;
}

function forgeRootOrNull(): string | null {
  try {
    return resolveForgeRoot();
  } catch {
    return null;
  }
}

/** Print recommendations grouped by category. */
function printGroups(
  groups: Record<string, import('../lib/recommend.js').Recommendation[]>,
): void {
  for (const cat of Object.keys(groups).sort()) {
    const label = CATEGORY_LABELS[cat] ?? cat;
    console.log(bold('▸ ' + label));
    for (const r of groups[cat]) {
      const flag = r.item.installable ? green('● instalable') : gray('○ manual');
      console.log(`  ${bold(r.item.label)}  ${flag}`);
      console.log(`    ${dim('por qué:')} ${r.why} ${gray('(' + r.signal + ')')}`);
      if (!r.item.installable) {
        const cmd = manualInstallCommand(r.item);
        if (cmd) console.log(`    ${dim('instalar:')} ${gray(cmd)}`);
        else if (r.item.url) console.log(`    ${gray(r.item.url)}`);
      }
    }
    console.log('');
  }
}

/** Apply a bundle from a JSON file: install installable items, list manual ones. */
async function applyBundleFile(
  bundlePath: string,
  root: string,
  forgeRoot: string | null,
): Promise<number> {
  if (!existsSync(bundlePath)) {
    console.error(`ERROR: no se encontró el bundle: ${bundlePath}`);
    return 1;
  }
  let bundle: RecommendBundle;
  try {
    bundle = JSON.parse(readFileSync(bundlePath, 'utf-8')) as RecommendBundle;
  } catch {
    console.error(`ERROR: el bundle no es JSON válido: ${bundlePath}`);
    return 1;
  }

  if (!bundle.items || !Array.isArray(bundle.items)) {
    console.error('ERROR: bundle sin campo "items" válido.');
    return 1;
  }

  if (bundle.createdFrom?.intent) {
    console.log(cyan(bold('forge recommend --apply')) + dim(` — bundle: ${bundlePath}`));
    console.log(dim('intent: ') + bundle.createdFrom.intent + '\n');
  } else {
    console.log(cyan(bold('forge recommend --apply')) + dim(` — bundle: ${bundlePath}\n`));
  }

  console.log(bold('--- Aplicando bundle (solo installable: true) ---'));
  let installed = 0;
  let failed = 0;

  for (const entry of bundle.items) {
    if (!entry.installable) {
      // Non-installable: show manual install info from installSpec if present.
      const cmd = entry.installSpec
        ? `${entry.installSpec.command} ${entry.installSpec.args.join(' ')}`.trim()
        : null;
      console.log(
        `  ${gray('○')} ${entry.id} ${dim('(manual)')}${cmd ? gray('  → ' + cmd) : ''}`,
      );
      continue;
    }

    // installable items: delegate to the reversible installItem().
    const res = installItem(root, forgeRoot, { type: entry.type as Parameters<typeof installItem>[2]['type'], id: entry.id });
    if (res.ok) {
      installed += res.alreadyInstalled ? 0 : 1;
      const mark = res.alreadyInstalled ? dim('= ya estaba') : green('✓ instalado');
      console.log(`  ${mark} ${entry.id}`);
    } else {
      failed++;
      console.log(`  ${yellow('✗')} ${entry.id} ${dim('— ' + res.message)}`);
    }
  }

  console.log('\n' + box(green('Aplicado'), [`${installed} instalado(s), ${failed} fallido(s).`]));
  return failed > 0 ? 1 : 0;
}

/** Interactive flow using @clack/prompts. */
async function runInteractive(root: string, forgeRoot: string | null, topN: number): Promise<number> {
  p.intro(cyan(bold('forge recommend')) + dim(' — modo interactivo'));

  // Step 1: capture intent.
  const intentAnswer = await p.text({
    message: '¿Cuál es tu objetivo? (describí qué querés lograr con tu proyecto)',
    placeholder: 'ej: quiero CI con tests end-to-end y un agente de code review',
    validate(val) {
      if (!val.trim()) return 'El intent no puede estar vacío.';
    },
  });

  if (p.isCancel(intentAnswer)) {
    p.cancel('Cancelado.');
    return 0;
  }
  const intent = (intentAnswer as string).trim();

  // Step 2: confirm understanding before running the engine.
  const confirmed = await p.confirm({
    message: `Entendido: "${intent}". ¿Procedo a buscar recomendaciones en el catálogo?`,
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Cancelado.');
    return 0;
  }

  // Step 3: run the single recommend engine (no scoring nuevo).
  const spinner = p.spinner();
  spinner.start('Analizando stack del proyecto...');
  const result = runRecommend(forgeRoot, root);
  const groups = groupRecommendations(result.recommendations, topN);
  const flat = Object.values(groups).flat();
  spinner.stop(`${flat.length} recomendación(es) encontrada(s).`);

  if (flat.length === 0) {
    p.note(
      'No detecté señales accionables en este proyecto.\nProbá forge init o forge adopt para configurarlo.',
      'Sin recomendaciones',
    );
    p.outro('Listo.');
    return 0;
  }

  // Step 4: show grouped recommendations.
  console.log('');
  printGroups(groups);

  // Step 5: offer to export the bundle.
  const wantExport = await p.confirm({
    message: '¿Querés exportar el bundle como JSON (para aplicar después con --apply)?',
    initialValue: false,
  });

  if (p.isCancel(wantExport)) {
    p.outro('Listo (sin exportar).');
    return 0;
  }

  if (wantExport) {
    const fileAnswer = await p.text({
      message: '¿Nombre del archivo de salida?',
      placeholder: 'bundle.json',
      initialValue: 'bundle.json',
    });

    if (p.isCancel(fileAnswer)) {
      p.outro('Cancelado.');
      return 0;
    }

    const outFile = ((fileAnswer as string) || 'bundle.json').trim();
    const bundle = buildBundle(result, intent);
    writeFileSync(outFile, JSON.stringify(bundle, null, 2), 'utf-8');
    p.note(
      `Bundle guardado en: ${outFile}\nAplicá con: forge recommend --apply ${outFile}`,
      'Exportado',
    );
  }

  p.outro(cyan('forge recommend') + dim(' completado.'));
  return 0;
}

export async function recommend(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const jsonMode = args.includes('--json');
  const interactive = args.includes('--interactive');
  const category = getOptionValue(args, ['--category', '-c']);
  const topRaw = getOptionValue(args, ['--top']);
  const intentArg = getOptionValue(args, ['--intent']);
  const exportFile = getOptionValue(args, ['--export']);

  let topN = 2;
  if (topRaw !== undefined) {
    const parsed = Number.parseInt(topRaw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      console.error('ERROR: --top debe ser un entero positivo');
      return 1;
    }
    topN = parsed;
  }

  const root = process.cwd();
  const forgeRoot = forgeRootOrNull();

  // Detect --apply: with or without a file argument.
  const applyIdx = args.indexOf('--apply');
  const hasApply = applyIdx !== -1;
  // Determine if the next token after --apply looks like a file path (not another flag).
  const applyNext = hasApply && applyIdx + 1 < args.length ? args[applyIdx + 1] : undefined;
  const applyFile = applyNext && !applyNext.startsWith('-') ? applyNext : undefined;

  // --apply <file>: read bundle and apply.
  if (hasApply && applyFile) {
    return applyBundleFile(applyFile, root, forgeRoot);
  }

  // --interactive mode.
  if (interactive) {
    return runInteractive(root, forgeRoot, topN);
  }

  // Standard engine call.
  const result = runRecommend(forgeRoot, root);
  const groups = groupRecommendations(result.recommendations, topN, category);
  const flat = Object.values(groups).flat();

  // --json output.
  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          stack: {
            language: result.stack.language,
            backend: result.stack.backend,
            frontend: result.stack.frontend,
            mobile: result.stack.mobile,
            database: result.stack.database,
            orm: result.stack.orm,
            testing: result.stack.testing,
            hasDocker: result.stack.hasDocker,
          },
          recommendations: flat.map(r => ({
            type: r.item.type,
            id: r.item.id,
            label: r.item.label,
            category: r.item.category,
            installable: r.item.installable,
            why: r.why,
            signal: r.signal,
            installCommand: r.item.installable ? null : manualInstallCommand(r.item),
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  // Standard text output header.
  const intentDisplay = intentArg ? dim(` — intent: "${intentArg}"`) : dim(' — read-only (usa --apply para instalar)');
  console.log(cyan(bold('forge recommend')) + intentDisplay + '\n');

  if (flat.length === 0) {
    console.log(dim('No detecté señales accionables en este proyecto.'));
    console.log(dim('Probá ' + cyan('forge init') + dim(' o ') + cyan('forge adopt') + dim(' para configurarlo.')));
    return 0;
  }

  printGroups(groups);

  // --export: write the bundle to a file.
  if (exportFile) {
    const bundle = buildBundle(result, intentArg);
    writeFileSync(exportFile, JSON.stringify(bundle, null, 2), 'utf-8');
    console.log(box(cyan('Bundle exportado'), [`Archivo: ${exportFile}`, `Aplicá con: forge recommend --apply ${exportFile}`]));
    return 0;
  }

  // --apply (live, no file): install installable items directly.
  if (hasApply) {
    console.log(bold('--- Aplicando (solo instalables) ---'));
    let installed = 0;
    let failed = 0;
    for (const r of flat) {
      if (!r.item.installable) {
        const cmd = manualInstallCommand(r.item);
        console.log(`  ${gray('○')} ${r.item.label} ${dim('(manual)')}${cmd ? gray('  → ' + cmd) : ''}`);
        continue;
      }
      const res = installItem(root, forgeRoot, { type: r.item.type, id: r.item.id });
      if (res.ok) {
        installed += res.alreadyInstalled ? 0 : 1;
        const mark = res.alreadyInstalled ? dim('= ya estaba') : green('✓ instalado');
        console.log(`  ${mark} ${r.item.label}`);
      } else {
        failed++;
        console.log(`  ${yellow('✗')} ${r.item.label} ${dim('— ' + res.message)}`);
      }
    }
    console.log('\n' + box(green('Aplicado'), [`${installed} instalado(s), ${failed} fallido(s).`]));
    return failed > 0 ? 1 : 0;
  }

  // Read-only footer.
  const installable = flat.filter(r => r.item.installable).length;
  console.log(
    box(cyan('Read-only'), [
      `${flat.length} recomendación(es); ${installable} instalable(s) por forge.`,
      'Corré con ' + cyan('--apply') + ' para instalar los instalables.',
      'Corré con ' + cyan('--export <file>') + ' para guardar el bundle.',
      'Corré con ' + cyan('--interactive') + ' para el flujo conversacional.',
    ]),
  );
  return 0;
}
