import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, basename, dirname } from 'path';
import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';
import { runWizard } from '../lib/wizard.js';
import { loadAnswers } from '../lib/init-answers.js';
import { resolveForgeRoot } from '../lib/paths.js';
import { forgeMarker } from '../lib/marker.js';
import {
  findBun, resolveCliEntry, shouldRelaunchUnderBun, relaunchUnderBun, bunFallbackHint,
} from '../lib/bun.js';
import { boxenBorderStyle } from '../ui/ascii.js';
import { VERSION } from '../version.js';

// OpenTUI panels require Bun runtime
const isBun = typeof (globalThis as any).Bun !== 'undefined';

// OpenTUI is OPT-IN (SPEC-065). By default `forge init` runs the cross-platform
// `@clack` wizard (lib/wizard.ts), which behaves identically on Windows / macOS /
// Linux. The full-screen OpenTUI wizard (Bun-only) is fragile on legacy Windows
// consoles, so it is only enabled when the user sets FORGE_ENABLE_OPENTUI=1.
const openTUIEnabled = process.env.FORGE_ENABLE_OPENTUI === '1';

// If OpenTUI is opted in AND we're running under Node.js with a TTY, re-launch the
// CLI under Bun (if available) so the OpenTUI panel wizard can render. Without
// FORGE_ENABLE_OPENTUI=1 this is a no-op: it never relaunches, so the `@clack`
// wizard runs. Returns without exiting if a relaunch isn't possible/desired.
// The relaunch decision (the opt-in gate, platform gates, Windows terminal
// capability, the FORGE_NO_BUN/FORGE_FORCE_BUN overrides, the FORGE_BUN_RELAUNCH
// guard) lives in the shared, unit-tested lib/bun.ts helper so init and panel
// stay in sync. Bun discovery is cross-platform: on Windows it looks under
// %USERPROFILE%\.bun\bin\bun.exe and uses `where`, on POSIX `which`/~/.bun.
function tryReLaunchWithBun(args: string[]): void {
  if (isBun) return;
  if (!openTUIEnabled) return; // OpenTUI opt-in: never relaunch under Bun without it
  const isTTY = !!(process.stdin.isTTY && process.stdout.isTTY);
  const bun = findBun();
  if (shouldRelaunchUnderBun({ bunPath: bun, isTTY, alreadyBun: isBun })) {
    // cli.js is one level up from dist/commands/init.js (fileURLToPath, not
    // URL.pathname, so the entry path is valid on Windows).
    const cliPath = resolveCliEntry(import.meta.url);
    process.exit(relaunchUnderBun(bun as string, cliPath, ['init', ...args]));
  }
  // Not relaunching → nudge toward the full OpenTUI panel (once, TTY-only).
  const hint = bunFallbackHint({ isTTY, alreadyBun: isBun });
  if (hint) process.stdout.write(dim('  ' + hint) + '\n');
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
import { getRuntime, stateSurfaces, STATE_SURFACE_FILES } from '../lib/generators/registry.js';
import type { ProjectYaml } from '../lib/yaml.js';
import { scaffoldWikiStructure } from './wiki.js';

/** Active skill ids that enable the project knowledge base (wiki). */
const WIKI_SKILLS = ['wiki-ingest', 'wiki-query', 'wiki-lint'];

/** True if the project's active skills include any wiki-* skill. */
function hasWikiSkill(config: ProjectYaml): boolean {
  const skills = Array.isArray(config.skills) ? config.skills : [];
  return skills.some(s => WIKI_SKILLS.includes(s));
}

const HELP = `Usage: forge init [options]

Initialize forge in a project. Launches an interactive wizard to configure
project.yaml, then installs agents, hooks, and runtime configuration.

Options:
  --runtime <name>   Skip wizard for runtime selection:
                     Native: claude-code, opencode, codex, kiro
                     Rules: cursor, windsurf, copilot, gemini, zed,
                            cline, aider, continue, roo, amp, augment
  --force            Overwrite existing files without prompting
  --dry-run          Show what would be installed without writing files
  -h, --help         Show this help

Environment:
  FORGE_ENABLE_OPENTUI=1   Opt in to the full-screen OpenTUI wizard (requires Bun
                           and a capable terminal). Off by default — the wizard
                           uses cross-platform @clack prompts that work the same
                           on Windows, macOS and Linux.
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function write(path: string, content: string, force: boolean): void {
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

/**
 * Auto-detecta agentes Tier 3 existentes: escanea .claude/agents/*.md en `root`
 * y devuelve los nombres cuyo frontmatter declara `tier: 3`. Sirve para poblar
 * agents.specialized en project.yaml durante `forge init`.
 */
export function detectTier3Agents(root: string): string[] {
  const agentsDir = join(root, '.claude', 'agents');
  if (!existsSync(agentsDir)) return [];
  const found: string[] = [];
  for (const file of readdirSync(agentsDir)) {
    if (!file.endsWith('.md')) continue;
    let content: string;
    try {
      content = readFileSync(join(agentsDir, file), 'utf-8');
    } catch {
      continue;
    }
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    if (/^\s*tier:\s*3\s*$/m.test(fm[1])) {
      found.push(basename(file, '.md'));
    }
  }
  return found.sort();
}

/**
 * Lista los archivos instalados en `<claudeDir>/<subdir>` (p. ej. hooks/ o
 * commands/) como rutas RELATIVAS a `projectRoot`, usando separadores `/` para
 * que el manifest sea estable entre plataformas. Devuelve [] si el dir no existe.
 * Recorre subdirectorios (los slash commands pueden estar anidados).
 */
export function listInstalledRelativeFiles(claudeDir: string, subdir: string, projectRoot: string): string[] {
  const baseDir = join(claudeDir, subdir);
  if (!existsSync(baseDir)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.push(abs.slice(projectRoot.length + 1).split('\\').join('/'));
    }
  };
  walk(baseDir);
  return out.sort();
}

export function buildProjectYaml(result: Awaited<ReturnType<typeof runWizard>> | null, specialized: string[] = []): string {
  if (!result) return '';
  const stack: string[] = [];
  // Per-side framework + language. backend_language/frontend_language are new
  // and let the two sides differ (e.g. Python backend + TypeScript frontend).
  if (result.backend) stack.push(`  backend: ${result.backend}`);
  if (result.backendLanguage) stack.push(`  backend_language: ${result.backendLanguage}`);
  if (result.frontend) stack.push(`  frontend: ${result.frontend}`);
  if (result.frontendLanguage) stack.push(`  frontend_language: ${result.frontendLanguage}`);
  if (result.mobile) stack.push(`  mobile: ${result.mobile}`);
  if (result.mobileLanguage) stack.push(`  mobile_language: ${result.mobileLanguage}`);
  if (result.database) stack.push(`  database: ${result.database}`);
  if (result.orm) stack.push(`  orm: ${result.orm}`);
  if (result.packageManager) stack.push(`  package_manager: ${result.packageManager}`);
  if (result.testing && result.testing.length > 0) {
    stack.push(`  testing:\n${result.testing.map(t => `    - ${t}`).join('\n')}`);
  }

  const profiles = result.profiles && result.profiles.length > 0
    ? `  profiles:\n${result.profiles.map(p => `    - ${p}`).join('\n')}`
    : '';

  const specializedBlock = specialized.length > 0
    ? `  specialized:\n${specialized.map(s => `    - ${s}`).join('\n')}`
    : '';

  const coreAgents = defaultAgentsForMode(result.mode);

  // project.type only when known (the wizard always sets it); old flows omit it.
  const typeLine = result.type ? `  type: ${result.type}\n` : '';

  return `${forgeMarker()}
project:
  name: "${result.name}"
  slug: "${result.slug}"
  description: "${result.description}"
  language: ${result.language}
${typeLine}  mode: ${result.mode}
  status: active

stack:
${stack.join('\n') || '  # Agregar stack aquí'}

agents:
  active:
${coreAgents.map(a => `    - ${a}`).join('\n')}
  compliance: []
${specializedBlock}
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

export function defaultAgentsForMode(mode: string): string[] {
  if (mode === 'startup') return ['orchestrator', 'backend-engineer', 'frontend-engineer'];
  if (mode === 'enterprise') return ['orchestrator', 'backend-engineer', 'frontend-engineer', 'test-engineer', 'docs-writer', 'compliance-reviewer', 'security-auditor'];
  return ['orchestrator', 'backend-engineer', 'frontend-engineer', 'test-engineer', 'docs-writer'];
}

/** Agent basenames (no `.md`) bundled in every profiles/<p>/agents/ dir. */
function profileAgentNames(forgeRoot: string, profile: string): string[] {
  const dir = join(forgeRoot, 'profiles', profile, 'agents');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.md')).map(f => basename(f, '.md'));
}

/** Every agent forge can install from its bundle (core + all profiles). */
function allBundledAgentNames(forgeRoot: string): Set<string> {
  const names = new Set<string>();
  const coreDir = join(forgeRoot, 'core', 'agents');
  if (existsSync(coreDir)) {
    for (const f of readdirSync(coreDir)) if (f.endsWith('.md')) names.add(basename(f, '.md'));
  }
  const profilesDir = join(forgeRoot, 'profiles');
  if (existsSync(profilesDir)) {
    for (const p of readdirSync(profilesDir)) {
      for (const n of profileAgentNames(forgeRoot, p)) names.add(n);
    }
  }
  return names;
}

export function installCoreAgents(forgeRoot: string, destDir: string, activeAgents: string[], profiles: string[], force: boolean, specialized: string[] = []): void {
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

  // Prune orphans: forge-managed agents left over from a PREVIOUS stack/profile
  // (e.g. laravel agents lingering after the project was reconfigured to another
  // backend). We only remove files forge itself bundles AND that the current
  // config no longer selects. Hand-authored agents (unknown to the bundle) and
  // registered Tier-3 specialized agents are never touched.
  const expected = new Set<string>([
    ...activeAgents,
    ...profiles.flatMap(p => profileAgentNames(forgeRoot, p)),
    ...specialized,
  ]);
  const bundled = allBundledAgentNames(forgeRoot);
  for (const file of readdirSync(destDir)) {
    if (!file.endsWith('.md')) continue;
    const name = basename(file, '.md');
    if (bundled.has(name) && !expected.has(name)) {
      unlinkSync(join(destDir, file));
    }
  }
}

export function installHooks(forgeRoot: string, destDir: string, mode: string, force: boolean): void {
  mkdirSync(destDir, { recursive: true });
  const hooksDir = join(forgeRoot, 'core', 'hooks');
  if (!existsSync(hooksDir)) return;

  // JS hooks (zero Python dependency, cross-platform — run via `node`, so they
  // work in PowerShell as well as bash). The .sh variants remain in the bundle
  // as reference but the installed/registered command is the .js version.
  const universal = ['pre-edit-check.js', 'post-turn-check.js', 'session-start.js', 'precompact-headroom.js'];
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

function buildSettings(language: string, mode: string, approvalsEnabled = false): Record<string, unknown> {
  const allowList: string[] = [];

  if (language === 'typescript' || language === 'javascript') {
    allowList.push('Bash(pnpm *)', 'Bash(npm *)', 'Bash(node *)', 'Bash(npx *)');
  } else if (language === 'python') {
    allowList.push('Bash(python3 *)', 'Bash(pip3 *)', 'Bash(pytest *)', 'Bash(ruff *)');
  } else if (language === 'ruby') {
    allowList.push('Bash(bundle *)', 'Bash(rails *)', 'Bash(rake *)');
  } else if (language === 'go') {
    allowList.push('Bash(go *)');
  } else if (language === 'php') {
    allowList.push('Bash(composer *)', 'Bash(php *)');
  } else if (language === 'rust') {
    allowList.push('Bash(cargo *)', 'Bash(rustc *)');
  } else if (language === 'java') {
    allowList.push('Bash(mvn *)', 'Bash(./mvnw *)', 'Bash(gradle *)', 'Bash(./gradlew *)');
  } else if (language === 'kotlin') {
    allowList.push('Bash(gradle *)', 'Bash(./gradlew *)');
  } else if (language === 'dart') {
    allowList.push('Bash(flutter *)', 'Bash(dart *)');
  }
  allowList.push('Bash(git *)');

  // All guardrail hooks run via `node` (cross-platform: no bash/python needed),
  // so the registered commands work in PowerShell, macOS and Linux alike.
  const hooks: Record<string, unknown[]> = {
    PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: 'node .claude/hooks/pre-edit-check.js' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'node .claude/hooks/post-turn-check.js' }] }],
    // PreCompact (Claude Code): re-anchor to .forge/state/STATE.md before the
    // runtime compacts context (SPEC-068). Only claude-code exposes this event.
    PreCompact: [{ hooks: [{ type: 'command', command: 'node .claude/hooks/precompact-headroom.js' }] }],
  };
  if (mode === 'standard' || mode === 'enterprise') {
    (hooks.PreToolUse as Array<Record<string, unknown>>).push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'node .claude/hooks/pre-bash-check.js' }],
    });
  }
  // Approval gate fail-open (SPEC-083 P6): solo si project.yaml declara
  // approvals.enabled: true. Así la entrada sobrevive a regeneraciones que
  // reemplazan `hooks` por completo (mergeSettings).
  if (approvalsEnabled) {
    (hooks.PreToolUse as Array<Record<string, unknown>>).push({
      matcher: 'Bash|Edit|Write|ExitPlanMode|AskUserQuestion',
      hooks: [{ type: 'command', command: 'node .claude/hooks/pre-approval-gate.js' }],
    });
  }

  return { permissions: { allow: allowList }, hooks };
}

