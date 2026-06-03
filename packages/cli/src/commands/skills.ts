import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';
import { bold, dim, green, cyan, gray, icons } from '../ui/colors.js';
import { box } from '../ui/box.js';
import { SKILLS, type SkillInfo } from '../lib/catalog.js';

const HELP = `Usage: forge skills [options]

List the forge skills available, grouped by category. If a project.yaml is
found, the skills enabled in config (skills:) are marked with a ${icons.ok}.

Options:
  --active    Show only the skills enabled in project.yaml
  --json      Output results as JSON
  -h, --help  Show this help
`;

interface SkillRow extends SkillInfo {
  active: boolean;
}

/** Read the active skill ids from project.yaml (skills:), normalising slashes. */
function loadActiveSkills(root: string): { ids: Set<string>; yamlPath: string | null } {
  const yamlPath = findProjectYaml(root);
  if (!yamlPath) return { ids: new Set(), yamlPath: null };
  try {
    const config = loadProjectYaml(yamlPath);
    const raw = config.skills ?? [];
    const ids = new Set(raw.map(s => s.replace(/^\//, '')));
    return { ids, yamlPath };
  } catch {
    return { ids: new Set(), yamlPath };
  }
}

export async function skills(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const jsonMode = args.includes('--json');
  const activeOnly = args.includes('--active');

  const root = process.cwd();
  const { ids: activeIds, yamlPath } = loadActiveSkills(root);

  let rows: SkillRow[] = SKILLS.map(s => ({ ...s, active: activeIds.has(s.id) }));
  if (activeOnly) rows = rows.filter(r => r.active);

  if (jsonMode) {
    console.log(JSON.stringify({
      projectYaml: yamlPath,
      total: rows.length,
      active: rows.filter(r => r.active).length,
      skills: rows,
    }, null, 2));
    return 0;
  }

  console.log(cyan(bold('forge skills')) + '\n');

  if (rows.length === 0) {
    console.log(dim(activeOnly
      ? '  No hay skills activas en project.yaml.'
      : '  No hay skills en el catálogo.'));
    return 0;
  }

  // Group by category, preserving catalog order of first appearance.
  const categories: string[] = [];
  const byCategory = new Map<string, SkillRow[]>();
  for (const row of rows) {
    if (!byCategory.has(row.category)) {
      byCategory.set(row.category, []);
      categories.push(row.category);
    }
    byCategory.get(row.category)!.push(row);
  }

  const commandWidth = Math.max(...rows.map(r => r.command.length));

  for (const category of categories) {
    console.log(bold(category));
    for (const row of byCategory.get(category)!) {
      const mark = row.active ? icons.ok : gray('·');
      const command = cyan(row.command.padEnd(commandWidth));
      console.log(`  ${mark} ${command}  ${row.purpose}`);
      console.log(`  ${' '.repeat(2)}${' '.repeat(commandWidth)}  ${dim(row.trigger)}`);
    }
    console.log('');
  }

  const activeCount = rows.filter(r => r.active).length;
  const summary = yamlPath
    ? `${rows.length} skill(s) · ${green(String(activeCount) + ' activa(s)')} en ${yamlPath}`
    : `${rows.length} skill(s) en el catálogo · ${dim('sin project.yaml — ninguna marcada como activa')}`;
  console.log(box('Catálogo de skills', [summary]));

  return 0;
}
