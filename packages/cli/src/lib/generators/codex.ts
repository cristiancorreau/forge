import type { ProjectYaml } from '../yaml.js';

export function generateCodexAgentsMd(config: ProjectYaml): string {
  const proj = config.project;
  const stack = config.stack ?? {};
  const agents = config.agents ?? {};

  const name = proj.name ?? 'Mi Proyecto';
  const language = proj.language ?? 'typescript';
  const active = agents.active ?? [];
  const compliance = agents.compliance ?? [];
  const allAgents = [...active, ...compliance];

  const agentList = allAgents.map(a => `- \`${a}\``).join('\n') || '- (ninguno declarado)';

  return `# AGENTS.md — ${name}
# Generado por forge v2 para Codex CLI

## Proyecto

- **Nombre**: ${name}
- **Lenguaje**: ${language}
- **Backend**: ${stack.backend ?? 'N/A'}
- **Frontend**: ${stack.frontend ?? 'N/A'}

## Agentes disponibles

${agentList}

## Workflow SDD (obligatorio)

1. **SIEMPRE** leer la spec antes de escribir código
2. Si no hay spec para la tarea: DETENER y pedir que se cree en docs/specs/
3. Implementar SOLO lo que la spec aprueba
4. Tests junto con la implementación, nunca al final
5. Antes de terminar: correr typecheck + lint

## Reglas de producción (BLOQUEADAS)

Los siguientes comandos están PROHIBIDOS sin confirmación explícita del humano:

\`\`\`
--force-reset    # Borra datos irreversiblemente
DROP TABLE       # Borra tabla completa
TRUNCATE         # Vacía tabla
rm -rf /         # Borra sistema
git push --force # Sobreescribe historial remoto
\`\`\`

> Incidente 2026-04-28: --force-reset borró 225 usuarios en producción.
> Estos comandos están bloqueados por el hook pre-bash-check.

## Branch guard

- Verificar rama: \`git branch --show-current\`
- NUNCA editar directamente en main/master
- Excepciones: CLAUDE.md, AGENTS.md, project.yaml, archivos .yaml/.json de configuración

## Autonomy limits

- No hacer deploy a producción sin smoke tests
- No modificar migraciones de BD existentes
- No borrar archivos sin verificar que no hay referencias

## Comandos por tipo de tarea

Ver plantillas en \`adapters/codex/commands/\`:
- \`plan.md\` — crear/revisar spec
- \`work.md\` — implementar feature
- \`review.md\` — revisar diff
- \`ship.md\` — deploy a producción
`;
}
