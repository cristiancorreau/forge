/**
 * Install data layer for `forge panel` — unified catalog search + idempotent
 * installers for skills, profiles and templates. See SPEC-034.
 *
 * Every function here is pure-ish: it reads/writes the filesystem and never
 * touches a TTY or prints, so the OpenTUI panel, the @clack fallback and the
 * test suite all share the same logic.
 *
 * CRITICAL: writes to project.yaml are SURGICAL (text-level) so the hand-
 * maintained file keeps its comments and block-style formatting. We never
 * js-yaml.dump the whole document.
 */
import {
  existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync,
  copyFileSync, statSync,
} from 'fs';
import { join } from 'path';
import { SKILLS } from './catalog.js';
import { findProjectYaml, loadProjectYaml } from './yaml.js';
import { listTemplates, type TemplateEntry } from './panel-data.js';

// ─── Types ────────────────────────────────────────────────────────────────

export type CatalogItemType = 'skill' | 'profile' | 'template';

export interface CatalogItem {
  type: CatalogItemType;
  /** Stable id used by the installers (skill id, profile name, template id). */
  id: string;
  /** Short human label for the UI. */
  label: string;
  /** One-line description. */
  description: string;
  /** True when it is already in project.yaml or already scaffolded on disk. */
  installed: boolean;
}

export interface InstallResult {
  ok: boolean;
  /** True when nothing changed because it was already installed. */
  alreadyInstalled: boolean;
  /** Human message (Spanish) describing the outcome. */
  message: string;
  /** Files created/touched (relative to projectRoot). */
  changed: string[];
}

// ─── project.yaml readers ────────────────────────────────────────────────────

