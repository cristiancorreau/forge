/**
 * Modelo resuelto del proyecto (SPEC-083 P2) — la data detrás de `forge export`.
 *
 * Resuelve project.yaml + los archivos instalados (.claude/agents/*.md,
 * .claude/commands/*.md) a un manifiesto machine-readable estable que valida
 * contra `export.schema.json` de @cristiancorreau/forge-schemas
 * ($id forge://schemas/v4/export). Un orquestador (mingako) lo consume para
 * inyectar agentes/skills/MCP en su runtime sin parsear los formatos nativos.
 *
 * Este módulo solo lee el filesystem: nunca imprime ni escribe.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { findProjectYaml, loadProjectYaml } from './yaml.js';
import { parseFrontmatter, parseAgentTools } from './unit-registry.js';
import { getRuntime } from './generators/registry.js';

/** Versión del contrato JSON de `forge export` (SemVer mayor como string). */
export const EXPORT_SCHEMA_VERSION = '1';

export interface ExportAgent {
  name: string;
  description: string;
  scope?: string;
  tools?: string[];
  model?: string;
  skills?: string[];
  mcpServers?: string[];
  sourceFile: string;
}

export interface ExportCommand {
  name: string;
  sourceFile: string;
}

export interface ExportMcpServer {
  name: string;
  autoApprove?: string[];
}

export interface ExportRuntimeInfo {
  label: string;
  kind: 'native' | 'rules';
  surfaces: string[];
}

export interface ProjectExportModel {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  project: {
    name: string;
    path: string;
    mode?: string;
    runtimes: string[];
    profiles: string[];
  };
  agents: ExportAgent[];
  commands: ExportCommand[];
  skills: string[];
  mcpServers: ExportMcpServer[];
  porRuntime?: Record<string, ExportRuntimeInfo>;
}

/** Normaliza un valor de frontmatter a lista de strings (CSV o lista YAML). */
function asStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map(v => v.trim()).filter(Boolean);
  return [];
}

/** Lista los .md de un directorio, orden estable. [] si no existe. */
function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.md')).sort();
}

/**
 * Construye el modelo resuelto del proyecto que contiene a `root`.
 * Lanza Error si no hay project.yaml resoluble desde `root`.
 */
export function buildExportModel(root: string = process.cwd()): ProjectExportModel {
  const yamlPath = findProjectYaml(root);
  if (!yamlPath) {
    throw new Error('No se encontró project.yaml — ejecutar forge init');
  }
  const config = loadProjectYaml(yamlPath);
  const projectRoot = dirname(yamlPath);

  // Normaliza listas de ids: el schema exige strings con minLength 1.
  const runtimes = (config.runtimes?.active ?? []).map(r => String(r).trim()).filter(Boolean);
  const profiles = (config.agents?.profiles ?? []).map(p => String(p).trim()).filter(Boolean);
  const scopeMap = config.agents?.scope ?? {};

  // Agentes instalados: .claude/agents/*.md, frontmatter resuelto.
  const agents: ExportAgent[] = [];
  const agentsDir = join(projectRoot, '.claude', 'agents');
  for (const file of listMarkdown(agentsDir)) {
    let content: string;
    try {
      content = readFileSync(join(agentsDir, file), 'utf-8');
    } catch {
      continue;
    }
    const fm = parseFrontmatter(content);
    const fileName = file.replace(/\.md$/, '');
    const name = typeof fm['name'] === 'string' && fm['name'].trim() ? fm['name'].trim() : fileName;
    const agent: ExportAgent = {
      name,
      description: typeof fm['description'] === 'string' ? fm['description'].trim() : '',
      sourceFile: `.claude/agents/${file}`,
    };
    const scope = scopeMap[name] ?? scopeMap[fileName];
    if (scope) agent.scope = scope;
    const tools = parseAgentTools(content);
    if (tools.length) agent.tools = tools;
    if (typeof fm['model'] === 'string' && fm['model'].trim()) agent.model = fm['model'].trim();
    const skills = asStringList(fm['skills']);
    if (skills.length) agent.skills = skills;
    const mcpServers = asStringList(fm['mcpServers'] ?? fm['mcp_servers']);
    if (mcpServers.length) agent.mcpServers = mcpServers;
    agents.push(agent);
  }

  // Slash commands instalados: .claude/commands/*.md.
  const commandsDir = join(projectRoot, '.claude', 'commands');
  const commands: ExportCommand[] = listMarkdown(commandsDir).map(file => ({
    name: file.replace(/\.md$/, ''),
    sourceFile: `.claude/commands/${file}`,
  }));

  // Skills activas (ids sin slash inicial, dedupe con orden estable).
  const skills = [...new Set(
    (Array.isArray(config.skills) ? config.skills : [])
      .map(s => String(s).replace(/^\//, '').trim())
      .filter(Boolean),
  )];

  // MCP servers declarados en project.yaml (forge declara, el runtime ejecuta).
  const mcpServers: ExportMcpServer[] = (config.mcp?.servers ?? [])
    .filter(s => s && typeof s.name === 'string' && s.name.trim())
    .map(s => {
      const entry: ExportMcpServer = { name: s.name.trim() };
      if (Array.isArray(s.auto_approve) && s.auto_approve.length) {
        entry.autoApprove = s.auto_approve.map(v => String(v));
      }
      return entry;
    });

  const model: ProjectExportModel = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    project: {
      name: (config.project?.name ?? '').trim() || '(sin nombre)',
      path: projectRoot,
      ...(config.project?.mode ? { mode: config.project.mode } : {}),
      runtimes,
      profiles,
    },
    agents,
    commands,
    skills,
    mcpServers,
  };

  // Desglose por runtime activo: superficies nativas que forge generaría.
  if (runtimes.length) {
    const porRuntime: Record<string, ExportRuntimeInfo> = {};
    for (const id of runtimes) {
      const descriptor = getRuntime(id);
      if (!descriptor) continue;
      let surfaces: string[] = [];
      try {
        surfaces = descriptor.surfaces(config).map(s => s.path);
      } catch {
        surfaces = [];
      }
      porRuntime[id] = { label: descriptor.label, kind: descriptor.kind, surfaces };
    }
    if (Object.keys(porRuntime).length) model.porRuntime = porRuntime;
  }

  return model;
}
