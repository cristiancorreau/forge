/**
 * SPEC-062 — `.forge/state/` context re-anchoring artifact generator.
 *
 * forge is a compiler, not an orchestrator: it does not observe live execution.
 * But it can give the model a deterministic re-anchoring point — a regenerable
 * Markdown artifact derived from the source of truth forge already owns
 * (project.yaml + the specs under docs/specs/).
 *
 * `generateState(config, specs)` is a PURE function: same input → same output.
 * It performs no I/O. Reading project.yaml and scanning docs/specs/ is the
 * caller's responsibility (generate.ts / init.ts / adopt.ts), which keeps this
 * module trivially testable and deterministic.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ProjectYaml } from '../yaml.js';
import { stackWithLanguage } from '../wizard-flow.js';

/**
 * A spec summary extracted from docs/specs/. The caller reads the files and
 * passes the parsed title + status here so the generator stays pure.
 */
export interface SpecSummary {
  /** Spec id / filename stem, e.g. "SPEC-062-forge-state-artifact". */
  id: string;
  /** Human-readable title from the spec's first H1 (without the leading "# "). */
  title: string;
  /** Declared lifecycle status: APPROVED | DRAFT | IMPLEMENTED | ... */
  status: string;
}

/** The three Markdown files the state artifact comprises. */
export interface StateArtifact {
  'STATE.md': string;
  'PLAN.md': string;
  'CONTEXT.md': string;
}

/** Relative paths (from the project root) of every state artifact file. */
export const STATE_FILES = [
  '.forge/state/STATE.md',
  '.forge/state/PLAN.md',
  '.forge/state/CONTEXT.md',
] as const;

/**
 * Header prepended to every artifact file. Declares the file as forge-generated
 * and derived (regenerable), so it must not be edited by hand.
 */
function header(file: string): string {
  return `<!--
  ${file} — generado por forge (SPEC-062).
  ARCHIVO DERIVADO Y REGENERABLE: no editar a mano.
  Fuente de verdad: project.yaml + docs/specs/. Ejecuta "forge generate" para regenerarlo.
-->`;
}

/** Dev commands per language, mirroring the claude-code generator conventions. */
function devCommands(language: string): { dev: string; test: string; lint: string; build: string } {
  switch (language) {
    case 'typescript': return { dev: 'pnpm dev', test: 'pnpm test', lint: 'pnpm lint', build: 'pnpm build' };
    case 'python': return { dev: 'uvicorn main:app --reload', test: 'pytest', lint: 'ruff check .', build: '# no aplica' };
    case 'ruby': return { dev: 'rails server', test: 'bundle exec rspec', lint: 'rubocop', build: '# no aplica' };
    case 'go': return { dev: 'go run ./cmd/...', test: 'go test ./...', lint: 'golangci-lint run', build: 'go build ./...' };
    case 'php': return { dev: 'php artisan serve', test: './vendor/bin/pest', lint: 'vendor/bin/phpstan analyse', build: 'composer install --no-dev' };
    case 'rust': return { dev: 'cargo run', test: 'cargo test', lint: 'cargo clippy', build: 'cargo build --release' };
    case 'java': return { dev: './mvnw spring-boot:run', test: './mvnw test', lint: './mvnw checkstyle:check', build: './mvnw package' };
    case 'kotlin': return { dev: './gradlew bootRun', test: './gradlew test', lint: './gradlew ktlintCheck', build: './gradlew build' };
    case 'dart': return { dev: 'flutter run', test: 'flutter test', lint: 'flutter analyze', build: 'flutter build apk' };
    default: return { dev: '# ver documentación', test: '# ver documentación', lint: '# ver documentación', build: '# ver documentación' };
  }
}

/** Renders the active sprint + phases block for STATE.md. */
function renderSprint(config: ProjectYaml): string {
  const sprint = config.sprint ?? {};
  const current = sprint.current ?? 1;
  const phases = sprint.phases ?? [];
  if (phases.length === 0) {
    return `- **Sprint actual:** Sprint ${current}\n- **Fases:** sin fases declaradas en project.yaml`;
  }
  const lines = [`- **Sprint actual:** Sprint ${current}`];
  for (const phase of phases) {
    const specs = (phase.specs ?? []);
    const specList = specs.length > 0 ? specs.join(', ') : '—';
    lines.push(`- **Fase ${phase.id} — ${phase.name}** (${phase.status ?? 'pendiente'}): ${specList}`);
  }
  return lines.join('\n');
}

/** Generates STATE.md — sprint/fase activa, mode, runtime, agentes activos. */
function generateStateMd(config: ProjectYaml): string {
  const proj = config.project;
  const name = proj.name ?? 'Mi Proyecto';
  const mode = proj.mode ?? 'standard';
  const runtimes = config.runtimes?.active ?? [];
  const runtimeStr = runtimes.length > 0 ? runtimes.join(', ') : 'sin declarar';

  const agents = config.agents ?? {};
  const active = agents.active ?? [];
  const compliance = agents.compliance ?? [];
  const specialized = agents.specialized ?? [];
  const allAgents = [...active, ...compliance, ...specialized];
  const agentList = allAgents.length > 0
    ? allAgents.map(a => `- \`${a}\``).join('\n')
    : '- Sin agentes declarados en project.yaml';

  return `${header('STATE.md')}

# Estado — ${name}

> Re-anclaje de contexto. Lee esto al iniciar o retomar una sesión.

## Configuración activa

- **Proyecto:** ${name}
- **Mode:** ${mode}
- **Runtime(s):** ${runtimeStr}

## Sprint y fases

${renderSprint(config)}

## Agentes activos

${agentList}
`;
}

