import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import yaml from 'js-yaml';
import { findProjectYaml } from '../lib/yaml.js';
import { bold, dim, green, red, yellow, cyan, gray, icons } from '../ui/colors.js';
import { box } from '../ui/box.js';

const HELP = `Usage: forge migrate [options]

Migrate project.yaml from the v1 schema to v2. Detects the legacy format,
appends the new v2 sections (mode, deploy fields, mcp, github, rules, scripts)
preserving every existing value, and reports the changes.

Options:
  --dry-run   Show the diff without writing changes
  --backup    Create project.yaml.bak before modifying
  -h, --help  Show this help
`;

type YamlRecord = Record<string, unknown>;

function loadYamlRaw(path: string): { data: YamlRecord; raw: string } {
  const raw = readFileSync(path, 'utf-8');
  const parsed = yaml.load(raw);
  const data = parsed && typeof parsed === 'object' ? (parsed as YamlRecord) : {};
  return { data, raw };
}

/**
 * Detects whether the project.yaml is v1 or v2.
 * Criterion: if it has 'rules' OR 'mcp' OR 'github' OR 'project.mode' -> v2.
 */
function detectVersion(data: YamlRecord): '1' | '2' {
  if ('rules' in data || 'mcp' in data || 'github' in data) return '2';
  const project = (data['project'] as YamlRecord | undefined) ?? {};
  if ('mode' in project) return '2';
  return '1';
}

/**
 * Builds the full v2 YAML. Strategy: append a schema_version header and the
 * new sections at the end, preserving the original content. Sections that
 * already exist are merged intelligently to avoid duplication.
 */
function buildV2Yaml(data: YamlRecord, raw: string): string {
  const existingSections = new Set(Object.keys(data));
  const lines: string[] = [];

  // Header
  lines.push('# ---------------------------------------------------------------------------');
  lines.push('# schema_version: "2"');
  lines.push('# Las siguientes secciones fueron agregadas por forge migrate');
  lines.push('# ---------------------------------------------------------------------------');
  lines.push('');

  const project = (data['project'] as YamlRecord | undefined) ?? {};
  const needsProjectMode = !('mode' in project);

  const agents = (data['agents'] as YamlRecord | undefined) ?? {};
  const needsAgentsByRole = existingSections.has('agents') && !('by_role' in agents);

  const needsMcp = !existingSections.has('mcp');
  const needsGithub = !existingSections.has('github');
  const needsRules = !existingSections.has('rules');
  const needsScripts = !existingSections.has('scripts');

  // --- project.mode patch ---
  if (needsProjectMode) {
    lines.push("# ACCIÓN REQUERIDA: Agrega 'mode' a la sección project arriba.");
    lines.push('# Valores: startup | standard | enterprise');
    lines.push('# Ejemplo:');
    lines.push('#   project:');
    lines.push('#     mode: "standard"');
    lines.push('');
  }

  // --- agents.by_role ---
  if (needsAgentsByRole) {
    lines.push('# nuevo en v2 — agregar bajo la sección agents existente:');
    lines.push('# agents:');
    lines.push('#   by_role:');
    lines.push('#     orchestrator: claude-opus-4-7');
    lines.push('#     senior-backend: claude-sonnet-4-6');
    lines.push('');
  }

  // --- deploy (new v2 fields) ---
  const deployRaw = data['deploy'];
  const deploy = deployRaw && typeof deployRaw === 'object' ? (deployRaw as YamlRecord) : {};
  const existingDeployKeys = new Set(Object.keys(deploy));
  const deployNewFields: string[] = [];

  if (!existingDeployKeys.has('project_id')) {
    deployNewFields.push('  project_id: null              # ID del proyecto en la plataforma (ej: prj_xxx en Vercel)');
  }
  if (!existingDeployKeys.has('production_url')) {
    deployNewFields.push('  production_url: null          # https://mi-proyecto.vercel.app');
  }
  if (!existingDeployKeys.has('smoke_tests')) {
    deployNewFields.push('  smoke_tests: []               # Tests de humo post-deploy');
    deployNewFields.push('  # Ejemplo de smoke test:');
    deployNewFields.push('  # smoke_tests:');
    deployNewFields.push('  #   - url: /api/health');
    deployNewFields.push('  #     expect_status: 200');
    deployNewFields.push('  #     expect_json:');
    deployNewFields.push('  #       status: ok');
  }

  if (deployNewFields.length > 0) {
    if (existingSections.has('deploy')) {
      lines.push('# nuevo en v2 — campos adicionales para la sección deploy existente:');
      lines.push('# (agregar manualmente bajo la sección deploy arriba)');
      for (const field of deployNewFields) {
        lines.push('# ' + field.trimStart());
      }
    } else {
      lines.push('');
      lines.push('deploy:  # nuevo en v2');
      if (!existingDeployKeys.has('provider')) {
        lines.push('  provider: null              # vercel | railway | fly | aws | github-actions | custom | null');
      }
      lines.push(...deployNewFields);
    }
    lines.push('');
  }

  // --- mcp ---
  if (needsMcp) {
    lines.push('mcp:  # nuevo en v2');
    lines.push('  servers: []');
    lines.push('  # Ejemplo:');
    lines.push('  # servers:');
    lines.push('  #   - name: supabase');
    lines.push('  #     auto_approve:');
    lines.push('  #       - list_tables');
    lines.push('  #       - execute_sql');
    lines.push('');
  }

  // --- github ---
  if (needsGithub) {
    lines.push('github:  # nuevo en v2');
    lines.push('  project:');
    lines.push('    number: null                # Número del GitHub Project');
    lines.push('    owner: null                 # usuario u organización');
    lines.push('    repo: null                  # nombre del repositorio');
    lines.push('    status_field_id: null       # ID del campo Status');
    lines.push('    status_in_progress: null    # ej: "In Progress"');
    lines.push('    status_done: null           # ej: "Done"');
    lines.push('');
  }

  // --- rules ---
  if (needsRules) {
    lines.push('rules:  # nuevo en v2');
    lines.push('  forbidden_in_production:');
    lines.push('    - "console.log"');
    lines.push('    - "TODO:"');
    lines.push('    - "FIXME:"');
    lines.push('  required_review_before_ship: false');
    lines.push('  require_spec_before_implementation: false');
    lines.push('  conventional_commits: true');
    lines.push('  forbidden_patterns: []');
    lines.push('');
  }

  // --- scripts ---
  if (needsScripts) {
    lines.push('scripts:  # nuevo en v2');
    lines.push('  check: null                   # ej: "pnpm typecheck && pnpm lint"');
    lines.push('');
  }

  // Header (5 lines) + nothing else -> nothing to migrate.
  if (lines.slice(5).every((l) => l === '')) {
    return raw;
  }

  const additions = lines.join('\n');
  return raw.replace(/\n+$/, '') + '\n\n' + additions + '\n';
}

