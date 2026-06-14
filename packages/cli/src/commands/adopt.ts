/**
 * `forge adopt [path]` — onboard forge into an EXISTING codebase (brownfield).
 *
 * Unlike `forge init` (greenfield wizard), adopt READS the target project, infers
 * its configuration by static analysis, and materializes everything non-
 * interactively: project.yaml + the forge config (.claude/, CLAUDE.md, settings,
 * architecture.rules, manifest) + an auto-generated FACTUAL wiki.
 *
 * The wiki it seeds is deterministic facts only (stack, structure, dependencies,
 * scripts, README summary). The deep SEMANTIC compilation stays the job of the
 * /wiki-ingest skill, which adopt points to as the explicit next step.
 *
 * It reuses init's exported installers so the installed config is identical to
 * `forge init`, and never clobbers existing files unless --force.
 */
import { existsSync, mkdirSync, writeFileSync, statSync, chmodSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { resolveForgeRoot } from '../lib/paths.js';
import { generateClaudeMd } from '../lib/generators/claude-code.js';
import { generateAgentsMd } from '../lib/generators/opencode.js';
import { generateCodexAgentsMd } from '../lib/generators/codex.js';
import { getRuntime } from '../lib/generators/registry.js';
import { scaffoldWikiStructure } from './wiki.js';
import { analyzeProject, slugify, type ProjectAnalysis } from '../lib/project-analysis.js';
import { generateWiki } from '../lib/wiki-autogen.js';
import { languageLabel, deriveProjectLanguage, hasBackend, hasFrontend, hasMobile } from '../lib/wizard-flow.js';
import { VERSION } from '../version.js';
import {
  defaultAgentsForMode, installCoreAgents, installHooks, installCommands,
  writeSettingsJson, installSpecScaffold, saveInstallManifest, write,
  buildProjectYaml, emitStateArtifact,
} from './init.js';
import { bold, dim, green, cyan, gray, yellow, icons } from '../ui/colors.js';
import { box } from '../ui/box.js';
import type { ProjectYaml } from '../lib/yaml.js';
import type { WizardResult } from '../lib/wizard.js';

const HELP = `Usage: forge adopt [path] [options]

Onboard forge into an EXISTING codebase. Analyzes the project, generates
project.yaml from what it detects, installs the forge config, and seeds the
project wiki with FACTUAL knowledge (stack, structure, dependencies, scripts,
README). Non-interactive by default.

Arguments:
  path               Target project directory (default: current directory)

Options:
  --yes              Non-interactive (default — no prompts)
  --no-wiki          Skip the auto-generated wiki
  --runtime <name>   Runtime: claude-code (default), opencode, codex
  --mode <mode>      Mode: startup, standard (default), enterprise
  --force            Overwrite existing files instead of preserving them
  --dry-run          Analyze + print the plan; write nothing
  -h, --help         Show this help

The wiki adopt seeds is deterministic FACTS. The deep semantic compilation
(business logic, decisions) is the job of /wiki-ingest — adopt prints it as the
next step.
`;

interface AdoptOptions {
  target: string;
  runtime: string;
  mode: 'startup' | 'standard' | 'enterprise';
  wiki: boolean;
  force: boolean;
  dryRun: boolean;
}

function flagValue(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
}

function parseOptions(args: string[]): AdoptOptions {
  // First non-flag arg (not a flag value) is the target path.
  const flagsWithValue = new Set(['--runtime', '--mode']);
  let target = process.cwd();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (flagsWithValue.has(arg)) i++; // skip its value
      continue;
    }
    target = resolve(arg);
    break;
  }

  const modeRaw = flagValue(args, '--mode');
  const mode: AdoptOptions['mode'] =
    modeRaw === 'startup' || modeRaw === 'enterprise' ? modeRaw : 'standard';

  return {
    target,
    runtime: flagValue(args, '--runtime') ?? 'claude-code',
    mode,
    wiki: !args.includes('--no-wiki'),
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
  };
}