/**
 * Mezcla los settings generados por forge con un `.claude/settings.json` ya
 * existente, preservando lo que forge NO gestiona:
 *  - top-level keys que no son `permissions`/`hooks` (especialmente `env`),
 *  - entradas previas en `permissions.allow` (unión sin duplicados).
 * forge gestiona `hooks` (registry de guardrails) por completo, así que esa key
 * se reemplaza siempre por la generada.
 */
function mergeSettings(
  generated: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };

  // forge gestiona hooks por completo.
  merged.hooks = generated.hooks;

  // permissions.allow: unión de existentes + generadas (sin duplicar, orden estable).
  const genPerms = (generated.permissions ?? {}) as { allow?: unknown };
  const existPerms = (existing.permissions ?? {}) as Record<string, unknown> & { allow?: unknown };
  const genAllow = Array.isArray(genPerms.allow) ? (genPerms.allow as string[]) : [];
  const existAllow = Array.isArray(existPerms.allow) ? (existPerms.allow as string[]) : [];
  const mergedAllow = [...existAllow];
  for (const entry of genAllow) {
    if (!mergedAllow.includes(entry)) mergedAllow.push(entry);
  }
  merged.permissions = { ...existPerms, allow: mergedAllow };

  return merged;
}

/**
 * Escribe `.claude/settings.json`. Si el archivo ya existe (y es JSON válido),
 * mezcla preservando keys externas (`env`, etc.) y permisos previos. Si no
 * existe o no se puede parsear, escribe los settings generados tal cual.
 * Respeta `force`: con `force=false` no toca un archivo existente.
 */
