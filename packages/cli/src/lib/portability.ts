/**
 * Portability matrix (SPEC-073) — the data behind `forge port`.
 *
 * Answers the question every team asks before committing to an AI coding CLI:
 * "if I switch runtimes, how much of my config survives?" forge's answer is
 * structural: project.yaml is the single source of truth, and each runtime's
 * native config is *generated*, never hand-written. So the honest classification
 * is not "portable vs locked-in" but three buckets:
 *
 *   - portable  — the same artifact serves every runtime, untouched
 *                 (project.yaml itself, docs/specs/, MCP servers).
 *   - adapted   — regenerated automatically per runtime; the semantics are
 *                 identical, only the native format/path differs
 *                 (agents, skills, system prompts, the .forge/state context).
 *   - vendor    — has no equivalent in the target; lost or needs manual setup
 *                 (a runtime's own settings file, env/secret binding).
 *
 * This module is PURE: it derives the matrix from a ProjectYaml + a target
 * RuntimeDescriptor and renders a deterministic Markdown report. No I/O, no LLM.
 */
import type { ProjectYaml } from './yaml.js';
import type { RuntimeDescriptor } from './generators/registry.js';

export type Portability = 'portable' | 'adapted' | 'vendor';

export interface PortabilityDimension {
  /** Stable, snapshot-safe identifier. */
  id: string;
  /** Human-readable dimension name. */
  dimension: string;
  portability: Portability;
  /** Short explanation, target-aware. */
  note: string;
}

export interface PortabilityMatrix {
  /** Target runtime id (e.g. 'codex'). */
  target: string;
  /** Target runtime label (e.g. 'Codex CLI'). */
  targetLabel: string;
  /** Native paths the port writes for this runtime (from descriptor.surfaces). */
  surfaces: string[];
  dimensions: PortabilityDimension[];
  summary: { portable: number; adapted: number; vendor: number; total: number };
}

/** Does the config declare anything for this dimension? Keeps notes honest. */
function has<T>(v: T[] | undefined): boolean {
  return Array.isArray(v) && v.length > 0;
}

/**
 * Builds the portability matrix for porting `config` to `descriptor`'s runtime.
 * Pure and deterministic: same inputs → same matrix (stable dimension order).
 */
export function portabilityMatrix(config: ProjectYaml, descriptor: RuntimeDescriptor): PortabilityMatrix {
  const native = descriptor.kind === 'native';
  const isClaude = descriptor.id === 'claude-code';
  const isKiro = descriptor.id === 'kiro';
  // Runtimes that get the shared executable git-hook fallback when not native.
  const hasGitHookFallback = descriptor.id === 'opencode' || descriptor.id === 'codex';

  const agents = config.agents?.active ?? [];
  const profiles = config.agents?.profiles ?? [];
  const mcpServers = config.mcp?.servers ?? [];
  const frameworks = config.compliance?.frameworks ?? [];

  const dimensions: PortabilityDimension[] = [];

  // 1. project.yaml — the source itself. Always portable: it is never rewritten,
  //    it is the input every generator reads.
  dimensions.push({
    id: 'source-config',
    dimension: 'project.yaml (fuente única)',
    portability: 'portable',
    note: 'No se copia ni edita: es la entrada que cada generador lee. Cambiar de runtime reusa la misma fuente.',
  });

  // 2. Agents roster — semantics portable, native format adapted.
  dimensions.push({
    id: 'agents',
    dimension: 'Agentes (roster)',
    portability: 'adapted',
    note: has(agents)
      ? `${agents.length} agente(s)${profiles.length ? ` + ${profiles.length} profile(s)` : ''} → ${descriptor.label} (${native ? 'config nativa' : 'regla Markdown'}). Misma semántica, formato distinto.`
      : `Roster por defecto → ${descriptor.label}. Misma semántica, formato distinto.`,
  });

  // 3. Skills / commands — list portable, invocation differs per runtime.
  dimensions.push({
    id: 'skills',
    dimension: 'Skills / comandos',
    portability: 'adapted',
    note: isClaude
      ? 'Slash commands nativos en .claude/commands/. La invocación es nativa.'
      : `La lista se mantiene; la invocación cambia (en ${descriptor.label} via prompt/contexto, no slash).`,
  });

  // 4. MCP — open protocol, the one truly portable integration layer.
  dimensions.push({
    id: 'mcp',
    dimension: 'MCP / herramientas',
    portability: 'portable',
    note: has(mcpServers)
      ? `${mcpServers.length} servidor(es) MCP: protocolo abierto, consumible por cualquier runtime con soporte MCP.`
      : 'Protocolo abierto: cualquier servidor MCP que declares es consumible por todo runtime con soporte MCP.',
  });

  // 5. Hooks / guardrails — native for claude/kiro, git-hook fallback for
  //    opencode/codex, nothing executable for rules-based runtimes.
  dimensions.push({
    id: 'hooks',
    dimension: 'Hooks / guardrails',
    portability: (isClaude || isKiro || hasGitHookFallback) ? 'adapted' : 'vendor',
    note: isClaude
      ? 'Hooks nativos en .claude/hooks/ (branch guard, secret/debug detection). Semántica idéntica.'
      : isKiro
        ? 'Hooks nativos de Kiro (.kiro/hooks/*.json). Semántica idéntica.'
        : hasGitHookFallback
          ? 'Sin hooks nativos: caen al fallback compartido .githooks/pre-commit. Misma semántica.'
          : `${descriptor.label} no tiene mecanismo de hooks: el guardrail queda como nota en la regla, sin enforcement automático.`,
  });

  // 6. Memory / agentic context — .forge/state is runtime-agnostic at the source,
  //    but how each runtime ingests it varies; rules-based ingest it weakest.
  dimensions.push({
    id: 'context',
    dimension: 'Memoria / contexto (.forge/state)',
    portability: native ? 'adapted' : 'vendor',
    note: native
      ? 'STATE/PLAN/CONTEXT.md son agnósticos; el runtime nativo los reancla en cada sesión.'
      : `STATE/PLAN/CONTEXT.md existen, pero ${descriptor.label} no los inyecta automáticamente: requieren referencia manual.`,
  });

  // 7. Specs / SDD — plain Markdown, never materialized per runtime: fully portable.
  dimensions.push({
    id: 'specs',
    dimension: 'Specs / SDD (docs/specs)',
    portability: 'portable',
    note: 'docs/specs/ es agnóstica: insumo compartido por todos los runtimes, no se regenera.',
  });

  // 8. System prompts / instructions — generated from the same config per runtime.
  dimensions.push({
    id: 'instructions',
    dimension: 'Prompts de sistema / instrucciones',
    portability: 'adapted',
    note: `${descriptor.surfaces(config).map(s => s.path).join(', ') || 'archivo nativo'} se genera desde project.yaml: mismo conocimiento, formato nativo.`,
  });

  // 9. Compliance frameworks — only when declared. Embedded by the generator;
  //    enforcement is a claude-code agent, a warning note elsewhere.
  if (has(frameworks)) {
    dimensions.push({
      id: 'compliance',
      dimension: `Compliance (${frameworks.join(', ')})`,
      portability: 'adapted',
      note: isClaude
        ? 'Embebido en las instrucciones; el compliance-reviewer (Tier 1) lo aplica en review.'
        : `Embebido en ${descriptor.label} como instrucción; el enforcement por agente es nativo de Claude Code (acá queda como advertencia).`,
    });
  }

  // 10. Per-runtime config — the irreducible vendor surface.
  dimensions.push({
    id: 'runtime-config',
    dimension: 'Config específica del runtime',
    portability: 'vendor',
    note: isClaude
      ? '.claude/settings.json (env FORGE_*, hooks internos) es propio de Claude Code: se regenera, no se porta.'
      : `Los settings/secrets nativos de ${descriptor.label} no tienen equivalente directo: configúralos una vez en el destino.`,
  });

  const summary = {
    portable: dimensions.filter(d => d.portability === 'portable').length,
    adapted: dimensions.filter(d => d.portability === 'adapted').length,
    vendor: dimensions.filter(d => d.portability === 'vendor').length,
    total: dimensions.length,
  };

  return {
    target: descriptor.id,
    targetLabel: descriptor.label,
    surfaces: descriptor.surfaces(config).map(s => s.path),
    dimensions,
    summary,
  };
}