/** Map a ProjectAnalysis to a WizardResult so buildProjectYaml can render YAML. */
function analysisToWizardResult(a: ProjectAnalysis, opts: AdoptOptions): WizardResult {
  const s = a.stack;
  // Per-side language falls back to the base detected language when no framework
  // was matched on that side (e.g. a Python backend whose framework isn't in
  // detect.ts still has a Python backend language, not the TS default).
  const backendLanguage = s.backendLanguage
    ?? (hasBackend(a.type) ? (s.language ?? undefined) : undefined)
    ?? undefined;
  const frontendLanguage = s.frontendLanguage
    ?? (hasFrontend(a.type) ? 'typescript' : undefined)
    ?? undefined;
  const mobileLanguage = s.mobileLanguage
    ?? (hasMobile(a.type) ? (s.language ?? undefined) : undefined)
    ?? undefined;
  const language = deriveProjectLanguage({ type: a.type, backendLanguage, frontendLanguage, mobileLanguage });

  // Auto-detect profiles from the detected frameworks (mirrors the wizard).
  const PROFILE_MAP: Record<string, string> = {
    hono: 'hono-drizzle', nextjs: 'nextjs-admin', astro: 'astro',
    fastapi: 'fastapi', rails: 'rails', laravel: 'laravel', expo: 'expo',
    springboot: 'springboot', flutter: 'flutter', flask: 'flask',
    axum: 'rust', actix: 'rust', rocket: 'rust',
  };
  const profiles: string[] = [];
  for (const key of [s.backend, s.frontend, s.mobile]) {
    if (key && PROFILE_MAP[key]) profiles.push(PROFILE_MAP[key]);
  }

  return {
    name: a.name,
    slug: slugify(a.name),
    description: a.description || '',
    language,
    type: a.type,
    backendLanguage,
    frontendLanguage,
    mobileLanguage,
    mode: opts.mode,
    backend: s.backend ?? undefined,
    frontend: s.frontend ?? undefined,
    mobile: s.mobile ?? undefined,
    database: s.database ?? undefined,
    orm: s.orm ?? undefined,
    packageManager: s.packageManager ?? undefined,
    testing: s.testing,
    profiles: [...new Set(profiles)],
    skills: ['wiki-ingest', 'wiki-query', 'wiki-lint'],
    runtime: opts.runtime,
    detected: true,
  };
}

/** Build the in-memory ProjectYaml config (matches init's config shape). */
function buildConfig(result: WizardResult): ProjectYaml {
  return {
    project: {
      name: result.name, slug: result.slug, description: result.description,
      language: result.language, type: result.type, mode: result.mode, status: 'active',
    },
    stack: {
      backend: result.backend, backend_language: result.backendLanguage,
      frontend: result.frontend, frontend_language: result.frontendLanguage,
      mobile: result.mobile, mobile_language: result.mobileLanguage,
      database: result.database, orm: result.orm,
      package_manager: result.packageManager, testing: result.testing,
    },
    agents: { active: defaultAgentsForMode(result.mode), compliance: [], specialized: [], profiles: result.profiles },
    runtimes: { active: [result.runtime] },
    skills: result.skills,
  };
}

function printDetectedSummary(a: ProjectAnalysis): void {
  const s = a.stack;
  const lines: string[] = [];
  lines.push(`${bold('Proyecto')}: ${a.name}${a.description ? gray(` — ${a.description}`) : ''}`);
  lines.push(`${bold('Tipo')}: ${a.type}   ${bold('Lenguaje')}: ${a.stack.language ? languageLabel(a.stack.language) : '—'}   ${bold('Ecosistema')}: ${a.ecosystem}`);
  if (s.backend) lines.push(`${bold('Backend')}: ${s.backend}${s.backendLanguage ? ` (${s.backendLanguage})` : ''}`);
  if (s.frontend) lines.push(`${bold('Frontend')}: ${s.frontend}${s.frontendLanguage ? ` (${s.frontendLanguage})` : ''}`);
  if (s.mobile) lines.push(`${bold('Mobile')}: ${s.mobile}${s.mobileLanguage ? ` (${s.mobileLanguage})` : ''}`);
  if (s.database || s.orm) lines.push(`${bold('Datos')}: ${[s.database, s.orm].filter(Boolean).join(' + ') || '—'}`);
  if (s.testing.length) lines.push(`${bold('Testing')}: ${s.testing.join(', ')}`);
  if (s.packageManager) lines.push(`${bold('Package manager')}: ${s.packageManager}`);
  lines.push(`${bold('Directorios')}: ${a.directories.slice(0, 6).map(d => `${d.name}/ (${d.fileCount})`).join('  ') || '—'}`);
  if (a.entrypoints.length) lines.push(`${bold('Entrypoints')}: ${a.entrypoints.slice(0, 4).join(', ')}`);
  if (a.git.remote) lines.push(`${bold('Git')}: ${a.git.remote}${a.git.branch ? ` @ ${a.git.branch}` : ''}`);

  console.log('\n' + box(cyan('Proyecto detectado'), lines));
}

