import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import yaml from 'js-yaml';

export interface ProjectStack {
  backend?: string;
  /** Lenguaje del backend (nuevo). Permite que back y front difieran. */
  backend_language?: string;
  frontend?: string;
  /** Lenguaje del frontend (nuevo). Permite que back y front difieran. */
  frontend_language?: string;
  /** Framework mobile (SPEC-039): flutter | react-native | expo. */
  mobile?: string;
  /** Lenguaje del mobile (SPEC-039): dart | typescript. */
  mobile_language?: string;
  database?: string;
  orm?: string;
  package_manager?: string;
  monorepo?: string;
  testing?: string[];
}

export interface ProjectAgents {
  active?: string[];
  compliance?: string[];
  profiles?: string[];
  specialized?: string[];
  by_role?: Record<string, string | null>;
  /** Per-agent scope: maps an agent id to a directory it is restricted to. */
  scope?: Record<string, string>;
}

export interface ProjectDeploy {
  provider?: string;
  production_url?: string;
  smoke_tests?: Array<{ url: string; expect_status?: number; expect_json?: Record<string, unknown> }>;
}

export interface ProjectRules {
  forbidden_in_production?: string[];
  forbidden_patterns?: string[];
  required_review_before_ship?: boolean;
  require_spec_before_implementation?: boolean;
  conventional_commits?: boolean;
}

export interface ProjectCompliance {
  frameworks?: string[];
  pii_handling?: boolean;
  audit_logs?: boolean;
}

export interface ProjectGithub {
  project?: { number?: number; owner?: string; repo?: string };
}

export interface ProjectSprint {
  current?: number;
  phases?: Array<{ id: number; name: string; specs?: string[]; status?: string }>;
}

export interface ProjectPaths {
  api?: string;
  frontend?: string;
  admin?: string;
  mobile?: string;
  specs?: string;
  progress?: string;
  tests?: string;
  scanner?: string;
  migrations?: string;
}

export interface ProjectYaml {
  project: {
    name: string;
    slug?: string;
    description?: string;
    language?: string;
    /** Tipo de proyecto (nuevo): solo frontend, solo backend, fullstack o mobile. */
    type?: 'frontend' | 'backend' | 'fullstack' | 'mobile';
    mode: 'startup' | 'standard' | 'enterprise';
    status?: string;
  };
  stack?: ProjectStack;
  agents?: ProjectAgents;
  deploy?: ProjectDeploy;
  rules?: ProjectRules;
  compliance?: ProjectCompliance;
  github?: ProjectGithub;
  sprint?: ProjectSprint;
  paths?: ProjectPaths;
  runtimes?: { active?: string[] };
  mcp?: { servers?: Array<{ name: string; auto_approve?: string[] }> };
  scripts?: Record<string, string>;
  /** Active skills (slash-command ids without the leading slash). */
  skills?: string[];
  /** External integrations. obsidian-sync (a skill, not a CLI command) reads this. */
  integrations?: {
    obsidian?: {
      /** Vault path relative to the repo root. */
      vault_path?: string;
      /** Code-area → vault-note mapping. */
      map?: Record<string, string>;
    };
  };
}

export function findProjectYaml(start: string = process.cwd()): string | null {
  let current = start;
  while (true) {
    const candidate = join(current, 'project.yaml');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function loadProjectYaml(path: string): ProjectYaml {
  const content = readFileSync(path, 'utf-8');
  const data = yaml.load(content) as ProjectYaml;
  if (!data || typeof data !== 'object') throw new Error('project.yaml está vacío o no es un objeto YAML válido');
  return data;
}

export function projectRoot(yamlPath: string): string {
  return dirname(yamlPath);
}