export function writeSettingsJson(path: string, language: string, mode: string, force: boolean, approvalsEnabled = false): void {
  const generated = buildSettings(language, mode, approvalsEnabled);
  if (existsSync(path)) {
    if (!force) return;
    let existing: Record<string, unknown> | null = null;
    try {
      existing = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    } catch {
      existing = null;
    }
    const out = existing && typeof existing === 'object'
      ? mergeSettings(generated, existing)
      : generated;
    writeFileSync(path, JSON.stringify(out, null, 2), 'utf-8');
    return;
  }
  writeFileSync(path, JSON.stringify(generated, null, 2), 'utf-8');
}

// Slash commands tied to a stack profile: they only belong in a project that
// activates that profile. e.g. the `laravel-*` commands must not land in a
// non-Laravel project. The key is the profile id; the value is the command-name
// prefix. Extend as new profiles ship stack-specific commands.
const PROFILE_COMMAND_PREFIXES: Record<string, string> = {
  laravel: 'laravel-',
};

/** True when `commandName` is gated to a profile that is NOT active. */
function commandIsGatedOut(commandName: string, profiles: string[]): boolean {
  for (const [profile, prefix] of Object.entries(PROFILE_COMMAND_PREFIXES)) {
    if (commandName.startsWith(prefix)) return !profiles.includes(profile);
  }
  return false; // universal command
}

