import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import yaml from 'js-yaml';

export interface ProjectStack {
  backend?: string;
  frontend?: string;
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
