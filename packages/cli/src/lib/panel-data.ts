/**
 * Non-interactive data layer for `forge panel`.
 *
 * Every function here is pure-ish (reads the filesystem, never prints, never
 * touches a TTY) so the OpenTUI panel, the @clack fallback and the test suite
 * can all share the same logic. See SPEC-033.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { SKILLS, type SkillInfo } from './catalog.js';
import { findProjectYaml, loadProjectYaml, type ProjectYaml } from './yaml.js';

// ─── Skills search / filter ─────────────────────────────────────────────────

export interface SkillRow extends SkillInfo {
  active: boolean;
}

/** Read the active skill ids from a project.yaml (skills:), normalising slashes. */
export function loadActiveSkillIds(root: string): Set<string> {
  const yamlPath = findProjectYaml(root);
  if (!yamlPath) return new Set();
  try {
    const config = loadProjectYaml(yamlPath);
    const raw = Array.isArray(config.skills) ? config.skills : [];
    return new Set(raw.map(s => String(s).replace(/^\//, '')));
  } catch {
    return new Set();
  }
}

/**
 * Returns the unique skill categories from the catalog, sorted alphabetically.
 * The `root` parameter is accepted for API consistency (future: per-project
 * overrides) but is not used today since categories derive from the static SKILLS array.
 */
export function getSkillCategories(_root: string = process.cwd()): string[] {
  const seen = new Set<string>();
  for (const s of SKILLS) seen.add(s.category);
  return [...seen].sort();
}

/**
 * Filter the skill catalog by a free-text query and an optional category.
 *
 * - Matches (case-insensitive, substring) against id, command, category,
 *   purpose and trigger. An empty query returns the whole catalog.
 * - When `category` is provided, only skills whose `category` exactly matches
 *   (case-insensitive) are included. Omitting `category` (or passing `undefined`)
 *   preserves the previous behaviour (no category filter).
 * - Each row is marked `active` if it is enabled in the project.yaml resolved
 *   from `root`.
 */
export function searchSkills(
  query: string,
  root: string = process.cwd(),
  category?: string,
): SkillRow[] {
  const activeIds = loadActiveSkillIds(root);
  const q = query.trim().toLowerCase();
  const catFilter = category ? category.toLowerCase() : undefined;
  let rows = SKILLS.map(s => ({ ...s, active: activeIds.has(s.id) }));

  // Category pre-filter (exact, case-insensitive).
  if (catFilter) {
    rows = rows.filter(s => s.category.toLowerCase() === catFilter);
  }

  if (!q) return rows;
  return rows.filter(s =>
    s.id.toLowerCase().includes(q) ||
    s.command.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q) ||
    s.purpose.toLowerCase().includes(q) ||
    s.trigger.toLowerCase().includes(q),
  );
}

// ─── Hooks listing ───────────────────────────────────────────────────────────

export interface HookEntry {
  /** Hook file name, e.g. pre-edit-check.js. */
  hook: string;
  /** Claude Code lifecycle event (PreToolUse | Stop | SessionStart | …). */
  event: string;
  /** Tool matcher (Edit|Write, Bash, …) — empty when the event has no matcher. */
  matcher: string;
  /** Human description of what the hook does (from the registry). */
  description: string;
  /** Which group the hook belongs to: universal | standard | unknown. */
  mode: 'universal' | 'standard' | 'unknown';
  /** True when the hook file is actually present in .claude/hooks/. */
  installed: boolean;
}

interface RegistryHook {
  hook: string;
  event?: string;
  matcher?: string;
  description?: string;
}
interface HooksRegistry {
  universal?: RegistryHook[];
  standard?: RegistryHook[];
}

/** Parse core/hooks/hooks-registry.yaml from the forge root. Returns {} on error. */
export function loadHooksRegistry(forgeRoot: string): HooksRegistry {
  const path = join(forgeRoot, 'core', 'hooks', 'hooks-registry.yaml');
  if (!existsSync(path)) return {};
  try {
    const data = yaml.load(readFileSync(path, 'utf-8')) as HooksRegistry;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** Collapse a multi-line YAML folded description into a single line. */
function oneLine(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Build the unified hook list: every hook declared in the registry plus any
 * extra hook found on disk in `<projectRoot>/.claude/hooks/` that the registry
 * doesn't know about. Each entry carries its event/matcher/mode and whether it
 * is installed in the project.
 */
export function listInstalledHooks(projectRoot: string, forgeRoot: string | null): HookEntry[] {
  const registry = forgeRoot ? loadHooksRegistry(forgeRoot) : {};
  const hooksDir = join(projectRoot, '.claude', 'hooks');
  const onDisk = new Set<string>(
    existsSync(hooksDir)
      ? readdirSync(hooksDir).filter(f => statSync(join(hooksDir, f)).isFile())
      : [],
  );

  const entries: HookEntry[] = [];
  const seen = new Set<string>();

  const pushGroup = (group: RegistryHook[] | undefined, mode: 'universal' | 'standard') => {
    for (const h of group ?? []) {
      if (!h?.hook) continue;
      seen.add(h.hook);
      entries.push({
        hook: h.hook,
        event: h.event ?? '—',
        matcher: h.matcher ?? '',
        description: oneLine(h.description),
        mode,
        installed: onDisk.has(h.hook),
      });
    }
  };
  pushGroup(registry.universal, 'universal');
  pushGroup(registry.standard, 'standard');

  // Hooks present on disk but not declared in the registry.
  for (const f of [...onDisk].sort()) {
    if (seen.has(f)) continue;
    entries.push({
      hook: f, event: '—', matcher: '', description: '(no documentado en el registry)',
      mode: 'unknown', installed: true,
    });
  }

  return entries;
}

// ─── Templates listing ───────────────────────────────────────────────────────

export interface TemplateEntry {
  /** Display name. */
  name: string;
  /** Category bucket: wiki | spec | mode | claude-md. */
  category: 'wiki' | 'spec' | 'mode' | 'claude-md';
  /** Path relative to the forge root. */
  relPath: string;
  /** Short human description. */
  description: string;
}

const MODE_DESCRIPTIONS: Record<string, string> = {
  'startup.yaml.tpl': 'Modo startup — overhead mínimo, equipo pequeño',
  'enterprise.yaml.tpl': 'Modo enterprise — compliance, auditoría, multi-equipo',
  'multi-runtime.yaml.tpl': 'Multi-runtime — un project.yaml para los 4 runtimes',
  'new-stack.yaml.tpl': 'Stack nuevo — plantilla base para empezar de cero',
};

const WIKI_DESCRIPTIONS: Record<string, string> = {
  'index.md': 'Índice raíz del wiki del proyecto',
  'log.md': 'Bitácora de ingestas del wiki',
  'concepts/_template.md': 'Plantilla de nota de concepto',
  'entities/_template.md': 'Plantilla de nota de entidad',
  'sources/_template.md': 'Plantilla de nota de fuente',
  'synthesis/_template.md': 'Plantilla de nota de síntesis',
};

const CLAUDE_MD_DESCRIPTIONS: Record<string, string> = {
  'project.md': 'CLAUDE.md base de un proyecto forge',
  'global.md': 'Instrucciones globales (~/.claude/CLAUDE.md)',
  'architecture.rules': 'Reglas de arquitectura del proyecto',
};

/** Recursively collect files under a dir, returning paths relative to `base`. */
function walkRel(base: string, dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkRel(base, full, acc);
    else acc.push(full.slice(base.length + 1).split('\\').join('/'));
  }
  return acc;
}

/**
 * List the templates bundled with forge: wiki seeds, the spec template, the
 * project.yaml mode templates and the claude-md templates. Paths are relative to
 * `forgeRoot`. Returns [] if `forgeRoot` is null.
 */
export function listTemplates(forgeRoot: string | null): TemplateEntry[] {
  if (!forgeRoot) return [];
  const out: TemplateEntry[] = [];

  // Spec template.
  const specPath = join(forgeRoot, 'core', 'templates', 'spec-template.md');
  if (existsSync(specPath)) {
    out.push({
      name: 'spec-template.md', category: 'spec',
      relPath: 'core/templates/spec-template.md',
      description: 'Plantilla de spec SDD (docs/specs/_template.md)',
    });
  }

  // Mode templates (templates/modes/*).
  const modesDir = join(forgeRoot, 'templates', 'modes');
  if (existsSync(modesDir)) {
    for (const f of readdirSync(modesDir).sort()) {
      out.push({
        name: f, category: 'mode',
        relPath: `templates/modes/${f}`,
        description: MODE_DESCRIPTIONS[f] ?? 'Plantilla de project.yaml',
      });
    }
  }

  // Wiki templates (templates/wiki/**).
  const wikiDir = join(forgeRoot, 'templates', 'wiki');
  for (const rel of walkRel(wikiDir, wikiDir).sort()) {
    out.push({
      name: rel, category: 'wiki',
      relPath: `templates/wiki/${rel}`,
      description: WIKI_DESCRIPTIONS[rel] ?? 'Plantilla de página de wiki',
    });
  }

  // claude-md templates (core/templates/claude-md/*).
  const cmDir = join(forgeRoot, 'core', 'templates', 'claude-md');
  if (existsSync(cmDir)) {
    for (const f of readdirSync(cmDir).sort()) {
      out.push({
        name: f, category: 'claude-md',
        relPath: `core/templates/claude-md/${f}`,
        description: CLAUDE_MD_DESCRIPTIONS[f] ?? 'Plantilla CLAUDE.md',
      });
    }
  }

  return out;
}

// ─── Configuration summary ───────────────────────────────────────────────────

export interface ConfigSummary {
  found: boolean;
  yamlPath: string | null;
  name: string;
  mode: string;
  language: string;
  stack: Array<{ key: string; value: string }>;
  agentsActive: string[];
  agentsSpecialized: string[];
  agentsCompliance: string[];
  profiles: string[];
  skills: string[];
  runtimes: string[];
  compliance: string[];
  deploy: { provider?: string; url?: string } | null;
}

/**
 * Build a structured, view-friendly summary of a project's project.yaml. When no
 * config is found, `found` is false and the rest of the fields are empty.
 */
export function getConfigSummary(root: string = process.cwd()): ConfigSummary {
  const empty: ConfigSummary = {
    found: false, yamlPath: null, name: '', mode: '', language: '',
    stack: [], agentsActive: [], agentsSpecialized: [], agentsCompliance: [],
    profiles: [], skills: [], runtimes: [], compliance: [], deploy: null,
  };

  const yamlPath = findProjectYaml(root);
  if (!yamlPath) return empty;

  let config: ProjectYaml;
  try {
    config = loadProjectYaml(yamlPath);
  } catch {
    return { ...empty, yamlPath };
  }

  const stack: Array<{ key: string; value: string }> = [];
  const s = config.stack ?? {};
  const pushStack = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      if (value.length) stack.push({ key, value: value.join(', ') });
    } else {
      stack.push({ key, value: String(value) });
    }
  };
  pushStack('backend', s.backend);
  pushStack('frontend', s.frontend);
  pushStack('database', s.database);
  pushStack('orm', s.orm);
  pushStack('package_manager', s.package_manager);
  pushStack('testing', s.testing);

  return {
    found: true,
    yamlPath,
    name: config.project?.name ?? '(sin nombre)',
    mode: config.project?.mode ?? '(sin mode)',
    language: config.project?.language ?? '(sin lenguaje)',
    stack,
    agentsActive: config.agents?.active ?? [],
    agentsSpecialized: config.agents?.specialized ?? [],
    agentsCompliance: config.agents?.compliance ?? [],
    profiles: config.agents?.profiles ?? [],
    skills: Array.isArray(config.skills) ? config.skills.map(x => String(x)) : [],
    runtimes: config.runtimes?.active ?? [],
    compliance: config.compliance?.frameworks ?? [],
    deploy: config.deploy ? { provider: config.deploy.provider, url: config.deploy.production_url } : null,
  };
}
