import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';
import { runWizard } from '../lib/wizard.js';
import { resolveForgeRoot } from '../lib/paths.js';
import { generateClaudeMd } from '../lib/generators/claude-code.js';
import { generateAgentsMd } from '../lib/generators/opencode.js';
import { generateCodexAgentsMd } from '../lib/generators/codex.js';
import {
  generateKiroProduct, generateKiroStructure,
  generateKiroAgents, generateKiroCommands, generateKiroBranchGuardHook
} from '../lib/generators/kiro.js';
import type { ProjectYaml } from '../lib/yaml.js';

const HELP = `Usage: forge init [options]

Initialize forge in a project. Launches an interactive wizard to configure
project.yaml, then installs agents, hooks, and runtime configuration.

Options:
  --runtime <name>   Skip wizard for runtime selection: claude-code, opencode, codex, kiro
  --force            Overwrite existing files without prompting
  -h, --help         Show this help
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function write(path: string, content: string, force: boolean): void {
  if (existsSync(path) && !force) {
    console.log(`  skip  ${basename(path)} (ya existe)`);
    return;
  }
  writeFileSync(path, content, 'utf-8');
  console.log(`  write ${basename(path)}`);
}

function copyFile(src: string, dest: string, force: boolean): void {
  if (existsSync(dest) && !force) {
    console.log(`  skip  ${basename(dest)} (ya existe)`);
    return;
  }
  copyFileSync(src, dest);
  console.log(`  copy  ${basename(dest)}`);
}

function copyDir(src: string, dest: string, force: boolean): void {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) copyDir(srcPath, destPath, force);
    else copyFile(srcPath, destPath, force);
  }
}

function buildProjectYaml(result: Awaited<ReturnType<typeof runWizard>>): string {
  if (!result) return '';
  const stack: string[] = [];
  if (result.backend) stack.push(`  backend: ${result.backend}`);
  if (result.frontend) stack.push(`  frontend: ${result.frontend}`);
  if (result.database) stack.push(`  database: ${result.database}`);
  if (result.orm) stack.push(`  orm: ${result.orm}`);
  if (result.packageManager) stack.push(`  package_manager: ${result.packageManager}`);
  if (result.testing && result.testing.length > 0) {
    stack.push(`  testing:\n${result.testing.map(t => `    - ${t}`).join('\n')}`);
  }

  const profiles = result.profiles && result.profiles.length > 0
    ? `  profiles:\n${result.profiles.map(p => `    - ${p}`).join('\n')}`
    : '';

  const coreAgents = defaultAgentsForMode(result.mode);

  return `project:
  name: "${result.name}"
  slug: "${result.slug}"
  description: "${result.description}"
  language: ${result.language}
  mode: ${result.mode}
  status: active

stack:
${stack.join('\n') || '  # Agregar stack aquí'}

agents:
  active:
${coreAgents.map(a => `    - ${a}`).join('\n')}
  compliance: []
${profiles}

runtimes:
  active:
    - ${result.runtime}

