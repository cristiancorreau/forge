import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';
import type { ProjectYaml } from '../lib/yaml.js';
import { bold, dim, green, red, yellow, cyan, gray, icons } from '../ui/colors.js';
import { box } from '../ui/box.js';
import { loadManifest, checkOutdated } from '../lib/lock.js';
import { resolveForgeRoot } from '../lib/paths.js';
import { SKILLS, listCatalogAgents } from '../lib/catalog.js';

const HELP = `Usage: forge audit [options]

Audit a project against the forge standard. Checks installed agents,
hooks, runtime config, and project.yaml completeness.

Options:
  --json      Output results as JSON
  -h, --help  Show this help
`;

interface AuditIssue {
  level: 'error' | 'warn' | 'info' | 'ok';
  check: string;
  message: string;
}

const REQUIRED_FRONTMATTER = ['name', 'description', 'model', 'tier'];
const REQUIRED_SECTIONS = ['## Reglas', '## No hagas'];

// Umbrales de similitud (escala 0-1). Calibrados igual que forge-audit.py:
// agentes Tier 1/2 sin modificar quedan ~0.95-1.0 vs forge;
// especialización moderada cae a ~0.65-0.80; reescritura cae a <0.50.
const SIMILARITY_OUTDATED = 0.5; // < 0.5 → agente desactualizado (warn)

// last_verified con más de este número de meses → warn.
const LAST_VERIFIED_MAX_MONTHS = 6;

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length > 0) result[key.trim()] = rest.join(':').trim();
  }
  return result;
}

/**
 * Similitud Jaccard sobre el conjunto de líneas no vacías de dos textos.
 * Devuelve un ratio en [0, 1]: 1 = idénticos, 0 = sin líneas en común.
 */