/** Minimal line-based unified diff (added/removed lines only). */
function showDiff(original: string, updated: string): void {
  const origLines = original.split('\n');
  const newLines = updated.split('\n');
  const origSet = new Set(origLines);
  const newSet = new Set(newLines);

  let printed = false;
  for (const line of newLines) {
    if (!origSet.has(line) && line !== '') {
      console.log(green('+ ' + line));
      printed = true;
    }
  }
  for (const line of origLines) {
    if (!newSet.has(line) && line !== '') {
      console.log(red('- ' + line));
      printed = true;
    }
  }
  if (!printed) {
    console.log(dim('(sin cambios)'));
  }
}

export async function migrate(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const dryRun = args.includes('--dry-run');
  const backup = args.includes('--backup');

  const projectYamlPath = findProjectYaml(process.cwd());
  if (!projectYamlPath) {
    console.error(red('ERROR: No se encontró project.yaml en el directorio actual ni superiores'));
    return 1;
  }

  console.log(cyan(bold('forge migrate')) + '\n');
  console.log(`${dim('Leyendo:')} ${projectYamlPath}`);

  let data: YamlRecord;
  let raw: string;
  try {
    ({ data, raw } = loadYamlRaw(projectYamlPath));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(red(`ERROR: No se pudo leer/parsear project.yaml: ${msg}`));
    return 1;
  }

  const version = detectVersion(data);
  if (version === '2') {
    console.log(
      `\n  [${icons.ok}] ${green('El project.yaml ya está en v2')} ${dim("(contiene 'rules', 'mcp', 'github' o 'project.mode')")}`
    );
    console.log('\n' + box(green('Sin cambios'), ['No se requiere migración.']));
    return 0;
  }

  console.log(`${dim('Versión detectada:')} ${yellow('v' + version)} ${dim('→')} ${green('v2')}\n`);

  const newContent = buildV2Yaml(data, raw);

  if (newContent === raw) {
    console.log(`  [${icons.ok}] ${green('Nada que migrar')} ${dim('— el archivo ya contiene todas las secciones v2')}`);
    console.log('\n' + box(green('Sin cambios'), ['No se requiere migración.']));
    return 0;
  }

  if (dryRun) {
    console.log(yellow('--- DRY RUN: mostrando diff (no se escribirán cambios) ---') + '\n');
    showDiff(raw, newContent);
    console.log('\n' + box(cyan('Dry run'), ['Ejecuta sin --dry-run para aplicar los cambios.']));
    return 0;
  }

  if (backup) {
    const backupPath = projectYamlPath.replace(/\.yaml$/, '.yaml.bak');
    try {
      copyFileSync(projectYamlPath, backupPath);
      console.log(`  [${icons.ok}] ${green('Backup creado')} ${dim(backupPath)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(red(`ERROR: No se pudo crear el backup: ${msg}`));
      return 1;
    }
  }

  try {
    writeFileSync(projectYamlPath, newContent, 'utf-8');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(red(`ERROR: No se pudo escribir project.yaml: ${msg}`));
    return 1;
  }

  console.log(`  [${icons.ok}] ${green('Migración completada')} ${dim(projectYamlPath)}\n`);
  console.log(bold('--- Cambios aplicados ---'));
  showDiff(raw, newContent);

  console.log(
    '\n' +
      box(green('Migración v1 → v2 completada'), [
        gray('Próximos pasos:'),
        '1. Revisa el archivo y completa los campos null con valores reales',
        '2. Agrega project.mode (startup | standard | enterprise) si no está',
        '3. Valida con: ' + cyan('forge validate'),
      ])
  );

  return 0;
}