# Agregar cuando tengas deploy configurado:
# deploy:
#   provider: vercel
#   production_url: https://tu-proyecto.vercel.app
`;
}

function defaultAgentsForMode(mode: string): string[] {
  if (mode === 'startup') return ['orchestrator', 'backend-engineer', 'frontend-engineer'];
  if (mode === 'enterprise') return ['orchestrator', 'backend-engineer', 'frontend-engineer', 'test-engineer', 'docs-writer', 'compliance-reviewer', 'security-auditor'];
  return ['orchestrator', 'backend-engineer', 'frontend-engineer', 'test-engineer', 'docs-writer'];
}

function installCoreAgents(forgeRoot: string, destDir: string, activeAgents: string[], profiles: string[], force: boolean): void {
  mkdirSync(destDir, { recursive: true });

  // Tier 2: profile agents first
  for (const profile of profiles) {
    const profileAgentsDir = join(forgeRoot, 'profiles', profile, 'agents');
    if (existsSync(profileAgentsDir)) {
      copyDir(profileAgentsDir, destDir, force);
    }
  }

  // Tier 1: core agents (only if not already installed)
  const coreAgentsDir = join(forgeRoot, 'core', 'agents');
  if (existsSync(coreAgentsDir)) {
    for (const agent of activeAgents) {
      const src = join(coreAgentsDir, `${agent}.md`);
      const dest = join(destDir, `${agent}.md`);
      if (existsSync(src) && (!existsSync(dest) || force)) {
        copyFile(src, dest, force);
      }
    }
  }
}

function installHooks(forgeRoot: string, destDir: string, mode: string, force: boolean): void {
  mkdirSync(destDir, { recursive: true });
  const hooksDir = join(forgeRoot, 'core', 'hooks');
  if (!existsSync(hooksDir)) return;

  const universal = ['pre-edit-check.py', 'post-turn-check.sh', 'session-start.sh'];
  const standard = ['pre-bash-check.py'];

  for (const hook of universal) {
    const src = join(hooksDir, hook);
    if (existsSync(src)) copyFile(src, join(destDir, hook), force);
  }
  if (mode === 'standard' || mode === 'enterprise') {
    for (const hook of standard) {
      const src = join(hooksDir, hook);
      if (existsSync(src)) copyFile(src, join(destDir, hook), force);
    }
  }
}

function generateSettingsJson(language: string, mode: string): string {
  const allowList: string[] = [];

  if (language === 'typescript') {
    allowList.push('Bash(pnpm *)', 'Bash(npm *)', 'Bash(node *)', 'Bash(npx *)');
  } else if (language === 'python') {
    allowList.push('Bash(python3 *)', 'Bash(pip3 *)', 'Bash(pytest *)', 'Bash(ruff *)');
  } else if (language === 'ruby') {
    allowList.push('Bash(bundle *)', 'Bash(rails *)', 'Bash(rake *)');
  } else if (language === 'go') {
    allowList.push('Bash(go *)');
  } else if (language === 'php') {
    allowList.push('Bash(composer *)', 'Bash(php *)');
  }
  allowList.push('Bash(git *)');

  const hooks: Record<string, unknown[]> = {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'python3 .claude/hooks/pre-edit-check.py' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'bash .claude/hooks/post-turn-check.sh' }] }],
  };
  if (mode === 'standard' || mode === 'enterprise') {
    (hooks.PreToolUse as Array<Record<string, unknown>>).push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'python3 .claude/hooks/pre-bash-check.py' }],
    });
  }

  return JSON.stringify({ permissions: { allow: allowList }, hooks }, null, 2);
}

function installCommands(forgeRoot: string, destDir: string, force: boolean): void {
  mkdirSync(destDir, { recursive: true });
  const commandsDir = join(forgeRoot, 'adapters', 'claude-code', 'commands');
  if (!existsSync(commandsDir)) return;
  copyDir(commandsDir, destDir, force);
}

function installKiro(forgeRoot: string, projectRoot: string, config: ProjectYaml, force: boolean): void {
  const kiroDir = join(projectRoot, '.kiro', 'steering');
  const hooksDir = join(projectRoot, '.kiro', 'hooks');
  mkdirSync(kiroDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });

  write(join(kiroDir, 'product.md'), generateKiroProduct(config), force);
  write(join(kiroDir, 'structure.md'), generateKiroStructure(config), force);
  write(join(kiroDir, 'agents.md'), generateKiroAgents(config), force);
  write(join(kiroDir, 'commands.md'), generateKiroCommands(), force);
  write(join(hooksDir, 'pre-edit-branch-guard.json'), generateKiroBranchGuardHook(), force);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function init(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const force = args.includes('--force');
  const runtimeIdx = args.indexOf('--runtime');
  const runtimeOverride = runtimeIdx !== -1 ? (args[runtimeIdx + 1] ?? null) : null;

  const projectYamlPath = join(process.cwd(), 'project.yaml');
  let config: ProjectYaml;

  if (!existsSync(projectYamlPath)) {
    // Run interactive wizard
    const result = await runWizard();
    if (!result) { console.log('\nCancelado.'); return 1; }

    const yamlContent = buildProjectYaml(result);
    writeFileSync(projectYamlPath, yamlContent, 'utf-8');
    console.log(`\n  write project.yaml`);

    // Build config from wizard result
    config = {
      project: { name: result.name, slug: result.slug, description: result.description, language: result.language, mode: result.mode, status: 'active' },
      stack: { backend: result.backend, frontend: result.frontend, database: result.database, orm: result.orm, package_manager: result.packageManager, testing: result.testing },
      agents: { active: defaultAgentsForMode(result.mode), compliance: [], profiles: result.profiles },
      runtimes: { active: [runtimeOverride ?? result.runtime] },
    };
  } else {
    console.log('project.yaml encontrado — usando configuración existente.\n');
    config = loadProjectYaml(projectYamlPath);
  }

  const forgeRoot = resolveForgeRoot();
  const projectRoot = process.cwd();
  const runtime = runtimeOverride ?? config.runtimes?.active?.[0] ?? 'claude-code';
  const mode = config.project.mode ?? 'standard';
  const language = config.project.language ?? 'typescript';
  const activeAgents = config.agents?.active ?? [];
  const complianceAgents = config.agents?.compliance ?? [];
  const profiles = config.agents?.profiles ?? [];
  const allAgents = [...activeAgents, ...complianceAgents];

  console.log(`\nInstalando forge para runtime: ${runtime}\n`);

  if (runtime === 'claude-code') {
    const claudeDir = join(projectRoot, '.claude');
    mkdirSync(claudeDir, { recursive: true });

    console.log('Agentes:');
    installCoreAgents(forgeRoot, join(claudeDir, 'agents'), allAgents, profiles, force);

    console.log('\nHooks:');
    installHooks(forgeRoot, join(claudeDir, 'hooks'), mode, force);

    console.log('\nSlash commands:');
    installCommands(forgeRoot, join(claudeDir, 'commands'), force);

    console.log('\nArchivos de configuración:');
    write(join(projectRoot, 'CLAUDE.md'), generateClaudeMd(config), force);
    write(join(claudeDir, 'settings.json'), generateSettingsJson(language, mode), force);

    // Docs structure
    mkdirSync(join(projectRoot, 'docs', 'specs'), { recursive: true });
    mkdirSync(join(projectRoot, 'docs', 'daily-notes'), { recursive: true });
    const specTemplateSrc = join(forgeRoot, 'core', 'templates', 'spec-template.md');
    if (existsSync(specTemplateSrc)) {
      copyFile(specTemplateSrc, join(projectRoot, 'docs', 'specs', '_template.md'), false);
    }

  } else if (runtime === 'opencode') {
    mkdirSync(join(projectRoot, '.opencode'), { recursive: true });
    write(join(projectRoot, 'AGENTS.md'), generateAgentsMd(config), force);

  } else if (runtime === 'codex') {
    write(join(projectRoot, 'AGENTS.md'), generateCodexAgentsMd(config), force);

  } else if (runtime === 'kiro') {
    installKiro(forgeRoot, projectRoot, config, force);
  }

  console.log(`\nForge instalado para ${runtime}.\n`);
  console.log('Próximos pasos:');
  if (runtime === 'claude-code') {
    console.log('  1. Revisar CLAUDE.md y ajustar si es necesario');
    console.log('  2. Abrir el proyecto en Claude Code');
    console.log('  3. Usar /plan para crear tu primera spec');
  } else if (runtime === 'opencode') {
    console.log('  1. Revisar AGENTS.md');
    console.log('  2. Abrir el proyecto en OpenCode');
  } else if (runtime === 'kiro') {
    console.log('  1. Revisar .kiro/steering/');
    console.log('  2. Abrir el proyecto en Kiro IDE');
  }

  return 0;
}