export function installCommands(forgeRoot: string, destDir: string, force: boolean, profiles: string[] = []): void {
  mkdirSync(destDir, { recursive: true });
  const commandsDir = join(forgeRoot, 'adapters', 'claude-code', 'commands');
  if (!existsSync(commandsDir)) return;

  // Copy commands, skipping profile-gated ones whose profile isn't active.
  for (const entry of readdirSync(commandsDir)) {
    const src = join(commandsDir, entry);
    if (statSync(src).isDirectory()) {
      // Nested command groups (none are stack-gated today) — copy as-is.
      copyDir(src, join(destDir, entry), force);
    } else if (entry.endsWith('.md') && !commandIsGatedOut(basename(entry, '.md'), profiles)) {
      copyFile(src, join(destDir, entry), force);
    }
  }

  // Prune orphans: a stack-gated command left over from a previous stack (e.g.
  // laravel-* after the project was reconfigured to another backend).
  for (const file of readdirSync(destDir)) {
    if (file.endsWith('.md') && commandIsGatedOut(basename(file, '.md'), profiles)) {
      unlinkSync(join(destDir, file));
    }
  }
}

/**
 * Scaffolds docs/specs/ (+ _template.md), docs/daily-notes/ and the
 * .claude/architecture.rules file. Idempotent: never overwrites the spec
 * template or architecture.rules once they exist. Shared by `forge init` and
 * `forge adopt` so both lay down the same SDD scaffold.
 */
