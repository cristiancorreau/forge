import type { ProjectYaml } from '../yaml.js';

function devCommands(language: string): { dev: string; test: string; lint: string } {
  switch (language) {
    case 'typescript': return { dev: 'pnpm dev', test: 'pnpm test', lint: 'pnpm lint' };
    case 'python': return { dev: 'uvicorn main:app --reload', test: 'pytest', lint: 'ruff check .' };
    case 'ruby': return { dev: 'rails server', test: 'bundle exec rspec', lint: 'rubocop' };
    case 'go': return { dev: 'go run ./cmd/...', test: 'go test ./...', lint: 'golangci-lint run' };
    case 'php': return { dev: 'php artisan serve', test: './vendor/bin/pest', lint: 'phpstan analyse' };
    default: return { dev: '# ver docs', test: '# ver docs', lint: '# ver docs' };
  }
}

export function generateKiroProduct(config: ProjectYaml): string {
  const proj = config.project;
  const stack = config.stack ?? {};
  return `# ${proj.name ?? 'Proyecto'} — Product Context

## Overview

${proj.description ?? ''}

## Stack

- Language: ${proj.language ?? 'N/A'}
- Backend: ${stack.backend ?? 'N/A'}
- Frontend: ${stack.frontend ?? 'N/A'}
- Database: ${stack.database ?? 'N/A'}
- ORM: ${stack.orm ?? 'N/A'}
- Testing: ${(stack.testing ?? []).join(', ') || 'N/A'}

## Status

${proj.status ?? 'active'}
`;
}

export function generateKiroStructure(config: ProjectYaml): string {
  const lang = config.project.language ?? 'typescript';
  const { dev, test, lint } = devCommands(lang);
  return `# Project Structure & Development Workflow

## Forge v2 SDD Workflow

Before every coding session:
1. Run \`/session-start\` — verify branch, tools, env
2. Read the spec for your task in \`docs/specs/\`
3. Use \`/plan\` if no spec exists yet
4. Use \`/work\` to implement once spec is approved
5. Use \`/review\` before submitting
6. Use \`/ship\` for production deploy
7. Run \`/session-close\` to commit, create PR, write daily note

## Commands

\`\`\`bash
${dev}   # Development
${test}  # Tests
${lint}  # Lint
\`\`\`

## Rules

- Never implement without an approved spec
- Never push directly to main/master
- Never hardcode secrets or API keys
- Tests alongside implementation, not after
`;
}

export function generateKiroAgents(config: ProjectYaml): string {
  const agents = config.agents ?? {};
  const active = agents.active ?? [];
  const compliance = agents.compliance ?? [];
  const allAgents = [...active, ...compliance];

  const agentDescriptions: Record<string, string> = {
    'orchestrator':        'Coordinates agents and decomposes complex tasks',
    'backend-engineer':    'API, database, business logic',
    'api-engineer':        'REST endpoints, middleware, validation',
    'frontend-engineer':   'UI components, pages, API integration',
    'admin-engineer':      'Admin dashboards and management UI',
    'mobile-engineer':     'Mobile screens, navigation, state',
    'fullstack-engineer':  'End-to-end full-stack features',
    'test-engineer':       'Unit, integration, E2E tests (never production code)',
    'docs-writer':         'Specs, ADRs, READMEs (never production code)',
    'compliance-reviewer': 'PII handling, consent, audit logs review',
    'security-auditor':    'Vulnerability auditing, dependency review',
    'migration-specialist':'Framework version migrations',
  };

  const rows = allAgents
    .map(a => `| ${a} | ${agentDescriptions[a] ?? 'Specialized agent'} |`)
    .join('\n');

  return `# Agent Roster

| Agent | Responsibility |
|-------|----------------|
${rows || '| — | No agents declared in project.yaml |'}

## Usage

- Use the specialized agent for each task
- Use orchestrator only for multi-agent or complex tasks
- Never ask the orchestrator to do work a specialized agent can handle
`;
}

export function generateKiroCommands(): string {
  return `# Forge v2 Commands Reference

| Command | Description |
|---------|-------------|
| \`/session-start\` | Start session: verify branch, tools, repo state |
| \`/plan\` | Create or review specs with Planner-Critic |
| \`/work\` | Implement an approved spec |
| \`/review\` | Multi-agent diff review |
| \`/ship\` | Deploy pipeline: tests → build → Vercel |
| \`/session-close\` | Close session: commit, PR, daily note |

## Kiro Note

Kiro does not support slash commands natively.
Use these as prompts or reference them in your workflow.
`;
}

export function generateKiroBranchGuardHook(): string {
  return JSON.stringify({
    name: 'forge-branch-guard',
    description: 'Warn before editing files on main or master branch',
    event: 'PreEdit',
    condition: {
      type: 'script',
      script: 'git branch --show-current | grep -qE "^(main|master)$"'
    },
    action: {
      type: 'warn',
      message: 'You are on main/master. Create a feature branch before editing:\n  git checkout -b feat/description'
    }
  }, null, 2);
}