function lineSimilarity(a: string, b: string): number {
  const norm = (s: string): Set<string> =>
    new Set(
      s
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0),
    );
  const setA = norm(a);
  const setB = norm(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const line of setA) {
    if (setB.has(line)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Localiza la versión forge de un agente.
 * Prioridad: profiles activos (en orden) → core.
 * Devuelve [path, label] o [null, ''].
 */
function findForgeAgent(
  forgeRoot: string,
  name: string,
  profiles: string[],
): [string | null, string] {
  for (const profile of profiles) {
    const p = join(forgeRoot, 'profiles', profile, 'agents', `${name}.md`);
    if (existsSync(p)) return [p, `profile:${profile}`];
  }
  const core = join(forgeRoot, 'core', 'agents', `${name}.md`);
  if (existsSync(core)) return [core, 'core'];
  return [null, ''];
}

/**
 * Calcula los meses transcurridos desde un valor last_verified ("YYYY-MM").
 * Devuelve null si el formato es inválido.
 */
function monthsSince(lastVerified: string): number | null {
  const m = lastVerified.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || !month || month < 1 || month > 12) return null;
  const now = new Date();
  return (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
}

function auditAgent(
  agentPath: string,
  agentName: string,
  forgeRoot: string | null,
  activeProfiles: string[],
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  let content: string;
  try {
    content = readFileSync(agentPath, 'utf-8');
  } catch {
    return [{ level: 'error', check: agentName, message: 'No se puede leer el archivo del agente' }];
  }

  const frontmatter = parseFrontmatter(content);

  for (const field of REQUIRED_FRONTMATTER) {
    if (!frontmatter[field]) {
      issues.push({ level: 'warn', check: agentName, message: `Frontmatter faltante: ${field}` });
    }
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      issues.push({ level: 'warn', check: agentName, message: `Sección faltante: ${section}` });
    }
  }

  // last_verified — si es muy antiguo, advertir.
  if (frontmatter['last_verified']) {
    const months = monthsSince(frontmatter['last_verified']);
    if (months !== null && months >= LAST_VERIFIED_MAX_MONTHS) {
      issues.push({
        level: 'warn',
        check: agentName,
        message: `last_verified hace ${months} meses — verificar que las APIs de terceros siguen vigentes`,
      });
    }
  }

  // Comparación vs forge: similitud y tier.
  const tier = frontmatter['tier'] ?? '?';
  if (forgeRoot && tier !== '3') {
    const [forgePath, source] = findForgeAgent(forgeRoot, agentName, activeProfiles);
    if (forgePath) {
      let forgeContent = '';
      try {
        forgeContent = readFileSync(forgePath, 'utf-8');
      } catch {
        forgeContent = '';
      }
      if (forgeContent) {
        const ratio = lineSimilarity(content, forgeContent);
        const pct = `${Math.round(ratio * 100)}%`;
        if (ratio < SIMILARITY_OUTDATED) {
          issues.push({
            level: 'warn',
            check: agentName,
            message: `Tier ${tier} desactualizado vs forge (${source}) — similitud ${pct} (puede ser especialización intencional)`,
          });
        } else {
          issues.push({
            level: 'ok',
            check: agentName,
            message: `Tier ${tier} al día con forge (${source}) — similitud ${pct}`,
          });
        }
      }
    }
  }

  if (issues.length === 0) {
    issues.push({ level: 'ok', check: agentName, message: 'Agente válido' });
  }

  return issues;
}

/**
 * Oportunidades (nivel info): skills del catálogo no activos en project.yaml
 * y profiles disponibles en forge que el proyecto no usa.
 */
function findOpportunities(config: ProjectYaml | null, forgeRoot: string | null): AuditIssue[] {
  const opps: AuditIssue[] = [];
  if (!config) return opps;

  const activeSkills = new Set(config.skills ?? []);
  for (const skill of SKILLS) {
    if (!activeSkills.has(skill.id)) {
      opps.push({
        level: 'info',
        check: 'oportunidad',
        message: `Skill '${skill.id}' (${skill.command}) disponible — ${skill.purpose}`,
      });
    }
  }

  if (forgeRoot) {
    const activeProfiles = new Set(config.agents?.profiles ?? []);
    const catalog = listCatalogAgents(forgeRoot);
    for (const [profile, agents] of Object.entries(catalog.profiles)) {
      if (activeProfiles.has(profile)) continue;
      if (agents.length === 0) continue;
      opps.push({
        level: 'info',
        check: 'oportunidad',
        message: `Profile '${profile}' disponible en forge → provee: ${agents.join(', ')}`,
      });
    }
  }

  return opps;
}

export async function audit(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  const jsonMode = args.includes('--json');

  const root = process.cwd();
  const issues: AuditIssue[] = [];

  // Resolver el forge root para comparar agentes y listar profiles.
  let forgeRoot: string | null = null;
  try {
    forgeRoot = resolveForgeRoot();
  } catch {
    forgeRoot = null;
  }

  // 1. Check project.yaml
  const yamlPath = findProjectYaml(root);
  if (!yamlPath) {
    issues.push({ level: 'error', check: 'project.yaml', message: 'No se encontró project.yaml — ejecutar forge init' });
  } else {
    issues.push({ level: 'ok', check: 'project.yaml', message: `Encontrado: ${yamlPath}` });
  }

  let config: ProjectYaml | null = null;
  if (yamlPath) {
    try {
      config = loadProjectYaml(yamlPath);
      const mode = config.project.mode;
      if (!mode) {
        issues.push({ level: 'warn', check: 'project.yaml', message: 'project.mode no definido' });
      }
      if (!config.deploy) {
        issues.push({ level: 'info', check: 'project.yaml', message: "Sección 'deploy' ausente" });
      }
      if (!config.rules) {
        issues.push({ level: 'info', check: 'project.yaml', message: "Sección 'rules' ausente" });
      }
    } catch (e: unknown) {
      issues.push({ level: 'error', check: 'project.yaml', message: `Error al parsear: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  const activeProfiles = config?.agents?.profiles ?? [];

  // 2. Check runtime config
  const hasClaudeDir = existsSync(join(root, '.claude'));
  const hasAgentsMd = existsSync(join(root, 'AGENTS.md'));
  const hasKiro = existsSync(join(root, '.kiro'));

  if (hasClaudeDir) {
    issues.push({ level: 'ok', check: 'runtime', message: 'Claude Code detectado (.claude/)' });

    // Check CLAUDE.md
    if (existsSync(join(root, 'CLAUDE.md'))) {
      issues.push({ level: 'ok', check: 'CLAUDE.md', message: 'CLAUDE.md presente' });
    } else {
      issues.push({ level: 'warn', check: 'CLAUDE.md', message: 'CLAUDE.md ausente — ejecutar forge generate' });
    }

    // Check agents
    const agentsDir = join(root, '.claude', 'agents');
    if (!existsSync(agentsDir)) {
      issues.push({ level: 'warn', check: 'agents', message: '.claude/agents/ no existe — ejecutar forge init' });
    } else {
      const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
      if (agentFiles.length === 0) {
        issues.push({ level: 'warn', check: 'agents', message: 'No hay agentes instalados en .claude/agents/' });
      } else {
        for (const agentFile of agentFiles) {
          const agentIssues = auditAgent(
            join(agentsDir, agentFile),
            agentFile.replace('.md', ''),
            forgeRoot,
            activeProfiles,
          );
          issues.push(...agentIssues);
        }
      }
    }

    // Check hooks
    const hooksDir = join(root, '.claude', 'hooks');
    if (!existsSync(hooksDir)) {
      issues.push({ level: 'info', check: 'hooks', message: '.claude/hooks/ no existe — ejecutar forge init' });
    } else {
      const hookFiles = readdirSync(hooksDir);
      issues.push({ level: 'ok', check: 'hooks', message: `${hookFiles.length} hook(s) instalado(s)` });
    }

    // Check settings.json
    if (existsSync(join(root, '.claude', 'settings.json'))) {
      issues.push({ level: 'ok', check: 'settings.json', message: 'settings.json presente' });
    } else {
      issues.push({ level: 'info', check: 'settings.json', message: 'settings.json ausente — ejecutar forge init' });
    }
  }

  if (hasAgentsMd && !hasClaudeDir) {
    issues.push({ level: 'ok', check: 'runtime', message: 'OpenCode/Codex detectado (AGENTS.md)' });
  }

  if (hasKiro) {
    issues.push({ level: 'ok', check: 'runtime', message: 'Kiro detectado (.kiro/)' });
  }

  if (!hasClaudeDir && !hasAgentsMd && !hasKiro) {
    issues.push({ level: 'warn', check: 'runtime', message: 'No se detectó ningún runtime — ejecutar forge init' });
  }

  // Manifest check
  const manifest = loadManifest(root);
  if (manifest) {
    const outdated = checkOutdated(root, manifest);
    if (outdated.length === 0) {
      issues.push({ level: 'ok', check: 'manifest', message: `forge v${manifest.forgeVersion} — todos los archivos al día` });
    } else {
      issues.push({ level: 'warn', check: 'manifest', message: `${outdated.length} archivo(s) modificados desde forge init` });
    }
  } else {
    issues.push({ level: 'info', check: 'manifest', message: 'Sin .forge/manifest.json — ejecutar forge init para generarlo' });
  }

  // Oportunidades (#8): skills y profiles disponibles que el proyecto no usa.
  issues.push(...findOpportunities(config, forgeRoot));

  // Summary
  const errors = issues.filter(i => i.level === 'error').length;
  const warnings = issues.filter(i => i.level === 'warn').length;
  const ok = issues.filter(i => i.level === 'ok').length;
  const info = issues.filter(i => i.level === 'info').length;

  if (jsonMode) {
    console.log(JSON.stringify({
      summary: { errors, warnings, ok, info },
      issues,
    }, null, 2));
  } else {
    console.log(cyan(bold('forge audit')) + '\n');
    for (const issue of issues) {
      const levelIcon = icons[issue.level] ?? gray('·');
      console.log(`  [${levelIcon}] ${bold(issue.check.padEnd(20))} ${dim(issue.message)}`);
    }

    const summaryLine = `Resumen: ${green(String(ok) + ' OK')} · ${cyan(String(info) + ' info')} · ${yellow(String(warnings) + ' warn')} · ${red(String(errors) + ' ✗')}`;
    const boxTitle = errors === 0 && warnings === 0
      ? green('Todo en orden')
      : errors > 0
        ? red('Se encontraron errores')
        : yellow('Advertencias encontradas');
    console.log('\n' + box(boxTitle, [summaryLine]));
  }

  return errors > 0 ? 1 : 0;
}