/** Active skill ids from project.yaml (normalising leading slashes). [] on error. */
function activeSkillIds(projectRoot: string): string[] {
  const yamlPath = findProjectYaml(projectRoot);
  if (!yamlPath) return [];
  try {
    const cfg = loadProjectYaml(yamlPath);
    const raw = Array.isArray(cfg.skills) ? cfg.skills : [];
    return raw.map(s => String(s).replace(/^\//, ''));
  } catch {
    return [];
  }
}

/** Active profile names from project.yaml (agents.profiles). [] on error. */
function activeProfiles(projectRoot: string): string[] {
  const yamlPath = findProjectYaml(projectRoot);
  if (!yamlPath) return [];
  try {
    const cfg = loadProjectYaml(yamlPath);
    const raw = cfg.agents?.profiles;
    return Array.isArray(raw) ? raw.map(p => String(p)) : [];
  } catch {
    return [];
  }
}

/** Profile names available in the forge assets tree (profiles/<name>/). */
export function listAvailableProfiles(forgeRoot: string | null): string[] {
  if (!forgeRoot) return [];
  const dir = join(forgeRoot, 'profiles');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}

/**
 * Stable id for a template entry, used by installTemplate. Wiki templates all
 * collapse to the single `wiki` install target; spec/mode/claude-md keep their
 * file name (without extension) so each is addressable.
 */
export function templateInstallId(t: TemplateEntry): string {
  if (t.category === 'wiki') return 'wiki';
  return `${t.category}:${t.name}`;
}

/** Is a template (by its install id) already scaffolded in the project? */
function templateInstalled(projectRoot: string, id: string): boolean {
  if (id === 'wiki') return existsSync(join(projectRoot, 'wiki', 'index.md'));
  if (id === 'spec:spec-template.md') {
    return existsSync(join(projectRoot, 'docs', 'specs', '_template.md'));
  }
  if (id.startsWith('claude-md:')) {
    const name = id.slice('claude-md:'.length);
    if (name === 'project.md') return existsSync(join(projectRoot, 'CLAUDE.md'));
    if (name === 'architecture.rules') return existsSync(join(projectRoot, '.claude', 'architecture.rules'));
    return false;
  }
  // mode templates are not project-local files → never "installed".
  return false;
}

// ─── searchCatalog ───────────────────────────────────────────────────────────

const profileDescription = (name: string): string =>
  `Profile Tier 2 para el stack ${name} (agentes en .claude/agents/)`;

/**
 * Unified, case-insensitive substring search across installable items: skills,
 * profiles and templates. An empty query returns the whole catalog. Each item
 * is marked `installed` against project.yaml and/or the scaffolded state on
 * disk. Profiles and templates require a `forgeRoot`; with `forgeRoot === null`
 * only skills are returned.
 */
export function searchCatalog(
  forgeRoot: string | null,
  projectRoot: string,
  query: string,
): CatalogItem[] {
  const q = query.trim().toLowerCase();
  const skillSet = new Set(activeSkillIds(projectRoot));
  const profileSet = new Set(activeProfiles(projectRoot));

  const items: CatalogItem[] = [];

  // Skills.
  for (const s of SKILLS) {
    items.push({
      type: 'skill', id: s.id, label: s.command,
      description: `[${s.category}] ${s.purpose}`,
      installed: skillSet.has(s.id),
    });
  }

  // Profiles.
  for (const name of listAvailableProfiles(forgeRoot)) {
    items.push({
      type: 'profile', id: name, label: name,
      description: profileDescription(name),
      installed: profileSet.has(name),
    });
  }

  // Templates (wiki collapses to a single install target).
  const seenTpl = new Set<string>();
  for (const t of listTemplates(forgeRoot)) {
    const id = templateInstallId(t);
    if (seenTpl.has(id)) continue;
    seenTpl.add(id);
    const label = id === 'wiki' ? 'wiki' : t.name;
    const description = id === 'wiki'
      ? 'Estructura de wiki del proyecto (index, log, subdirs)'
      : t.description;
    items.push({
      type: 'template', id, label, description,
      installed: templateInstalled(projectRoot, id),
    });
  }

  if (!q) return items;
  return items.filter(it =>
    it.id.toLowerCase().includes(q) ||
    it.label.toLowerCase().includes(q) ||
    it.type.toLowerCase().includes(q) ||
    it.description.toLowerCase().includes(q),
  );
}

// ─── Surgical project.yaml editing ───────────────────────────────────────────

interface YamlEdit {
  changed: boolean;
  content: string;
}

/**
 * Append `item` to a TOP-LEVEL block/flat list `key` in `content`, preserving
 * comments and formatting. Handles three shapes:
 *  - block list:  `skills:\n  - a\n  - b`  → inserts `  - item` after the block
 *  - flat list:   `skills: [a, b]`         → rewrites to `[a, b, item]`
 *  - empty/value: `skills:` or missing      → creates a block list
 * If `item` is already present (block or flat), returns unchanged.
 */
function appendTopLevelListItem(content: string, key: string, item: string): YamlEdit {
  const lines = content.split('\n');
  const keyRe = new RegExp(`^${key}:(.*)$`);

  let keyIdx = -1;
  let inlineRest = '';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(keyRe);
    if (m) { keyIdx = i; inlineRest = m[1]; break; }
  }

  // Key missing → append a fresh block list at the end of the document.
  if (keyIdx === -1) {
    const trimmed = content.replace(/\n+$/, '');
    const block = `${key}:\n  - ${item}`;
    return { changed: true, content: `${trimmed}\n\n${block}\n` };
  }

  const rest = inlineRest.trim();

  // Flat list form: `key: [a, b]`.
  const flat = rest.match(/^\[(.*)\]$/);
  if (flat) {
    const inner = flat[1].trim();
    const current = inner.length
      ? inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : [];
    if (current.includes(item)) return { changed: false, content };
    current.push(item);
    lines[keyIdx] = `${key}: [${current.join(', ')}]`;
    return { changed: true, content: lines.join('\n') };
  }

  // Block list form (or empty value → becomes a block list). Find the extent of
  // the block: contiguous following lines that are `  - ...` items (or blanks).
  let lastItemIdx = keyIdx;
  let indent = '  ';
  let foundItem = false;
  for (let i = keyIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s+)-\s+(.*)$/);
    if (m) {
      foundItem = true;
      indent = m[1];
      lastItemIdx = i;
      const existing = m[2].trim().replace(/^["']|["']$/g, '');
      if (existing === item) return { changed: false, content };
      continue;
    }
    // Allow blank lines/comments that belong to the block to be skipped only
    // before the first item; once items started, stop at the first non-item.
    if (!foundItem && (line.trim() === '' || line.trim().startsWith('#'))) continue;
    break;
  }

  // If the value was inline non-list (e.g. `key: something`), don't touch it —
  // append a fresh block list at the end instead (safe fallback).
  if (!foundItem && rest.length > 0) {
    const trimmed = content.replace(/\n+$/, '');
    return { changed: true, content: `${trimmed}\n\n${key}:\n  - ${item}\n` };
  }

  lines.splice(lastItemIdx + 1, 0, `${indent}- ${item}`);
  return { changed: true, content: lines.join('\n') };
}

/**
 * Append `name` to the `agents.profiles` block list, creating `agents:` and/or
 * `profiles:` as needed while preserving the rest of the document. Returns
 * unchanged if `name` is already present.
 */
function appendProfile(content: string, name: string): YamlEdit {
  const lines = content.split('\n');

  // Locate a top-level `agents:` mapping header (`agents:` optionally followed
  // by a comment). An inline value like `agents: {}` is not a block we can edit.
  let agentsIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^agents:\s*(#.*)?$/.test(lines[i])) { agentsIdx = i; break; }
  }

  // No agents: block → append a fresh one.
  if (agentsIdx === -1) {
    const trimmed = content.replace(/\n+$/, '');
    return { changed: true, content: `${trimmed}\n\nagents:\n  profiles:\n    - ${name}\n` };
  }

  // Find `profiles:` inside the agents block (indented child).
  let profilesIdx = -1;
  let agentsBlockEnd = lines.length;
  for (let i = agentsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // A non-indented, non-blank, non-comment line ends the agents block.
    if (line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('\t')) {
      agentsBlockEnd = i;
      break;
    }
    if (/^\s+profiles:\s*(\[.*\])?\s*(#.*)?$/.test(line) || /^\s+profiles:\s+\S/.test(line)) {
      profilesIdx = i;
      break;
    }
  }

  // profiles: missing → insert a `profiles:` child at the end of the agents block.
  if (profilesIdx === -1) {
    // Determine the child indent used inside agents (default 2 spaces).
    let childIndent = '  ';
    for (let i = agentsIdx + 1; i < agentsBlockEnd; i++) {
      const m = lines[i].match(/^(\s+)\S/);
      if (m) { childIndent = m[1]; break; }
    }
    const insertAt = agentsBlockEnd;
    lines.splice(insertAt, 0, `${childIndent}profiles:`, `${childIndent}  - ${name}`);
    return { changed: true, content: lines.join('\n') };
  }

  // profiles: present — handle flat or block forms within the nested scope.
  const profLine = lines[profilesIdx];
  const inlineRest = profLine.replace(/^\s+profiles:/, '').trim();
  const flat = inlineRest.match(/^\[(.*)\]$/);
  if (flat) {
    const inner = flat[1].trim();
    const current = inner.length
      ? inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : [];
    if (current.includes(name)) return { changed: false, content };
    current.push(name);
    const lead = profLine.match(/^(\s+)/)?.[1] ?? '  ';
    lines[profilesIdx] = `${lead}profiles: [${current.join(', ')}]`;
    return { changed: true, content: lines.join('\n') };
  }

  // Block list under profiles:.
  let lastItemIdx = profilesIdx;
  let itemIndent: string | null = null;
  let foundItem = false;
  for (let i = profilesIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s+)-\s+(.*)$/);
    if (m) {
      foundItem = true;
      itemIndent = m[1];
      lastItemIdx = i;
      const existing = m[2].trim().replace(/^["']|["']$/g, '');
      if (existing === name) return { changed: false, content };
      continue;
    }
    if (!foundItem && (line.trim() === '' || line.trim().startsWith('#'))) continue;
    break;
  }
  if (itemIndent === null) {
    const lead = profLine.match(/^(\s+)/)?.[1] ?? '  ';
    itemIndent = lead + '  ';
  }
  lines.splice(lastItemIdx + 1, 0, `${itemIndent}- ${name}`);
  return { changed: true, content: lines.join('\n') };
}

/** Find or build the project.yaml path for a project root. */
function projectYamlPath(projectRoot: string): string {
  return findProjectYaml(projectRoot) ?? join(projectRoot, 'project.yaml');
}

// ─── File install helpers ────────────────────────────────────────────────────

function copyDir(src: string, dest: string): string[] {
  const out: string[] = [];
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) {
      out.push(...copyDir(s, d));
    } else if (!existsSync(d)) {
      copyFileSync(s, d);
      out.push(d);
    }
  }
  return out;
}

