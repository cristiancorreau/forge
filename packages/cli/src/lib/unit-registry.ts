/**
 * SPEC-063 — Registro declarativo de capacidades (capability registry).
 *
 * Funciones puras (sin estado global, sin red, mismo input → mismo output) que
 * cargan `core/registry/units.yaml` y validan parity entre el registro y los
 * archivos en disco, mas drift de tools fuera del contrato declarado.
 *
 * Reusado por `forge audit` y por el parity-test.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface Unit {
  name: string;
  scope: string;
  /** Conjunto de tools permitidas por el contrato. Vacio para skills. */
  tools: string[];
  /** Artefactos/entregables prometidos. */
  outputs: string[];
  /** Metadata declarativa opcional. */
  phase?: string;
}

export interface UnitRegistry {
  agents: Unit[];
  skills: Unit[];
}

export interface ParityResult {
  ok: boolean;
  errors: string[];
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Reusa el contrato del frontmatter `---` ya presente en agentes/skills core.
 * Devuelve el objeto del frontmatter o {} si no hay fence valido.
 * Tolera CRLF (checkouts de Windows).
 */
export function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    const data = yaml.load(match[1]);
    if (data && typeof data === 'object') return data as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

/**
 * Extrae la lista de tools del frontmatter de un agente. El frontmatter las
 * declara como string separada por comas: `tools: Read, Grep, Glob`.
 * Devuelve [] si no hay campo `tools`.
 */
export function parseAgentTools(content: string): string[] {
  const fm = parseFrontmatter(content);
  const raw = fm['tools'];
  if (typeof raw !== 'string') {
    if (Array.isArray(raw)) return raw.map(t => String(t).trim()).filter(Boolean);
    return [];
  }
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
}

function normalizeUnit(raw: unknown): Unit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['name'] !== 'string') return null;
  const tools = Array.isArray(r['tools'])
    ? r['tools'].map(t => String(t).trim()).filter(Boolean)
    : [];
  const outputs = Array.isArray(r['outputs'])
    ? r['outputs'].map(o => String(o).trim()).filter(Boolean)
    : [];
  const unit: Unit = {
    name: r['name'],
    scope: typeof r['scope'] === 'string' ? r['scope'] : '/',
    tools,
    outputs,
  };
  if (typeof r['phase'] === 'string') unit.phase = r['phase'];
  return unit;
}

/**
 * Carga el registro de unidades desde un archivo YAML.
 * Pura respecto del path dado: lee el archivo y devuelve la estructura.
 * Si el archivo no existe o esta malformado, devuelve listas vacias.
 */
export function loadUnits(path: string): UnitRegistry {
  if (!existsSync(path)) return { agents: [], skills: [] };
  let doc: unknown;
  try {
    doc = yaml.load(readFileSync(path, 'utf-8'));
  } catch {
    return { agents: [], skills: [] };
  }
  if (!doc || typeof doc !== 'object') return { agents: [], skills: [] };
  const d = doc as Record<string, unknown>;
  const collect = (key: string): Unit[] => {
    const list = d[key];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeUnit).filter((u): u is Unit => u !== null);
  };
  return { agents: collect('agents'), skills: collect('skills') };
}

// ── Validacion ───────────────────────────────────────────────────────────────

/**
 * Lista los nombres de agentes (.md) presentes en un directorio de agentes.
 * Devuelve [] si el directorio no existe.
 */
function listAgentFiles(agentsDir: string): string[] {
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

/**
 * Lista los nombres de skills (subdirectorios con SKILL.md) presentes.
 * Ignora archivos sueltos como README.md. Devuelve [] si no existe.
 */
function listSkillDirs(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(skillsDir, e.name, 'SKILL.md')))
    .map(e => e.name);
}

/**
 * Parity entre el registro y los archivos en disco. Pura.
 *
 * Verifica, para agentes y skills:
 *   - cada unidad del registro tiene su archivo real presente;
 *   - cada archivo en disco esta registrado (no hay agentes/skills sin registrar).
 *
 * @param forgeRoot raiz forge (contiene core/agents y core/skills).
 * @param units     registro cargado con loadUnits().
 */
export function checkUnitParity(forgeRoot: string, units: UnitRegistry): ParityResult {
  const errors: string[] = [];

  const agentsDir = join(forgeRoot, 'core', 'agents');
  const skillsDir = join(forgeRoot, 'core', 'skills');

  const diskAgents = new Set(listAgentFiles(agentsDir));
  const diskSkills = new Set(listSkillDirs(skillsDir));

  const regAgents = new Set(units.agents.map(u => u.name));
  const regSkills = new Set(units.skills.map(u => u.name));

  // (a) cada unidad del registro tiene archivo real.
  for (const name of regAgents) {
    if (!diskAgents.has(name)) {
      errors.push(`Agente '${name}' en units.yaml pero falta core/agents/${name}.md`);
    }
  }
  for (const name of regSkills) {
    if (!diskSkills.has(name)) {
      errors.push(`Skill '${name}' en units.yaml pero falta core/skills/${name}/SKILL.md`);
    }
  }

  // (c) cada archivo en disco esta registrado.
  for (const name of diskAgents) {
    if (!regAgents.has(name)) {
      errors.push(`Agente '${name}' en core/agents/ pero ausente de units.yaml`);
    }
  }
  for (const name of diskSkills) {
    if (!regSkills.has(name)) {
      errors.push(`Skill '${name}' en core/skills/ pero ausente de units.yaml`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Drift de tools: para cada agente del registro con archivo presente, verifica
 * que los tools de su frontmatter esten dentro del contrato declarado. Pura.
 *
 * @param forgeRoot raiz forge (contiene core/agents).
 * @param units     registro cargado con loadUnits().
 */
export function checkToolContracts(forgeRoot: string, units: UnitRegistry): ParityResult {
  const errors: string[] = [];
  const agentsDir = join(forgeRoot, 'core', 'agents');

  for (const unit of units.agents) {
    const file = join(agentsDir, `${unit.name}.md`);
    if (!existsSync(file)) continue; // parity ya reporta la falta de archivo.
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const declared = new Set(unit.tools);
    const actual = parseAgentTools(content);
    for (const tool of actual) {
      if (!declared.has(tool)) {
        errors.push(
          `Agente '${unit.name}' usa tool '${tool}' fuera del contrato declarado en units.yaml`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