export function installSpecScaffold(forgeRoot: string, projectRoot: string, claudeDir: string, config: ProjectYaml): void {
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
}

/**
 * Builds and saves the .forge/manifest.json for a claude-code install: tracks
 * CLAUDE.md, settings.json, architecture.rules, all agents (active + compliance
 * + specialized) and the installed hooks/commands. Shared by init and adopt.
 */
export function saveInstallManifest(
  projectRoot: string, claudeDir: string, runtime: string,
  allAgents: string[], specializedAgents: string[], forgeVersion: string,
): void {
  const installedFiles = [
    'CLAUDE.md', '.claude/settings.json', '.claude/architecture.rules',
    ...allAgents.map(a => `.claude/agents/${a}.md`),
    ...specializedAgents.map(a => `.claude/agents/${a}.md`),
    ...listInstalledRelativeFiles(claudeDir, 'hooks', projectRoot),
    ...listInstalledRelativeFiles(claudeDir, 'commands', projectRoot),
    // SPEC-062: track the .forge/state/ artifact so `audit` detects drift.
    // buildManifest only records files that exist on disk, so unemitted ones
    // are simply skipped.
    ...STATE_SURFACE_FILES,
  ];
  const seen = new Set<string>();
  const uniqueFiles = installedFiles.filter(f => (seen.has(f) ? false : seen.add(f)));
  const ts = new Date().toISOString();
  saveManifest(projectRoot, buildManifest(runtime, uniqueFiles, projectRoot, forgeVersion, ts));
}

/**
 * Emits the `.forge/state/` artifact (SPEC-062): STATE.md / PLAN.md / CONTEXT.md
 * derived from project.yaml + docs/specs/. Shared by init and adopt; runtime-
 * agnostic. Always overwrites (the artifact is derived and regenerable).
 */
export function emitStateArtifact(projectRoot: string, config: ProjectYaml): void {
  const specsDir = join(projectRoot, config.paths?.specs ?? 'docs/specs');
  const stateDir = join(projectRoot, '.forge', 'state');
  mkdirSync(stateDir, { recursive: true });
  for (const surface of stateSurfaces(config, specsDir)) {
    writeFileSync(join(projectRoot, surface.path), surface.content, 'utf-8');
  }
}

