/**
 * Generic rules document generator for runtimes that accept a single Markdown
 * file with project context, agent roster, workflow and guardrails.
 *
 * Used by kind:'rules' descriptors in registry.ts. The output is intentionally
 * similar to generateAgentsMd (opencode) but kept leaner — rules runtimes do
 * not ship a git hook fallback.
 */
import type { ProjectYaml } from '../yaml.js';
import { stackWithLanguage } from '../wizard-flow.js';

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

/**
 * Generates a generic Markdown rules document suitable for rules-based runtimes
 * (Cursor, Windsurf, Copilot, Gemini, Zed, Cline, Aider, Continue, Roo, Amp, Augment).
 */
export function generateRulesDoc(config: ProjectYaml): string {
  const proj = config.project;
  const stack = config.stack ?? {};
  const agents = config.agents ?? {};
  const compliance = config.compliance ?? {};

  const name = proj.name ?? 'Mi Proyecto';
  const language = proj.language ?? 'typescript';
  const active = agents.active ?? [];
  const complianceAgents = agents.compliance ?? [];
  const allAgents = [...active, ...complianceAgents];

  const agentRows = allAgents
    .map(a => `| \`${a}\` | ${AGENT_DESCRIPTIONS[a] ?? 'Agente especializado'} |`)
    .join('\n');

  const complianceSection = compliance.frameworks && compliance.frameworks.length > 0
    ? `\n## Compliance\n\nMarcos activos: ${compliance.frameworks.map(f => f.toUpperCase()).join(', ')}\n`
    : '';

  return `# ${name} — forge rules

> Generado por forge. Actualizar project.yaml para cambiar la configuración.

## Proyecto

- **Nombre**: ${name}
- **Lenguaje**: ${language}
- **Backend**: ${stackWithLanguage(stack.backend, stack.backend_language)}
- **Frontend**: ${stackWithLanguage(stack.frontend, stack.frontend_language)}${stack.mobile ? `\n- **Mobile**: ${stackWithLanguage(stack.mobile, stack.mobile_language)}` : ''}
- **Base de datos**: ${stack.database ?? 'N/A'}

## Agentes del equipo

| Agente | Descripción |
|--------|-------------|
${agentRows || '| — | Sin agentes declarados en project.yaml |'}

> Usar el agente especializado para cada tarea. Orchestrator solo para tareas multi-agente.

## Workflow SDD (obligatorio)

1. **SIEMPRE** leer la spec antes de escribir código (en \`docs/specs/\`)
2. Si no hay spec para la tarea: DETENER y pedir que se cree
3. Implementar SOLO lo que la spec aprueba
4. Tests junto con la implementación, nunca al final
5. Antes de terminar: correr typecheck + lint

## Guardrails

### Branch guard
- Verificar rama antes de cambios: \`git branch --show-current\`
- **NUNCA** hacer push directo a \`main\` o \`master\`
- Si estás en main/master, crear rama: \`git checkout -b feat/descripcion\`

### Debug detection
- No commitear \`console.log\`, \`print()\`, \`dd()\`, \`var_dump()\`, \`debugger\`

### Producción
- Nunca ejecutar comandos destructivos sin confirmación: \`DROP TABLE\`, \`TRUNCATE\`, \`rm -rf /\`, \`git push --force\`

### Secrets
- Nunca hardcodear tokens, passwords o API keys en archivos que van a git
${complianceSection}`;
}