const rel = (projectRoot: string, abs: string): string =>
  abs.startsWith(projectRoot + '/') ? abs.slice(projectRoot.length + 1) : abs;

// ─── installSkill ────────────────────────────────────────────────────────────

/**
 * Activate a skill: add its id to project.yaml `skills` (dedupe, surgical edit)
 * and copy its slash command into `.claude/commands/` when one is bundled
 * (`adapters/claude-code/commands/<id>.md`). Idempotent.
 */
export function installSkill(projectRoot: string, forgeRoot: string | null, id: string): InstallResult {
  const known = SKILLS.some(s => s.id === id);
  if (!known) {
    return { ok: false, alreadyInstalled: false, message: `Skill desconocida: ${id}`, changed: [] };
  }

  const yamlPath = projectYamlPath(projectRoot);
  const changed: string[] = [];
  let alreadyInYaml = false;

  if (existsSync(yamlPath)) {
    const before = readFileSync(yamlPath, 'utf-8');
    const edit = appendTopLevelListItem(before, 'skills', id);
    if (edit.changed) {
      writeFileSync(yamlPath, edit.content, 'utf-8');
      changed.push(rel(projectRoot, yamlPath));
    } else {
      alreadyInYaml = true;
    }
  } else {
    // No project.yaml yet → create a minimal one with the skill.
    writeFileSync(yamlPath, `project:\n  name: "Project"\n  mode: standard\n\nskills:\n  - ${id}\n`, 'utf-8');
    changed.push(rel(projectRoot, yamlPath));
  }

  // Copy the slash command if one is bundled for this id.
  if (forgeRoot) {
    const cmdSrc = join(forgeRoot, 'adapters', 'claude-code', 'commands', `${id}.md`);
    if (existsSync(cmdSrc)) {
      const cmdDir = join(projectRoot, '.claude', 'commands');
      const cmdDest = join(cmdDir, `${id}.md`);
      if (!existsSync(cmdDest)) {
        mkdirSync(cmdDir, { recursive: true });
        copyFileSync(cmdSrc, cmdDest);
        changed.push(rel(projectRoot, cmdDest));
      }
    }
  }

  const alreadyInstalled = alreadyInYaml && changed.length === 0;
  return {
    ok: true,
    alreadyInstalled,
    message: alreadyInstalled ? `La skill ${id} ya estaba activa.` : `Skill ${id} activada.`,
    changed,
  };
}

