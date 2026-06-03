import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { spawnSync } from 'child_process';
import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';
import { runWizard } from '../lib/wizard.js';
import { resolveForgeRoot } from '../lib/paths.js';

// OpenTUI panels require Bun runtime
const isBun = typeof (globalThis as any).Bun !== 'undefined';

// Locate a usable `bun` binary: PATH first, then the standard install location.
function findBun(): string | null {
  const candidates = [
    'bun',
    join(process.env.HOME ?? '', '.bun', 'bin', 'bun'),
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
  ];
  for (const bin of candidates) {
    try {
      const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 2000 });
      if (r.status === 0) return bin;
    } catch { /* try next */ }
  }
  return null;
}

// If running under Node.js with a TTY, re-launch the CLI under Bun (if available)
// so the OpenTUI panel wizard can render. Returns without exiting if not possible.
function tryReLaunchWithBun(args: string[]): void {
  if (isBun) return;
  if (process.env.FORGE_NO_BUN === '1') return; // explicit opt-out
  if (!process.stdin.isTTY || !process.stdout.isTTY) return; // panels need a real TTY
  const bun = findBun();
  if (!bun) return; // Bun not installed → fall back to clack
  // cli.js is one level up from dist/commands/init.js
  const cliPath = new URL('../cli.js', import.meta.url).pathname;
  const result = spawnSync(bun, [cliPath, 'init', ...args], {
    stdio: 'inherit',
    env: { ...process.env, FORGE_BUN_RELAUNCH: '1' },
  });
  process.exit(result.status ?? 0);
}
import { buildManifest, saveManifest } from '../lib/lock.js';
import { dim } from '../ui/colors.js';
import { printHeader, printSection, printDetected, printAgentList } from '../ui/header.js';
import { runTasks } from '../ui/tasks.js';
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
  --dry-run          Show what would be installed without writing files
  -h, --help         Show this help
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function write(path: string, content: string, force: boolean): void {
  if (existsSync(path) && !force) return;
  writeFileSync(path, content, 'utf-8');
}

