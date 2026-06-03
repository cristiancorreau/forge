/**
 * Static catalog of forge skills and runtimes, used by `forge skills`,
 * `forge doctor`, the post-install dashboard and audit.
 * The agent/profile catalog is derived from the assets tree at runtime.
 */
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export interface SkillInfo { id: string; command: string; category: string; purpose: string; trigger: string; }
export interface RuntimeInfo { id: string; label: string; cmd: string[]; install: string; marker: string; }

export const SKILLS: SkillInfo[] = [
  { id: 'spec',           command: '/spec',           category: 'Desarrollo', purpose: 'Redacta specs siguiendo la plantilla forge',          trigger: 'antes de escribir una spec' },
  { id: 'new-feature',    command: '/new-feature',    category: 'Desarrollo', purpose: 'Checklist de feature de plan a deploy',               trigger: '"nueva feature", "implementar"' },
  { id: 'security-audit', command: '/security-audit', category: 'Desarrollo', purpose: 'Checklist de seguridad para endpoints y auth',        trigger: '"auditar seguridad", "revisar auth"' },
  { id: 'local2prod',     command: '/local2prod',     category: 'Desarrollo', purpose: 'Deploy a prod; no termina hasta READY/SUCCESS',       trigger: '"publicar", "deploy"' },
  { id: 'db-migrate',     command: '/db-migrate',     category: 'Datos',      purpose: 'Migración segura (Prisma/Drizzle/AR/Alembic/Goose)',  trigger: '"migrar schema", "nueva migración"' },
  { id: 'browser-test',   command: '/browser-test',   category: 'Testing',    purpose: 'Verifica UI en navegador y captura evidencia',        trigger: '"screenshot de", "open <url>"' },
  { id: 'phase-kickoff',  command: '/phase-kickoff',  category: 'Sprint',     purpose: 'Protocolo para iniciar una fase/sprint nuevo',        trigger: 'al iniciar una fase o sprint' },
  { id: 'wiki-ingest',    command: '/wiki-ingest',    category: 'Wiki',       purpose: 'Ingesta una fuente al wiki del proyecto',             trigger: '"agregar al wiki", "aprender de"' },
  { id: 'wiki-query',     command: '/wiki-query',     category: 'Wiki',       purpose: 'Responde citando el wiki del proyecto',               trigger: '"¿qué dice el wiki sobre…"' },
  { id: 'wiki-lint',      command: '/wiki-lint',      category: 'Wiki',       purpose: 'Verifica integridad del wiki (links, huérfanos)',     trigger: '"verificar wiki"' },
  { id: 'aitmpl-search',  command: '/aitmpl-search',  category: 'Catálogo',   purpose: 'Busca en el catálogo de frameworks/MCP/profiles',     trigger: '"buscar templates", "buscar MCP"' },
  { id: 'obsidian-sync',  command: '/obsidian-sync',  category: 'Integración',purpose: 'Sincroniza un vault de Obsidian con el código',       trigger: '"actualizar obsidian", "sync vault"' },
];

export const RUNTIMES: RuntimeInfo[] = [
  { id: 'claude-code', label: 'Claude Code', cmd: ['claude', '--version'],   install: 'npm i -g @anthropic-ai/claude-code', marker: 'CLAUDE.md + .claude/' },
  { id: 'opencode',    label: 'OpenCode',    cmd: ['opencode', '--version'], install: 'npm i -g opencode-ai',               marker: 'AGENTS.md + .opencode/' },
  { id: 'codex',       label: 'Codex CLI',   cmd: ['codex', '--version'],    install: 'npm i -g @openai/codex',             marker: 'AGENTS.md + .codex/' },
  { id: 'kiro',        label: 'Kiro IDE',    cmd: ['kiro', '--version'],     install: 'descargar desde kiro.dev',           marker: '.kiro/steering/' },
];

/** List agent ids available in the forge assets tree (core + profiles). */
export function listCatalogAgents(forgeRoot: string): { core: string[]; profiles: Record<string, string[]> } {
  const core: string[] = [];
  const coreDir = join(forgeRoot, 'core', 'agents');
  if (existsSync(coreDir)) {
    for (const f of readdirSync(coreDir)) if (f.endsWith('.md')) core.push(f.replace('.md', ''));
  }
  const profiles: Record<string, string[]> = {};
  const profDir = join(forgeRoot, 'profiles');
  if (existsSync(profDir)) {
    for (const p of readdirSync(profDir)) {
      const agentsDir = join(profDir, p, 'agents');
      if (existsSync(agentsDir)) {
        profiles[p] = readdirSync(agentsDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
      }
    }
  }
  return { core, profiles };
}