/**
 * Groups specs by status for PLAN.md. Status order is deterministic; specs
 * within a group keep the order passed by the caller (already sorted by id).
 */
function generatePlanMd(config: ProjectYaml, specs: SpecSummary[]): string {
  const name = config.project.name ?? 'Mi Proyecto';

  // Deterministic group order: known statuses first, then any others alphabetically.
  const KNOWN_ORDER = ['APPROVED', 'DRAFT', 'IMPLEMENTED'];
  const byStatus = new Map<string, SpecSummary[]>();
  for (const spec of specs) {
    const key = (spec.status || 'SIN ESTADO').toUpperCase();
    const bucket = byStatus.get(key) ?? [];
    bucket.push(spec);
    byStatus.set(key, bucket);
  }
  const otherKeys = [...byStatus.keys()]
    .filter(k => !KNOWN_ORDER.includes(k))
    .sort();
  const orderedKeys = [...KNOWN_ORDER.filter(k => byStatus.has(k)), ...otherKeys];

  let sections: string;
  if (specs.length === 0) {
    sections = 'Sin specs en `docs/specs/`. Crea una spec antes de implementar (flujo SDD).';
  } else {
    sections = orderedKeys.map(key => {
      const rows = (byStatus.get(key) ?? [])
        .map(s => `- **${s.id}** — ${s.title}`)
        .join('\n');
      return `### ${key}\n\n${rows}`;
    }).join('\n\n');
  }

  return `${header('PLAN.md')}

# Plan — ${name}

> Specs por estado, derivadas de \`docs/specs/\`. Flujo SDD: no implementar sin spec aprobada.

${sections}
`;
}

/** Generates CONTEXT.md — stack, misión, comandos frecuentes (resumen). */
function generateContextMd(config: ProjectYaml): string {
  const proj = config.project;
  const stack = config.stack ?? {};
  const name = proj.name ?? 'Mi Proyecto';
  const description = (proj.description ?? '').trim() || 'Sin misión declarada en project.yaml.';
  const language = proj.language ?? 'typescript';

  const backendStr = stackWithLanguage(stack.backend, stack.backend_language);
  const frontendStr = stackWithLanguage(stack.frontend, stack.frontend_language);
  const mobileLine = stack.mobile ? `\n- **Mobile:** ${stackWithLanguage(stack.mobile, stack.mobile_language)}` : '';
  const { dev, test, lint, build } = devCommands(language);

  return `${header('CONTEXT.md')}

# Contexto — ${name}

> Resumen para re-anclaje: misión, stack y comandos. Derivado de project.yaml.

## Misión

${description}

## Stack

- **Lenguaje:** ${language}
- **Backend:** ${backendStr}
- **Frontend:** ${frontendStr}${mobileLine}
- **Base de datos:** ${stack.database ?? 'N/A'}

## Comandos frecuentes

\`\`\`bash
${dev}     # Desarrollo
${test}    # Tests
${lint}    # Lint
${build}   # Build
\`\`\`
`;
}

/**
 * Reads spec summaries (title + status) from a docs/specs/ directory.
 *
 * IMPURE: touches the filesystem. Kept separate from generateState so the
 * generator stays pure. Skips `_template.md` and `README.md` (scaffold files,
 * not real specs). Returns [] when the directory is absent.
 */
export function readSpecSummaries(specsDir: string): SpecSummary[] {
  if (!existsSync(specsDir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(specsDir);
  } catch {
    return [];
  }
  const summaries: SpecSummary[] = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    const lower = file.toLowerCase();
    if (lower === '_template.md' || lower === 'readme.md') continue;
    let content = '';
    try {
      content = readFileSync(join(specsDir, file), 'utf-8');
    } catch {
      continue;
    }
    const id = file.replace(/\.md$/, '');
    const titleMatch = content.match(/^#\s+(.+?)\s*$/m);
    const title = titleMatch ? titleMatch[1].trim() : id;
    // Status appears as a blockquote line: "> Estado: APPROVED" (es) or
    // "> Status: APPROVED" (en). Fall back to "SIN ESTADO" when absent.
    const statusMatch = content.match(/^>\s*(?:Estado|Status):\s*(\S+)/im);
    const status = statusMatch ? statusMatch[1].trim().toUpperCase() : 'SIN ESTADO';
    summaries.push({ id, title, status });
  }
  return summaries;
}

/**
 * Pure, deterministic generator for the `.forge/state/` artifact.
 *
 * @param config Parsed project.yaml.
 * @param specs  Spec summaries extracted from docs/specs/ (title + status).
 * @returns The three artifact files keyed by filename.
 */
export function generateState(config: ProjectYaml, specs: SpecSummary[] = []): StateArtifact {
  // Sort specs by id so the artifact is order-independent w.r.t. the caller's
  // directory-read order (determinism guarantee).
  const sorted = [...specs].sort((a, b) => a.id.localeCompare(b.id));
  return {
    'STATE.md': generateStateMd(config),
    'PLAN.md': generatePlanMd(config, sorted),
    'CONTEXT.md': generateContextMd(config),
  };
}
