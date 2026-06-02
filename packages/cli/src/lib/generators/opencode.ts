import type { ProjectYaml } from '../yaml.js';

const AGENT_DESCRIPTIONS: Record<string, string> = {
  'orchestrator':         'Coordina agentes y descompone tareas complejas',
  'backend-engineer':     'API, base de datos, lógica de negocio',
  'api-engineer':         'Endpoints REST, middleware, validaciones',
  'frontend-engineer':    'UI, componentes, integración con API',
  'admin-engineer':       'Interfaces de administración y dashboards',
  'mobile-engineer':      'Pantallas móviles, navegación, estado',
  'fullstack-engineer':   'Features full-stack de extremo a extremo',
  'test-engineer':        'Tests unitarios, integración y E2E',
  'docs-writer':          'Specs, ADRs, READMEs, documentación',
  'compliance-reviewer':  'Revisión de PRs con PII y compliance regulatorio',
  'security-auditor':     'Auditoría de vulnerabilidades y dependencias',
  'migration-specialist': 'Migraciones de versión de framework',
  'wp-engineer':          'Temas WordPress, FSE, Gutenberg',
  'scanner-engineer':     'Scraping, crawling, extracción de datos',
};

function guardrailSection(): string {
  return `## Guardrails de seguridad

Las siguientes reglas aplican a TODOS los agentes sin excepción:

### Branch guard
- Verificar siempre la rama antes de hacer cambios: \`git branch --show-current\`
- **NUNCA** hacer push directo a \`main\` o \`master\`
- Si estás en main/master, crear una rama antes de cualquier edición: \`git checkout -b fix/descripcion\`

### Debug detection
- No commitear \`console.log\`, \`print()\`, \`dd()\`, \`var_dump()\`, \`debugger\`, \`binding.pry\`
- Si los encuentras en código existente, eliminarlos antes de commitear

### Production safety
- Nunca ejecutar comandos destructivos en producción sin confirmación explícita
- Comandos bloqueados en producción: \`--force-reset\`, \`DROP TABLE\`, \`TRUNCATE\`, \`rm -rf /\`, \`git push --force\`

### Secrets
- Nunca hardcodear tokens, passwords o API keys en archivos que van a git
- Usar variables de entorno o secret managers
`;
}

function commandsSection(): string {
  return `## Comandos del flujo SDD

| Comando | Descripción |
|---------|-------------|
| \`/session-start\` | Inicia sesión: verifica rama, tools, estado del repo |
| \`/plan\` | Crea o revisa specs con Planner-Critic |
| \`/work\` | Implementa una spec aprobada (modo serial en OpenCode) |
| \`/review\` | Revisión multi-agente del diff actual |
| \`/ship\` | Pipeline de deploy: tests → typecheck → Vercel |
| \`/session-close\` | Cierra sesión: commit, PR, daily note |

> **Nota OpenCode**: Los agentes se ejecutan en serie, no en paralelo.
`;
}

export function generateAgentsMd(config: ProjectYaml): string {
  const proj = config.project;
  const stack = config.stack ?? {};
  const agents = config.agents ?? {};
  const compliance = config.compliance ?? {};

  const name = proj.name ?? 'Mi Proyecto';
  const language = proj.language ?? 'typescript';
  const active = agents.active ?? [];
  const complianceAgents = agents.compliance ?? [];
  const profiles = agents.profiles ?? [];
  const allAgents = [...active, ...complianceAgents];

  const agentRows = allAgents
    .map(a => `| \`${a}\` | ${AGENT_DESCRIPTIONS[a] ?? 'Agente especializado'} |`)
    .join('\n');

  const complianceSection = compliance.frameworks && compliance.frameworks.length > 0
    ? `\n## Compliance\n\nMarcos activos: ${compliance.frameworks.map(f => f.toUpperCase()).join(', ')}\n`
    : '';

  return `# AGENTS.md — ${name}

> Generado por forge v2. Actualizar project.yaml para cambiar la configuración.

## Proyecto

- **Nombre**: ${name}
- **Lenguaje**: ${language}
- **Backend**: ${stack.backend ?? 'N/A'}
- **Frontend**: ${stack.frontend ?? 'N/A'}
- **Base de datos**: ${stack.database ?? 'N/A'}
- **Profiles activos**: ${profiles.join(', ') || '—'}

## Agentes del equipo

| Agente | Descripción |
|--------|-------------|
${agentRows || '| — | Sin agentes declarados en project.yaml |'}

> Invocar el agente especializado para cada tarea. Usar orchestrator solo para tareas multi-agente.

${commandsSection()}
${guardrailSection()}${complianceSection}`;
}