// ─── installProfile ──────────────────────────────────────────────────────────

/**
 * Activate a profile: add its name to project.yaml `agents.profiles` (dedupe,
 * surgical edit) and install the profile's agents into `.claude/agents/`.
 * Idempotent.
 */
export function installProfile(projectRoot: string, forgeRoot: string | null, name: string): InstallResult {
  if (!forgeRoot) {
    return { ok: false, alreadyInstalled: false, message: 'forge root no disponible para instalar el profile.', changed: [] };
  }
  const profileDir = join(forgeRoot, 'profiles', name);
  if (!existsSync(profileDir)) {
    return { ok: false, alreadyInstalled: false, message: `Profile desconocido: ${name}`, changed: [] };
  }

  const yamlPath = projectYamlPath(projectRoot);
  const changed: string[] = [];
  let alreadyInYaml = false;

  if (existsSync(yamlPath)) {
    const before = readFileSync(yamlPath, 'utf-8');
    const edit = appendProfile(before, name);
    if (edit.changed) {
      writeFileSync(yamlPath, edit.content, 'utf-8');
      changed.push(rel(projectRoot, yamlPath));
    } else {
      alreadyInYaml = true;
    }
  } else {
    writeFileSync(
      yamlPath,
      `project:\n  name: "Project"\n  mode: standard\n\nagents:\n  profiles:\n    - ${name}\n`,
      'utf-8',
    );
    changed.push(rel(projectRoot, yamlPath));
  }

  // Install the profile's agent files into .claude/agents/.
  const agentsSrc = join(profileDir, 'agents');
  if (existsSync(agentsSrc)) {
    const dest = join(projectRoot, '.claude', 'agents');
    for (const f of copyDir(agentsSrc, dest)) changed.push(rel(projectRoot, f));
  }

  const alreadyInstalled = alreadyInYaml && changed.length === 0;
  return {
    ok: true,
    alreadyInstalled,
    message: alreadyInstalled ? `El profile ${name} ya estaba activo.` : `Profile ${name} activado.`,
    changed,
  };
}