const BUCKET_LABEL: Record<Portability, string> = {
  portable: 'PORTABLE (sin cambios)',
  adapted: 'ADAPTADA (regenerada por el generador)',
  vendor: 'VENDOR-SPECIFIC (manual o se pierde)',
};

const BUCKET_ICON: Record<Portability, string> = {
  portable: 'OK',
  adapted: '~',
  vendor: '!',
};

/**
 * Renders the matrix as a deterministic Markdown report. `version` is injected
 * (impure) so the body stays pure and snapshot-stable across calls.
 */
export function renderPortabilityReport(matrix: PortabilityMatrix, projectName: string, version: string): string {
  const { targetLabel, summary, dimensions, surfaces } = matrix;
  const lines: string[] = [];

  lines.push(`# Portabilidad: project.yaml → ${targetLabel}`);
  lines.push('');
  lines.push(`**Proyecto:** ${projectName}  |  **Fuente:** project.yaml (única)  |  **Destino:** ${targetLabel}`);
  lines.push('');
  lines.push('## Resumen');
  lines.push('');
  lines.push(`- Portable (sin cambios): **${summary.portable}/${summary.total}**`);
  lines.push(`- Adaptada automáticamente: **${summary.adapted}/${summary.total}**`);
  lines.push(`- Vendor-specific: **${summary.vendor}/${summary.total}**`);
  lines.push('');

  for (const bucket of ['portable', 'adapted', 'vendor'] as Portability[]) {
    const rows = dimensions.filter(d => d.portability === bucket);
    if (rows.length === 0) continue;
    lines.push(`## ${BUCKET_LABEL[bucket]}`);
    lines.push('');
    lines.push('| Dimensión | Nota |');
    lines.push('|-----------|------|');
    for (const d of rows) {
      lines.push(`| ${d.dimension} | ${d.note} |`);
    }
    lines.push('');
  }

  lines.push('## Archivos generados');
  lines.push('');
  lines.push('```');
  for (const s of surfaces) lines.push(s);
  lines.push('.forge/state/{STATE,PLAN,CONTEXT}.md   (contexto agnóstico)');
  lines.push('```');
  lines.push('');
  lines.push('## Para regenerar');
  lines.push('');
  lines.push('```bash');
  lines.push(`forge port ${matrix.target} --force`);
  lines.push('```');
  lines.push('');
  lines.push(`> Generado por forge v${version}. La fuente de verdad es project.yaml: no edites los archivos nativos a mano.`);
  lines.push('');

  return lines.join('\n');
}

/** Single-letter bucket icon, for the terminal table. */
export function bucketIcon(p: Portability): string {
  return BUCKET_ICON[p];
}
