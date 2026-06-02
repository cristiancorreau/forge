import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';

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

const REQUIRED_FRONTMATTER = ['name', 'description', 'model', 'tools', 'tier'];
const REQUIRED_SECTIONS = ['## Reglas', '## No hagas'];

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

function auditAgent(agentPath: string, agentName: string): AuditIssue[] {
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

  if (issues.length === 0) {
    issues.push({ level: 'ok', check: agentName, message: 'Agente válido' });
  }

  return issues;
}

export async function audit(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  const jsonMode = args.includes('--json');

  const root = process.cwd();
  const issues: AuditIssue[] = [];

  // 1. Check project.yaml
  const yamlPath = findProjectYaml(root);
  if (!yamlPath) {
    issues.push({ level: 'error', check: 'project.yaml', message: 'No se encontró project.yaml — ejecutar forge init' });
  } else {
    issues.push({ level: 'ok', check: 'project.yaml', message: `Encontrado: ${yamlPath}` });
  }

  let config = null;
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
          const agentIssues = auditAgent(join(agentsDir, agentFile), agentFile.replace('.md', ''));
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

  // Summary
  const errors = issues.filter(i => i.level === 'error').length;
  const warnings = issues.filter(i => i.level === 'warn').length;
  const ok = issues.filter(i => i.level === 'ok').length;

  if (jsonMode) {
    console.log(JSON.stringify({
      summary: { errors, warnings, ok },
      issues,
    }, null, 2));
  } else {
    console.log('forge audit\n');
    for (const issue of issues) {
      const icons: Record<string, string> = { ok: '✓', warn: '!', error: '✗', info: 'i' };
      const icon = icons[issue.level] ?? '·';
      console.log(`  [${icon}] ${issue.check.padEnd(20)} ${issue.message}`);
    }
    console.log(`\n  Resumen: ${ok} OK · ${warnings} warnings · ${errors} errores`);
    if (errors === 0 && warnings === 0) console.log('  El proyecto cumple con el estándar forge.');
  }

  return errors > 0 ? 1 : 0;
}