function installKiro(forgeRoot: string, projectRoot: string, config: ProjectYaml, force: boolean): void {
  const kiroDir = join(projectRoot, '.kiro', 'steering');
  const hooksDir = join(projectRoot, '.kiro', 'hooks');
  mkdirSync(kiroDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });

  write(join(kiroDir, 'product.md'), generateKiroProduct(config), force);
  write(join(kiroDir, 'structure.md'), generateKiroStructure(config), force);
  write(join(kiroDir, 'agents.md'), generateKiroAgents(config), force);
  write(join(kiroDir, 'commands.md'), generateKiroCommands(config.deploy?.provider ?? 'tu plataforma de deploy'), force);
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
  // Non-interactive init (SPEC-069): answers come from a JSON file (a GUI/CI
  // produces it). Skips the wizard entirely; works with or without --dry-run.
  const fromIdx = args.indexOf('--from');
  const answersFile = fromIdx !== -1 ? (args[fromIdx + 1] ?? null) : null;

  const projectYamlPath = join(process.cwd(), 'project.yaml');
  const hasProjectYaml = existsSync(projectYamlPath);
  let config: ProjectYaml;

  // The interactive wizard runs only when there's no project.yaml, we're not in
  // dry-run, and no answers-file was supplied. On Node.js with Bun installed and
  // OpenTUI opted in, re-launch under Bun; otherwise the @clack/prompts wizard.
  if (!hasProjectYaml && !dryRun && !answersFile) {
    tryReLaunchWithBun(args); // exits the process if it re-launches under Bun
  }

  // The OpenTUI wizard renders its own full-screen header. The static boxen
  // header is only shown for the clack wizard, dry-run, and existing-config paths.
  // OpenTUI is opt-in (SPEC-065): only true when FORGE_ENABLE_OPENTUI=1.
  const usingOpenTUI = openTUIEnabled && isBun && !hasProjectYaml && !dryRun && !answersFile;
  if (!usingOpenTUI) printHeader();

  if (hasProjectYaml) {
    config = loadProjectYaml(projectYamlPath);
  } else if (answersFile) {
    // SPEC-069: build project.yaml from the answers file, no prompts.
    if (!existsSync(answersFile)) {
      console.error(`forge init: no se encontró el archivo de respuestas "${answersFile}".`);
      return 1;
    }
    let result;
    try {
      result = loadAnswers(JSON.parse(readFileSync(answersFile, 'utf-8')));
    } catch (e) {
      console.error(`forge init: el archivo de respuestas no es JSON válido — ${(e as Error).message}`);
      return 1;
    }
    const specialized = detectTier3Agents(process.cwd());
    if (!dryRun) {
      writeFileSync(projectYamlPath, buildProjectYaml(result, specialized), 'utf-8');
    }
    config = {
      project: { name: result.name, slug: result.slug, description: result.description, language: result.language, type: result.type, mode: result.mode, status: 'active' },
      stack: { backend: result.backend, backend_language: result.backendLanguage, frontend: result.frontend, frontend_language: result.frontendLanguage, database: result.database, orm: result.orm, package_manager: result.packageManager, testing: result.testing },
      agents: { active: defaultAgentsForMode(result.mode), compliance: [], specialized, profiles: result.profiles },
      runtimes: { active: [runtimeOverride ?? result.runtime] },
      skills: result.skills,
    };
  } else if (dryRun) {
    // Dry-run without config: show what a default standard project would install
    console.log(dim('  No project.yaml found — showing defaults for a "standard" project.') + '\n');
    config = {
      project: { name: 'My Project', slug: 'my-project', language: 'typescript', mode: 'standard', status: 'active' },
      agents: { active: defaultAgentsForMode('standard'), compliance: [], profiles: [] },
      runtimes: { active: [runtimeOverride ?? 'claude-code'] },
    };
  } else {
    // Run interactive wizard — @clack/prompts by default (cross-platform), and the
    // full-screen OpenTUI wizard only when opted in (FORGE_ENABLE_OPENTUI=1) and
    // running under Bun. See SPEC-065.
    let result;
    if (usingOpenTUI) {
      const { runOpenTUIWizard } = await import('../tui/wizard.js');
      result = await runOpenTUIWizard();
      // OpenTUI restored the screen; now show the static header for install phase
      printHeader();
    } else {
      result = await runWizard();
    }
    if (!result) { console.log('\nCancelado.'); return 1; }

    // Auto-detecta agentes Tier 3 existentes en .claude/agents/ (frontmatter
    // tier: 3) y los registra en agents.specialized del project.yaml generado.
    const specialized = detectTier3Agents(process.cwd());

    const yamlContent = buildProjectYaml(result, specialized);
    writeFileSync(projectYamlPath, yamlContent, 'utf-8');

    config = {
      project: { name: result.name, slug: result.slug, description: result.description, language: result.language, type: result.type, mode: result.mode, status: 'active' },
      stack: { backend: result.backend, backend_language: result.backendLanguage, frontend: result.frontend, frontend_language: result.frontendLanguage, database: result.database, orm: result.orm, package_manager: result.packageManager, testing: result.testing },
      agents: { active: defaultAgentsForMode(result.mode), compliance: [], specialized, profiles: result.profiles },
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
      { title: '.claude/commands/ — slash commands (SDD + stack)', tech: 'sdd' },
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
        task: () => installCoreAgents(forgeRoot, join(claudeDir, 'agents'), allAgents, profiles, force, config.agents?.specialized ?? []),
      },
      {
        title: 'Hooks (pre-edit-check.js, pre-bash-check.js)',
        tech: 'guardrail',
        task: () => installHooks(forgeRoot, join(claudeDir, 'hooks'), mode, force),
      },
      {
        title: 'Slash commands',
        tech: 'sdd workflow',
        task: () => installCommands(forgeRoot, join(claudeDir, 'commands'), force, profiles),
      },
      {
        title: 'CLAUDE.md',
        tech: 'generated',
        task: () => write(join(projectRoot, 'CLAUDE.md'), generateClaudeMd(config), force),
      },
      {
        title: 'settings.json',
        tech: 'permissions + hooks',
        task: () => writeSettingsJson(join(claudeDir, 'settings.json'), language, mode, force),
      },
      {
        title: 'docs/specs/ + architecture.rules',
        tech: 'scaffold',
        task: () => installSpecScaffold(forgeRoot, projectRoot, claudeDir, config),
      },
      // Knowledge base — only for projects that activate a wiki-* skill. Other
      // projects don't get a wiki/ dir forced on them.
      ...(hasWikiSkill(config) ? [{
        title: 'wiki/ (knowledge base)',
        tech: 'templated scaffold',
        task: () => { scaffoldWikiStructure(projectRoot, false); },
      }] : []),
      {
        title: '.forge/state/ (STATE, PLAN, CONTEXT)',
        tech: 'context re-anchor',
        task: () => emitStateArtifact(projectRoot, config),
      },
      {
        title: '.forge/manifest.json',
        tech: 'sha256 tracking',
        task: () => saveInstallManifest(
          projectRoot, claudeDir, runtime,
          allAgents, config.agents?.specialized ?? [], VERSION,
        ),
      },
    ]);

  } else if (runtime === 'opencode') {
    mkdirSync(join(projectRoot, '.opencode'), { recursive: true });
    write(join(projectRoot, 'AGENTS.md'), generateAgentsMd(config), force);

  } else if (runtime === 'codex') {
    write(join(projectRoot, 'AGENTS.md'), generateCodexAgentsMd(config), force);

  } else if (runtime === 'kiro') {
    installKiro(forgeRoot, projectRoot, config, force);

  } else {
    // Rules-based and other registry runtimes: write each surface from the descriptor.
    const descriptor = getRuntime(runtime);
    if (descriptor) {
      for (const surface of descriptor.surfaces(config)) {
        const absPath = join(projectRoot, surface.path);
        mkdirSync(dirname(absPath), { recursive: true });
        write(absPath, surface.content, force);
      }
    }
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
    borderStyle: boxenBorderStyle('round') as 'round' | 'classic',
    borderColor: 'green',
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
  }) + '\n');

  return 0;
}
