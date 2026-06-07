import { bold, dim, green, cyan, gray, yellow } from '../ui/colors.js';
import { box } from '../ui/box.js';
import { resolveForgeRoot } from '../lib/paths.js';
import { installItem } from '../lib/catalog-install.js';
import { CATEGORY_LABELS } from '../lib/catalog-unified.js';
import {
  recommend as runRecommend,
  groupRecommendations,
  manualInstallCommand,
} from '../lib/recommend.js';

const HELP = `Usage: forge recommend [options]

Read-only advisor: analiza el stack detectado y recomienda los mejores items del
catálogo de forge (skills/profiles instalables + MCP servers/frameworks), con un
WHY anclado en la señal de detección. No escribe nada salvo que pases --apply.

Options:
  -c, --category <cat>   Filtra por categoría (profile, mcp-server, framework, ...)
  --top <n>              Máximo por categoría (default: 2)
  --apply                Instala los items instalables recomendados (resto: manual)
  --json                 Salida como JSON
  -h, --help             Muestra esta ayuda

Examples:
  forge recommend
  forge recommend --category profile
  forge recommend --json
  forge recommend --apply
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

export async function recommend(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const jsonMode = args.includes('--json');
  const apply = args.includes('--apply');
  const category = getOptionValue(args, ['--category', '-c']);
  const topRaw = getOptionValue(args, ['--top']);
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
  const { stack, recommendations } = runRecommend(forgeRoot, root);
  const groups = groupRecommendations(recommendations, topN, category);
  const flat = Object.values(groups).flat();

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          stack: {
            language: stack.language,
            backend: stack.backend,
            frontend: stack.frontend,
            mobile: stack.mobile,
            database: stack.database,
            orm: stack.orm,
            testing: stack.testing,
            hasDocker: stack.hasDocker,
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

  console.log(cyan(bold('forge recommend')) + dim(' — read-only (usa --apply para instalar)') + '\n');

  if (flat.length === 0) {
    console.log(dim('No detecté señales accionables en este proyecto.'));
    console.log(dim('Probá ' + cyan('forge init') + dim(' o ') + cyan('forge adopt') + dim(' para configurarlo.')));
    return 0;
  }

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

  if (!apply) {
    const installable = flat.filter(r => r.item.installable).length;
    console.log(
      box(cyan('Read-only'), [
        `${flat.length} recomendación(es); ${installable} instalable(s) por forge.`,
        'Corré con ' + cyan('--apply') + ' para instalar los instalables.',
      ]),
    );
    return 0;
  }

  // --apply: install the installable ones; the rest stay manual.
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