// ─── installTemplate ─────────────────────────────────────────────────────────

/**
 * Scaffold a template into the project (idempotent):
 *  - `wiki`               → full templated wiki structure
 *  - `spec:spec-template.md` → docs/specs/_template.md from the bundled spec template
 *  - `claude-md:project.md`  → CLAUDE.md if missing
 *  - `claude-md:architecture.rules` → .claude/architecture.rules if missing
 *  - `mode:*`             → project.yaml mode template into docs/ (reference copy)
 */
export function installTemplate(projectRoot: string, forgeRoot: string | null, id: string): InstallResult {
  if (!forgeRoot) {
    return { ok: false, alreadyInstalled: false, message: 'forge root no disponible para instalar el template.', changed: [] };
  }
  const changed: string[] = [];

  // Wiki — reuse the canonical scaffolder via dynamic import to avoid pulling
  // the wiki command module into the panel data layer eagerly.
  if (id === 'wiki') {
    const existed = existsSync(join(projectRoot, 'wiki', 'index.md'));
    scaffoldWiki(projectRoot, forgeRoot);
    if (!existed) changed.push('wiki/');
    return {
      ok: true, alreadyInstalled: existed,
      message: existed ? 'El wiki ya estaba inicializado.' : 'Wiki inicializado.',
      changed,
    };
  }

  if (id === 'spec:spec-template.md') {
    const src = join(forgeRoot, 'core', 'templates', 'spec-template.md');
    const destDir = join(projectRoot, 'docs', 'specs');
    const dest = join(destDir, '_template.md');
    if (existsSync(dest)) {
      return { ok: true, alreadyInstalled: true, message: 'La plantilla de spec ya existía.', changed };
    }
    if (!existsSync(src)) {
      return { ok: false, alreadyInstalled: false, message: 'No se encontró spec-template.md en el forge root.', changed };
    }
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, dest);
    changed.push('docs/specs/_template.md');
    return { ok: true, alreadyInstalled: false, message: 'Plantilla de spec instalada en docs/specs/_template.md.', changed };
  }

  if (id.startsWith('claude-md:')) {
    const name = id.slice('claude-md:'.length);
    const src = join(forgeRoot, 'core', 'templates', 'claude-md', name);
    if (!existsSync(src)) {
      return { ok: false, alreadyInstalled: false, message: `No se encontró el template ${name}.`, changed };
    }
    if (name === 'architecture.rules') {
      const destDir = join(projectRoot, '.claude');
      const dest = join(destDir, 'architecture.rules');
      if (existsSync(dest)) return { ok: true, alreadyInstalled: true, message: 'architecture.rules ya existía.', changed };
      mkdirSync(destDir, { recursive: true });
      copyFileSync(src, dest);
      changed.push('.claude/architecture.rules');
      return { ok: true, alreadyInstalled: false, message: 'architecture.rules instalado.', changed };
    }
    // project.md / global.md → reference copy under docs/.
    const destDir = join(projectRoot, 'docs');
    const dest = join(destDir, name);
    if (existsSync(dest)) return { ok: true, alreadyInstalled: true, message: `${name} ya existía en docs/.`, changed };
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, dest);
    changed.push(`docs/${name}`);
    return { ok: true, alreadyInstalled: false, message: `${name} copiado a docs/.`, changed };
  }

  if (id.startsWith('mode:')) {
    const name = id.slice('mode:'.length);
    const src = join(forgeRoot, 'templates', 'modes', name);
    if (!existsSync(src)) {
      return { ok: false, alreadyInstalled: false, message: `No se encontró el mode template ${name}.`, changed };
    }
    // A mode template is a reference for project.yaml — copy under docs/ so it
    // never clobbers the live project.yaml.
    const destDir = join(projectRoot, 'docs', 'modes');
    const dest = join(destDir, name);
    if (existsSync(dest)) return { ok: true, alreadyInstalled: true, message: `El mode ${name} ya estaba copiado.`, changed };
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, dest);
    changed.push(`docs/modes/${name}`);
    return { ok: true, alreadyInstalled: false, message: `Mode template ${name} copiado a docs/modes/.`, changed };
  }

  return { ok: false, alreadyInstalled: false, message: `Template desconocido: ${id}`, changed };
}