export async function adopt(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const opts = parseOptions(args);

  console.log(cyan(bold('forge adopt')) + dim(`  ${opts.target}`) + '\n');

  if (!existsSync(opts.target) || !statSync(opts.target).isDirectory()) {
    console.error(`  ${icons.error} El target no existe o no es un directorio: ${opts.target}\n`);
    return 1;
  }

  // 1. Analyze the existing project (never throws).
  const analysis = analyzeProject(opts.target);
  printDetectedSummary(analysis);

  const result = analysisToWizardResult(analysis, opts);
  const config = buildConfig(result);

  // --- dry-run: print the plan, write nothing ---
  if (opts.dryRun) {
    const plan: string[] = [
      `project.yaml  ${gray('(generado del análisis)')}`,
      ...(opts.runtime === 'claude-code' ? [
        `.claude/agents/  ${gray(`${config.agents?.active?.length ?? 0} agents (${opts.mode})`)}`,
        '.claude/hooks/  ' + gray('guardrails'),
        '.claude/commands/  ' + gray('slash commands'),
        'CLAUDE.md  ' + gray('generado'),
        '.claude/settings.json  ' + gray('permisos + hooks'),
        '.claude/architecture.rules + docs/specs/',
        '.forge/manifest.json',
      ] : [`${opts.runtime}: AGENTS.md  ${gray('generado')}`]),
      ...(opts.wiki ? [`wiki/  ${gray('poblado (hechos) — semántica vía /wiki-ingest')}`] : []),
    ];
    console.log('\n' + box(yellow('Plan (--dry-run, no escribe nada)'), plan));
    console.log(dim('\n  Ejecutá sin --dry-run para aplicar.\n'));
    return 0;
  }

  // 2. Write project.yaml (preserve existing unless --force).
  const projectYamlPath = join(opts.target, 'project.yaml');
  const created: string[] = [];
  if (!existsSync(projectYamlPath) || opts.force) {
    writeFileSync(projectYamlPath, buildProjectYaml(result, []), 'utf-8');
    created.push('project.yaml');
  } else {
    console.log(dim('  project.yaml ya existe — se conserva (usá --force para sobrescribir).'));
  }

  // 3. Install the forge config, reusing init's exported installers.
  const forgeRoot = resolveForgeRoot();

  if (opts.runtime === 'claude-code') {
    const claudeDir = join(opts.target, '.claude');
    mkdirSync(claudeDir, { recursive: true });

    const activeAgents = config.agents?.active ?? [];
    const profiles = config.agents?.profiles ?? [];
    const specialized = config.agents?.specialized ?? [];

    installCoreAgents(forgeRoot, join(claudeDir, 'agents'), activeAgents, profiles, opts.force, specialized);
    installHooks(forgeRoot, join(claudeDir, 'hooks'), opts.mode, opts.force);
    installCommands(forgeRoot, join(claudeDir, 'commands'), opts.force, profiles);
    write(join(opts.target, 'CLAUDE.md'), generateClaudeMd(config), opts.force);
    writeSettingsJson(join(claudeDir, 'settings.json'), config.project.language ?? 'typescript', opts.mode, opts.force);
    installSpecScaffold(forgeRoot, opts.target, claudeDir, config);
    // SPEC-062: emit .forge/state/ before the manifest so it is tracked.
    emitStateArtifact(opts.target, config);
    saveInstallManifest(opts.target, claudeDir, opts.runtime, activeAgents, [], VERSION);

    created.push('.claude/ (agents, hooks, commands, settings.json, architecture.rules)', 'CLAUDE.md', 'docs/specs/', '.forge/state/', '.forge/manifest.json');
  } else if (opts.runtime === 'opencode') {
    mkdirSync(join(opts.target, '.opencode'), { recursive: true });
    write(join(opts.target, 'AGENTS.md'), generateAgentsMd(config), opts.force);
    created.push('AGENTS.md');
  } else if (opts.runtime === 'codex') {
    write(join(opts.target, 'AGENTS.md'), generateCodexAgentsMd(config), opts.force);
    created.push('AGENTS.md');
  } else {
    // Rules-based and other registry runtimes: iterate surfaces from the descriptor.
    const descriptor = getRuntime(opts.runtime);
    if (descriptor) {
      const surfaces = descriptor.surfaces(config);
      for (const surface of surfaces) {
        const absPath = join(opts.target, surface.path);
        mkdirSync(dirname(absPath), { recursive: true });
        write(absPath, surface.content, opts.force);
        if (surface.executable) {
          try { chmodSync(absPath, 0o755); } catch { /* non-fatal on Windows */ }
        }
        created.push(surface.path);
      }
    } else {
      console.log(dim(`  Runtime '${opts.runtime}' no reconocido — sin archivos instalados.`));
    }
  }

  // 4. Auto-generate the wiki (factual) unless --no-wiki.
  let wikiResult: { pages: string[]; rawSources: string[] } | null = null;
  if (opts.wiki) {
    scaffoldWikiStructure(opts.target, false);
    wikiResult = generateWiki(analysis);
    created.push(`wiki/ (${wikiResult.pages.length} páginas, ${wikiResult.rawSources.length} fuentes en raw/)`);
  }

  // 5. Summary + next steps.
  console.log('\n' + box(green(`forge adoptado — ${opts.runtime}`), created.map(c => `${icons.ok} ${c}`)));

  const rawList = wikiResult?.rawSources.length
    ? wikiResult.rawSources.map(r => `wiki/raw/${r}`)
    : [];
  const nextSteps: string[] = [];
  if (opts.wiki) {
    nextSteps.push(
      `${cyan('/wiki-ingest')} ${dim('— compilá la capa semántica desde las fuentes:')}`,
      ...rawList.map(r => `    ${dim(r)}`),
    );
  }
  nextSteps.push(
    `${cyan('forge audit')} ${dim('— verificá el proyecto contra el estándar forge')}`,
    `${cyan('forge panel')} ${dim('— panel interactivo (config, monitor, skills)')}`,
  );

  console.log('\n' + bold('  Próximos pasos:'));
  for (const step of nextSteps) console.log(`    ${step}`);
  console.log('');

  return 0;
}