function copyFile(src: string, dest: string, force: boolean): void {
  if (existsSync(dest) && !force) return;
  copyFileSync(src, dest);
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
${result.skills && result.skills.length > 0 ? `\nskills:\n${result.skills.map(s => `  - ${s}`).join('\n')}\n` : ''}
# Agregar cuando tengas deploy configurado:
# deploy:
#   provider: vercel
#   production_url: https://tu-proyecto.vercel.app
`;
}

function getAgentTech(agent: string): string {
  const map: Record<string, string> = {
    'orchestrator': 'coordination', 'backend-engineer': 'API', 'api-engineer': 'API',
    'frontend-engineer': 'UI', 'admin-engineer': 'admin UI', 'mobile-engineer': 'mobile',
    'test-engineer': 'testing', 'docs-writer': 'docs', 'compliance-reviewer': 'compliance',
    'security-auditor': 'security', 'fullstack-engineer': 'fullstack',
  };
  return map[agent] ?? 'specialized';
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

  // JS hooks (zero Python dependency)
  const universal = ['pre-edit-check.js', 'post-turn-check.sh', 'session-start.sh'];
  const standard = ['pre-bash-check.js'];

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
    PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: 'node .claude/hooks/pre-edit-check.js' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'bash .claude/hooks/post-turn-check.sh' }] }],
  };
  if (mode === 'standard' || mode === 'enterprise') {
    (hooks.PreToolUse as Array<Record<string, unknown>>).push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'node .claude/hooks/pre-bash-check.js' }],
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
  const dryRun = args.includes('--dry-run');
  const runtimeIdx = args.indexOf('--runtime');
  const runtimeOverride = runtimeIdx !== -1 ? (args[runtimeIdx + 1] ?? null) : null;

  const projectYamlPath = join(process.cwd(), 'project.yaml');
  const hasProjectYaml = existsSync(projectYamlPath);
  let config: ProjectYaml;

  // The interactive wizard runs only when there's no project.yaml and we're not
  // in dry-run. On Node.js with Bun installed, re-launch under Bun for the
  // OpenTUI panel wizard; otherwise fall back to the @clack/prompts wizard.
  if (!hasProjectYaml && !dryRun) {
    tryReLaunchWithBun(args); // exits the process if it re-launches under Bun
  }

  // The OpenTUI wizard renders its own full-screen header. The static boxen
  // header is only shown for the clack wizard, dry-run, and existing-config paths.
  const usingOpenTUI = isBun && !hasProjectYaml && !dryRun;
  if (!usingOpenTUI) printHeader();

  if (hasProjectYaml) {
    config = loadProjectYaml(projectYamlPath);
  } else if (dryRun) {
    // Dry-run without config: show what a default standard project would install
    console.log(dim('  No project.yaml found — showing defaults for a "standard" project.') + '\n');
    config = {
      project: { name: 'My Project', slug: 'my-project', language: 'typescript', mode: 'standard', status: 'active' },
      agents: { active: defaultAgentsForMode('standard'), compliance: [], profiles: [] },
      runtimes: { active: [runtimeOverride ?? 'claude-code'] },
    };
  } else {
    // Run interactive wizard — OpenTUI (Bun) or @clack/prompts (Node.js)
    let result;
    if (isBun) {
      const { runOpenTUIWizard } = await import('../tui/wizard.js');
      result = await runOpenTUIWizard();
      // OpenTUI restored the screen; now show the static header for install phase
      printHeader();
    } else {
      result = await runWizard();
    }
    if (!result) { console.log('\nCancelado.'); return 1; }

    const yamlContent = buildProjectYaml(result);
    writeFileSync(projectYamlPath, yamlContent, 'utf-8');

    config = {
      project: { name: result.name, slug: result.slug, description: result.description, language: result.language, mode: result.mode, status: 'active' },
      stack: { backend: result.backend, frontend: result.frontend, database: result.database, orm: result.orm, package_manager: result.packageManager, testing: result.testing },
      agents: { active: defaultAgentsForMode(result.mode), compliance: [], profiles: result.profiles },
      runtimes: { active: [runtimeOverride ?? result.runtime] },
      skills: result.skills,
    };
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

  // Show detected stack
  const detectedItems: string[] = [];
  if (language && language !== 'typescript') detectedItems.push(language.charAt(0).toUpperCase() + language.slice(1));
  if (config.stack?.backend)  detectedItems.push(config.stack.backend);
  if (config.stack?.frontend) detectedItems.push(config.stack.frontend);
  if (config.stack?.database) detectedItems.push(config.stack.database);
  if (config.stack?.orm)      detectedItems.push(config.stack.orm);
  if ((config.stack?.testing ?? []).length > 0) detectedItems.push(...(config.stack?.testing ?? []));
  if (language === 'typescript') detectedItems.unshift('TypeScript');

  if (detectedItems.length > 0) printDetected(detectedItems);

  // Show agent list
  const agentListItems = allAgents.map(a => ({ name: a, tech: getAgentTech(a) }));
  if (agentListItems.length > 0) printAgentList(agentListItems);

  // --dry-run: show what would be installed
  if (dryRun) {
    printSection('Would install (--dry-run)');
    const dryFiles = [
      { title: `.claude/agents/ — ${allAgents.length} agents`, tech: runtime },
      { title: '.claude/hooks/ — pre-edit-check.js, pre-bash-check.js', tech: 'guardrail' },
      { title: '.claude/commands/ — 11 slash commands', tech: 'sdd' },
      { title: 'CLAUDE.md', tech: 'config' },
      { title: '.claude/settings.json', tech: 'config' },
      { title: '.forge/manifest.json', tech: 'manifest' },
    ];
    dryFiles.forEach((f, i) => {
      process.stdout.write(`  ${dim(String(i + 1).padStart(2) + '.')} ${f.title}  ${dim('← ' + f.tech)}\n`);
    });
    console.log('\n' + dim('  Run without --dry-run to apply.') + '\n');
    return 0;
  }

  if (runtime === 'claude-code') {
    const claudeDir = join(projectRoot, '.claude');
    mkdirSync(claudeDir, { recursive: true });

    await runTasks('Installing...', [
      {
        title: `Agents (${allAgents.length})`,
        tech: profiles.length ? `${profiles.join(', ')} profile` : 'core',
        task: () => installCoreAgents(forgeRoot, join(claudeDir, 'agents'), allAgents, profiles, force),
      },
      {
        title: 'Hooks (pre-edit-check.js, pre-bash-check.js)',
        tech: 'guardrail',
        task: () => installHooks(forgeRoot, join(claudeDir, 'hooks'), mode, force),
      },
      {
        title: 'Slash commands (11)',
        tech: 'sdd workflow',
        task: () => installCommands(forgeRoot, join(claudeDir, 'commands'), force),
      },
      {
        title: 'CLAUDE.md',
        tech: 'generated',
        task: () => write(join(projectRoot, 'CLAUDE.md'), generateClaudeMd(config), force),
      },
      {
        title: 'settings.json',
        tech: 'permissions + hooks',
        task: () => write(join(claudeDir, 'settings.json'), generateSettingsJson(language, mode), force),
      },
      {
        title: 'docs/specs/ + architecture.rules',
        tech: 'scaffold',
        task: () => {
          mkdirSync(join(projectRoot, 'docs', 'specs'), { recursive: true });
          mkdirSync(join(projectRoot, 'docs', 'daily-notes'), { recursive: true });
          const specTemplateSrc = join(forgeRoot, 'core', 'templates', 'spec-template.md');
          if (existsSync(specTemplateSrc)) {
            copyFile(specTemplateSrc, join(projectRoot, 'docs', 'specs', '_template.md'), false);
          }
          const archRulesTemplate = join(forgeRoot, 'core', 'templates', 'claude-md', 'architecture.rules');
          const archRulesDest = join(claudeDir, 'architecture.rules');
          if (existsSync(archRulesTemplate) && !existsSync(archRulesDest)) {
            const content = readFileSync(archRulesTemplate, 'utf-8').replace('<NOMBRE_PROYECTO>', config.project.name ?? 'Mi Proyecto');
            writeFileSync(archRulesDest, content, 'utf-8');
          }
        },
      },
      {
        title: '.forge/manifest.json',
        tech: 'sha256 tracking',
        task: () => {
          const installedFiles = [
            'CLAUDE.md', '.claude/settings.json', '.claude/architecture.rules',
            ...allAgents.map(a => `.claude/agents/${a}.md`),
          ];
          const ts = new Date().toISOString();
          saveManifest(projectRoot, buildManifest(runtime, installedFiles, projectRoot, '2.9.0', ts));
        },
      },
    ]);

  } else if (runtime === 'opencode') {
    mkdirSync(join(projectRoot, '.opencode'), { recursive: true });
    write(join(projectRoot, 'AGENTS.md'), generateAgentsMd(config), force);

  } else if (runtime === 'codex') {
    write(join(projectRoot, 'AGENTS.md'), generateCodexAgentsMd(config), force);

  } else if (runtime === 'kiro') {
    installKiro(forgeRoot, projectRoot, config, force);
  }

  // Interactive post-install dashboard (Bun + TTY). Explains the project,
  // installed agents, SDD workflow, skills, runtimes and detected tech.
  const canDashboard = isBun && process.stdout.isTTY && process.env.FORGE_NO_DASHBOARD !== '1';
  if (canDashboard) {
    try {
      const { runPostInstallDashboard } = await import('../tui/dashboard.js');
      await runPostInstallDashboard({
        projectName: config.project.name ?? 'Project',
        runtime: runtime as any,
        mode,
        language,
        agents: allAgents,
        profiles,
        stack: { ...(config.stack ?? {}), packageManager: config.stack?.package_manager },
      });
    } catch {
      // fall through to the static recap below
    }
  }

  // Static recap (persists in scrollback after the dashboard, and is the
  // fallback for Node.js / non-TTY / other runtimes).
  const import_boxen = await import('boxen');
  const importChalk = await import('chalk');
  const nextSteps =
    runtime === 'claude-code' ? ['Open project in Claude Code', 'Run /plan to create your first spec'] :
    runtime === 'opencode'    ? ['Open project in OpenCode'] :
    runtime === 'kiro'        ? ['Open project in Kiro IDE'] :
                                ['Open project in your AI runtime'];

  const summaryContent =
    importChalk.default.green.bold('✔ forge installed — ' + runtime) + '\n\n' +
    importChalk.default.dim('Next steps:\n') +
    nextSteps.map((s, i) => importChalk.default.dim(`  ${i + 1}. ${s}`)).join('\n');

  process.stdout.write('\n' + import_boxen.default(summaryContent, {
    borderStyle: 'round',
    borderColor: 'green',
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
  }) + '\n');

  return 0;
}
