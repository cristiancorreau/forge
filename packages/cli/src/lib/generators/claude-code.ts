import type { ProjectYaml } from '../yaml.js';

const AGENT_TRIGGER: Record<string, [string, string | null]> = {
  'orchestrator':        ['tareas multi-agente, análisis de >3 archivos, descomposición de features completas', null],
  'backend-engineer':    ['endpoints, middleware, validaciones, lógica de negocio', 'api'],
  'api-engineer':        ['endpoints REST, middleware, validaciones, migraciones de BD', 'api'],
  'frontend-engineer':   ['componentes UI, páginas, estilos, integración con API', 'frontend'],
  'admin-engineer':      ['UI de gestión interna, dashboards de admin', 'admin'],
  'mobile-engineer':     ['pantallas móviles, navegación, stores de estado', 'mobile'],
  'fullstack-engineer':  ['features full-stack end-to-end que abarcan backend y frontend', null],
  'test-engineer':       ['tests unitarios, integración, E2E — nunca código de producción', 'tests'],
  'docs-writer':         ['specs, ADRs, READMEs, documentación — nunca código de producción', 'specs'],
  'compliance-reviewer': ['revisión de PRs con PII, consentimientos, logs de auditoría', null],
  'security-auditor':    ['auditoría de vulnerabilidades, revisión de dependencias, pentest', null],
  'migration-specialist':['migraciones de versión de framework (ej: L6→L13)', 'migrations'],
  'wp-engineer':         ['temas WordPress, FSE, Gutenberg, child themes', 'frontend'],
  'divi-engineer':       ['layouts Divi 5, módulos custom, Divi Builder', 'frontend'],
  'elementor-engineer':  ['templates Elementor Pro, widgets custom', 'frontend'],
  'scanner-engineer':    ['scraping, crawling, extracción estructurada de datos', 'scanner'],
};

function buildAgentScopeTable(agents: ProjectYaml['agents'], paths: ProjectYaml['paths']): string {
  const active = agents?.active ?? [];
  const compliance = agents?.compliance ?? [];
  const specialized = agents?.specialized ?? [];
  const scopeMap = agents?.scope ?? {};
  const all = [...active, ...compliance];
  if (all.length === 0 && specialized.length === 0) return '';

  // active + compliance agents have entries in the hardcoded AGENT_TRIGGER map.
  const rows = all.map(agent => {
    const [trigger, pathKey] = AGENT_TRIGGER[agent] ?? ['implementación', null];
    const scope = pathKey && paths ? (paths as Record<string, string>)[pathKey] : undefined;
    const scopeStr = scope ? `\`${scope}\`` : '`/`';
    return `| \`${agent}\` | ${scopeStr} | ${trigger} |`;
  });

  // Tier 3 specialized agents are not in AGENT_TRIGGER: fall back to the
  // per-agent scope map (agents.scope) if present, else `/`, and point the
  // reader to the agent's own file for the trigger.
  const specializedRows = specialized.map(agent => {
    const scope = scopeMap[agent];
    const scopeStr = scope ? `\`${scope}\`` : '`/`';
    const trigger = `tareas de su dominio (ver \`.claude/agents/${agent}.md\`)`;
    return `| \`${agent}\` | ${scopeStr} | ${trigger} |`;
  });

  return (
    '## Agentes y su scope\n\n' +
    '| Agente | Scope | Cuándo usarlo |\n' +
    '|--------|-------|---------------|\n' +
    [...rows, ...specializedRows].join('\n') + '\n\n' +
    '> Invocar el agente del scope correcto, no el orchestrator, para tareas acotadas.\n\n'
  );
}

function renderPhases(config: ProjectYaml): string {
  const sprint = config.sprint ?? {};
  const current = sprint.current ?? 1;
  const phases = sprint.phases ?? [];
  if (phases.length === 0) {
    return `- **Sprint actual:** Sprint ${current}\n- **Completadas:** —\n- **En curso:** —\n- **Pendientes:** —`;
  }
  const lines = [`- **Sprint actual:** Sprint ${current}`];
  for (const phase of phases) {
    const specs = phase.specs ?? [];
    const specList = specs.length > 0 ? specs.join(', ') : '—';
    lines.push(`- **Fase ${phase.id} — ${phase.name}** (${phase.status ?? 'pendiente'}): ${specList}`);
  }
  return lines.join('\n');
}

