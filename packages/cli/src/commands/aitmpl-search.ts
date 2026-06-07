import { bold, dim, green, cyan, gray } from '../ui/colors.js';
import { box } from '../ui/box.js';
import { resolveForgeRoot } from '../lib/paths.js';
import { getUnifiedCatalog } from '../lib/catalog-install.js';
import { scoreCatalog, categoriesOf, CATEGORY_LABELS, type CatalogItem } from '../lib/catalog-unified.js';

const HELP = `Usage: forge aitmpl-search <query> [options]

Search the unified offline catalog: forge skills/profiles/templates (installable)
plus curated frameworks, MCP servers, tools and resources. Works fully offline.

Arguments:
  <query>     Search term (matches name, description, tags, language, category)

Options:
  -c, --category <cat>   Filter by category:
                         skill, profile, template, framework, mcp-server, tool, resource
  --limit <n>            Max results (default: 20)
  --json                 Output results as JSON
  --list-categories      List available categories and item counts
  -h, --help             Show this help

Examples:
  forge aitmpl-search fastapi
  forge aitmpl-search "mcp postgres"
  forge aitmpl-search --category mcp-server
  forge aitmpl-search --category profile
  forge aitmpl-search rails --json
  forge aitmpl-search --list-categories
`;

/** Resolve the forge root for installable items; null if not found (curated still works). */
function forgeRootOrNull(): string | null {
  try {
    return resolveForgeRoot();
  } catch {
    return null;
  }
}

function wrapText(text: string, width: number, indent: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(indent + current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(indent + current);
  return lines;
}

function printResults(results: CatalogItem[]): void {
  if (results.length === 0) {
    console.log(dim('Sin resultados. Prueba con otro término o usa --list-categories.'));
    return;
  }

  results.forEach((item, idx) => {
    const cat = CATEGORY_LABELS[item.category] ?? item.category;
    const num = String(idx + 1).padStart(2, ' ');

    const flag = item.installable ? green('● instalable') : gray('○ manual');
    console.log(`${gray(num + '.')} ${bold(item.label)}  ${flag}`);

    if (item.description) {
      for (const line of wrapText(item.description, 68, '     ')) {
        console.log(dim(line));
      }
    }

    if (item.tags.length > 0) {
      const tagStr = item.tags
        .slice(0, 8)
        .map(t => cyan('#' + t))
        .join('  ');
      console.log(`     ${tagStr}`);
    }

    const metaParts = [`[${cat}]`];
    if (item.language) metaParts.push(item.language);
    console.log(`     ${gray(metaParts.join('  '))}`);
    if (item.installable) {
      console.log(`     ${dim('forge panel → Catálogo para instalar')}`);
    } else if (item.url) {
      console.log(`     ${green(item.url)}`);
    }
    console.log('');
  });
}

function getOptionValue(args: string[], names: string[]): string | undefined {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  }
  return undefined;
}

export async function aitmplSearch(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const jsonMode = args.includes('--json');

  // The unified catalog is the single source of truth (SPEC-050).
  const catalog = getUnifiedCatalog(forgeRootOrNull(), process.cwd());
  const categories = categoriesOf(catalog);

  if (args.includes('--list-categories')) {
    if (jsonMode) {
      const data = categories.map(cat => ({
        category: cat,
        label: CATEGORY_LABELS[cat] ?? cat,
        count: catalog.filter(item => item.category === cat).length,
      }));
      console.log(JSON.stringify({ categories: data, total: catalog.length }, null, 2));
      return 0;
    }
    console.log(cyan(bold('Categorías disponibles')) + '\n');
    for (const cat of categories) {
      const count = catalog.filter(item => item.category === cat).length;
      const label = CATEGORY_LABELS[cat] ?? cat;
      console.log(`  ${bold(cat.padEnd(16))} ${dim(label)} ${gray(`(${count} items)`)}`);
    }
    console.log('\n' + box('Total catálogo', [`${catalog.length} items`]));
    return 0;
  }

  const category = getOptionValue(args, ['--category', '-c']);
  if (category && !categories.includes(category)) {
    console.error(`ERROR: categoría desconocida '${category}'. Válidas: ${categories.join(', ')}`);
    return 1;
  }

  const limitRaw = getOptionValue(args, ['--limit']);
  let limit = 20;
  if (limitRaw !== undefined) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      console.error(`ERROR: --limit debe ser un entero positivo`);
      return 1;
    }
    limit = parsed;
  }

  const flagsWithValue = new Set(['--category', '-c', '--limit']);
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (flagsWithValue.has(arg)) {
      i++; // skip the value
      continue;
    }
    if (arg.startsWith('-')) continue; // skip other flags (--json, etc.)
    positional.push(arg);
  }
  const query = positional.join(' ');

  if (!query && !category) {
    process.stdout.write(HELP);
    return 1;
  }

  const results = scoreCatalog(catalog, query, { category, limit });

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return 0;
  }

  console.log(cyan(bold('forge aitmpl-search')) + dim(` — ${results.length} resultado(s) (catálogo unificado)`) + '\n');
  printResults(results);

  return 0;
}