/**
 * Minimal wiki scaffolder embedded here to keep the data layer free of the
 * interactive wiki command module. Mirrors scaffoldWikiStructure: 5 subdirs,
 * index.md/log.md and the per-subdir _template.md seeds, from the bundled
 * templates with safe inline fallbacks. Idempotent (never overwrites).
 */
function scaffoldWiki(projectRoot: string, forgeRoot: string): void {
  const root = join(projectRoot, 'wiki');
  const tplDir = join(forgeRoot, 'templates', 'wiki');
  const SUBDIRS = ['raw', 'concepts', 'entities', 'sources', 'synthesis'];
  const TEMPLATED = ['concepts', 'entities', 'sources', 'synthesis'];
  const FALLBACK: Record<string, string> = {
    'index.md': '# Wiki Index\n\n<!-- generado por forge -->\n',
    'log.md': '# Wiki Log\n\n<!-- ingesta registrada aquí -->\n',
  };

  for (const sub of SUBDIRS) mkdirSync(join(root, sub), { recursive: true });

  for (const fname of ['index.md', 'log.md']) {
    const dest = join(root, fname);
    if (existsSync(dest)) continue;
    const tpl = join(tplDir, fname);
    if (existsSync(tpl)) copyFileSync(tpl, dest);
    else writeFileSync(dest, FALLBACK[fname], 'utf-8');
  }

  for (const sub of TEMPLATED) {
    const dest = join(root, sub, '_template.md');
    if (existsSync(dest)) continue;
    const tpl = join(tplDir, sub, '_template.md');
    if (existsSync(tpl)) copyFileSync(tpl, dest);
  }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/** Install any catalog item by type. Convenience wrapper for the UI layers. */
export function installItem(
  projectRoot: string,
  forgeRoot: string | null,
  item: Pick<CatalogItem, 'type' | 'id'>,
): InstallResult {
  switch (item.type) {
    case 'skill':    return installSkill(projectRoot, forgeRoot, item.id);
    case 'profile':  return installProfile(projectRoot, forgeRoot, item.id);
    case 'template': return installTemplate(projectRoot, forgeRoot, item.id);
    default:         return { ok: false, alreadyInstalled: false, message: 'Tipo desconocido', changed: [] };
  }
}