function devCommands(language: string): { dev: string; test: string; lint: string; build: string } {
  switch (language) {
    case 'typescript': return { dev: 'pnpm dev', test: 'pnpm test', lint: 'pnpm lint', build: 'pnpm build' };
    case 'python': return { dev: 'uvicorn main:app --reload', test: 'pytest', lint: 'ruff check .', build: '# no aplica' };
    case 'ruby': return { dev: 'rails server', test: 'bundle exec rspec', lint: 'rubocop', build: '# no aplica' };
    case 'go': return { dev: 'go run ./cmd/...', test: 'go test ./...', lint: 'golangci-lint run', build: 'go build ./...' };
    case 'php': return { dev: 'php artisan serve', test: './vendor/bin/pest', lint: 'vendor/bin/phpstan analyse', build: 'composer install --no-dev' };
    default: return { dev: '# ver documentación', test: '# ver documentación', lint: '# ver documentación', build: '# ver documentación' };
  }
}

export function generateClaudeMd(config: ProjectYaml): string {
  const proj = config.project;
  const stack = config.stack ?? {};
  const agents = config.agents ?? {};
  const compliance = config.compliance ?? {};
  const paths = config.paths;

  const name = proj.name ?? 'Mi Proyecto';
  const description = proj.description ?? '';
  const language = proj.language ?? 'typescript';
  const { dev, test, lint, build } = devCommands(language);
  const specsPath = paths?.specs ?? 'docs/specs';
  const progressPath = paths?.progress ?? 'docs/progress.html';

  const agentScopeSection = buildAgentScopeTable(agents, paths);

  const complianceSection = compliance.frameworks && compliance.frameworks.length > 0
    ? `\n## Compliance activo\n\nEste proyecto opera bajo: ${compliance.frameworks.map(f => `**${f.toUpperCase()}**`).join(', ')}\n\nReglas no-negociables:\n- Sin datos personales en logs de stdout\n- Consentimiento explícito antes de cualquier tracker no esencial\n- Logs de auditoría append-only (sin UPDATE/DELETE)\n- Derechos del titular implementados (acceso, rectificación, supresión, portabilidad)\n`
    : '';

  return `# CLAUDE.md — ${name}

> Generado por forge. Actualizar project.yaml para cambiar la configuración.

## Misión del proyecto

${description}

## Stack

- **Lenguaje**: ${language}
- **Backend**: ${stack.backend ?? 'N/A'}
- **Frontend**: ${stack.frontend ?? 'N/A'}
- **Base de datos**: ${stack.database ?? 'N/A'}
- **Testing**: ${(stack.testing ?? []).join(', ')}

${agentScopeSection}## Estructura

\`\`\`
${proj.slug ?? 'proyecto'}/
├── CLAUDE.md                    ← Estás acá
├── AGENTS.md                    ← Convenciones del agent team
├── project.yaml                 ← Config de forge (fuente de verdad)
├── .claude/
│   ├── agents/                  ← Agentes instalados
│   ├── hooks/                   ← Hooks de guardrail (JS, sin Python)
│   ├── commands/                ← Slash commands del flujo SDD
│   └── architecture.rules       ← Convenciones de arquitectura del proyecto
├── ${specsPath}/                ← Specs de features (requeridas antes de implementar)
└── ${progressPath}              ← Dashboard de progreso
\`\`\`

## Cómo trabajar (SDD)

1. **Identificá la spec.** Si no está en \`${specsPath}/\`, pará y pedí que se cree.
2. **Leé la spec correspondiente.**
3. **Proponé opciones** para decisiones no cubiertas por la spec.
4. **Esperá aprobación** antes de generar código.
5. **Tests** junto con la implementación, no al final.
6. **Antes de cerrar**: \`${test}\`, \`${lint}\`.
${complianceSection}
## Phases activas y estado

${renderPhases(config)}

## Comandos frecuentes

\`\`\`bash
${dev}     # Desarrollo
${test}    # Tests
${lint}    # Lint
${build}   # Build
\`\`\`

## Qué NO hacer

- No implementar sin spec en \`${specsPath}/\`
- No hardcodear tokens, passwords o secrets
- No commits con \`console.log\` o \`print\` de depuración
- No hacer force push a main/master
`;
}
