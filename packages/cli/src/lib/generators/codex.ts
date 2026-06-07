import type { ProjectYaml } from '../yaml.js';

/**
 * `.codex/codex.yaml` — wires the Codex CLI session hooks. Codex has no
 * PreToolUse/Stop interception (those guardrails live inline in AGENTS.md), but
 * it does support onStart/onFinish session hooks, which forge points at the same
 * pure-JS checks used by Claude Code (zero Python dependency).
 */
export function generateCodexYaml(): string {
  return `# .codex/codex.yaml — generado por forge v2 para Codex CLI
# Ajustá 'model' según tu preferencia (ver la doc de Codex CLI).
# model: gpt-5-codex

hooks:
  onStart:  node .codex/session-start.js
  onFinish: node .codex/post-turn-check.js
`;
}

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

  const specialized = agents.specialized ?? [];
  const specializedSection = specialized.length > 0
    ? `\n## Agentes de dominio (Tier 3)\n\n${specialized.map(a => `- \`${a}\``).join('\n')}\n\n> Conocen el negocio concreto del proyecto. Definí el rol y scope de cada uno antes de delegarles trabajo.\n`
    : '';

  return `# AGENTS.md — ${name}
# Generado por forge v2 para Codex CLI

## Proyecto

- **Nombre**: ${name}
- **Lenguaje**: ${language}
- **Backend**: ${stack.backend ?? 'N/A'}
- **Frontend**: ${stack.frontend ?? 'N/A'}

## Agentes disponibles

${agentList}
${specializedSection}

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

> Codex no tiene hooks de bloqueo automático como Claude Code: el cumplimiento
> de estas reglas es responsabilidad del agente. Ante cualquier comando
> destructivo en producción, pará y pedí confirmación explícita al humano.

## Branch guard

- Verificar rama: \`git branch --show-current\`
- NUNCA editar directamente en main/master
- Excepciones: CLAUDE.md, AGENTS.md, project.yaml, archivos .yaml/.json de configuración

## Autonomy limits

- No hacer deploy a producción sin smoke tests
- No modificar migraciones de BD existentes
- No borrar archivos sin verificar que no hay referencias

## Flujo SDD por tipo de tarea

Codex es autónomo: seguí este flujo en cada tarea (no hay slash commands).

1. **Plan** — leé/creá la spec en \`docs/specs/\` antes de tocar código. Sin spec aprobada, no implementes.
2. **Work** — implementá solo lo que la spec aprueba. Tests junto con el código.
3. **Review** — antes de cerrar, revisá el diff: ¿cumple la spec?, ¿hay secrets/debug?, ¿pasa typecheck/lint?
4. **Ship** — solo después de que tests + typecheck pasen y los smoke tests de \`deploy\` estén en verde.
`;
}
