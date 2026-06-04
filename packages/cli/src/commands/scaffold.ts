import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { resolveForgeRoot } from '../lib/paths.js';
import { bold, dim, green, red, yellow, cyan, gray, icons } from '../ui/colors.js';
import { box } from '../ui/box.js';

const HELP = `Usage: forge scaffold [options]

Scaffold a new agent. Two modes:

Tier 2 (default) — a profile for a stack not covered by forge. Creates
profiles/<stack>/agents/<engineer>.md (with frontmatter and standard
sections) plus a basic profiles/<stack>/README.md.

Tier 3 (--tier 3) — a domain agent that lives in the project. Creates
.claude/agents/<agente>.md with frontmatter (tier: 3) and the required
sections, ready to register in agents.specialized of project.yaml.

Options:
  --tier <2|3>           Agent tier to scaffold (default: 2)
  --name <slug>          Tier 2: profile slug · Tier 3: agent name [required]
  --engineer <agent>     Engineer agent name (e.g. api-engineer) [Tier 2]
  --description <text>   Short description for the agent
  --stack-details <text> Stack details (technologies, versions)  [Tier 2]
  --scope-dir <dir>      Directory the Tier 3 agent is restricted to [Tier 3]
  --force                Overwrite the agent file if it already exists
  -h, --help             Show this help

Examples:
  forge scaffold --name django --engineer api-engineer
  forge scaffold --name django --engineer api-engineer \\
    --description "Backend Django con DRF" \\
    --stack-details "Django 4.2 + PostgreSQL + Django REST Framework"
  forge scaffold --tier 3 --name dsar-specialist \\
    --description "Maneja DSAR bajo Ley 21.719." --scope-dir src/dsar
`;

interface ScaffoldArgs {
  tier: string;
  name: string;
  engineer: string;
  description: string;
  stackDetails: string;
  scopeDir: string;
  force: boolean;
}

function parseArgs(args: string[]): ScaffoldArgs {
  const result: ScaffoldArgs = {
    tier: '2',
    name: '',
    engineer: '',
    description: '',
    stackDetails: '',
    scopeDir: '',
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--tier':
        result.tier = args[++i] ?? '';
        break;
      case '--name':
        result.name = args[++i] ?? '';
        break;
      case '--engineer':
        result.engineer = args[++i] ?? '';
        break;
      case '--description':
        result.description = args[++i] ?? '';
        break;
      case '--stack-details':
        result.stackDetails = args[++i] ?? '';
        break;
      case '--scope-dir':
        result.scopeDir = args[++i] ?? '';
        break;
      case '--force':
        result.force = true;
        break;
      default:
        break;
    }
  }

  return result;
}

function titleCase(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function agentMarkdown(args: ScaffoldArgs): string {
  const slugTitle = titleCase(args.name);
  const engTitle = titleCase(args.engineer);

  const descLine = args.description
    ? args.description
    : `Implementa el backend del proyecto usando ${slugTitle}. NO trabaja fuera del directorio definido en project.yaml.`;

  const stackBlock = args.stackDetails
    ? args.stackDetails
    : `- **Framework:** ${slugTitle}\n- **Lenguaje:** (especificar)\n- **ORM/DB:** (especificar)\n- **Tests:** (especificar)`;

  return `---
name: ${args.engineer}
description: ${descLine}
model: sonnet
tools: Read, Grep, Glob, Bash, Edit, Write
tier: 2
profile: ${args.name}
---

# ${engTitle} — ${slugTitle}

Implementás el backend del proyecto con ${slugTitle}. Tu scope es el directorio
definido en el \`CLAUDE.md\` del proyecto. Leé ese archivo antes de empezar.

## Stack

${stackBlock}

## Tu trabajo

- Implementar endpoints, modelos y migraciones según las specs en \`docs/specs/\`.
- Escribir tests unitarios y de integración para toda la lógica nueva.
- Correr el linter, typecheck y tests antes de reportar al orchestrator.
- Proponer un plan antes de codificar cuando la tarea afecte >3 archivos.

## Reglas

- **Logs de auditoría son append-only.** NUNCA \`UPDATE\` ni \`DELETE\` sobre tablas de eventos.
- **PII nunca en logs.** Solo IDs o indicadores no reversibles.
- **Parámetros preparados siempre:** nunca interpolar input del usuario en SQL.
- **Auth + authz en cada endpoint:** verificar sesión Y permisos por recurso.
- **Migraciones reversibles:** toda migración tiene su operación inversa documentada.
- Sin spec en \`docs/specs/\` → no empieces. Pedí que se cree primero.

## No hagas

- No salgas del directorio de API/backend del proyecto.
- No implementes lógica de UI ni de frontend.
- No modifiques specs ni documentación de arquitectura sin aprobación.
- No mergees ni crees PRs directamente.
- No uses queries SQL raw con interpolación de strings.

## Forge v2

- Workflow: leé el \`CLAUDE.md\` del proyecto y la spec activa antes de tocar código.
- Revisá el data model si la tarea toca schema; informá al compliance-reviewer si toca compliance.
- Implementá con tests (TDD para lógica core, integración para endpoints).
- Reportá al orchestrator: qué se hizo, qué archivos se tocaron, qué falta.
- Este es un profile Tier 2 — activalo en \`project.yaml\` (\`agents.profiles\`) y corré \`forge init\`.
`;
}

function readmeMarkdown(args: ScaffoldArgs): string {
  const slugTitle = titleCase(args.name);

  return `# Profile: ${slugTitle}

Profile Tier 2 para el stack \`${args.name}\`.

## Agentes

- \`${args.engineer}\` — ${args.description || `Engineer del stack ${slugTitle}.`}

## Activación

Agregar el profile en el \`project.yaml\` del proyecto:

\`\`\`yaml
agents:
  profiles:
    - ${args.name}
\`\`\`

Luego instalar los agentes con \`forge init\`.
`;
}

function tier3Markdown(args: ScaffoldArgs): string {
  const title = titleCase(args.name);
  const scope = args.scopeDir ? args.scopeDir : '(definí el directorio de scope)';
  const descLine = args.description
    ? args.description
    : `Reemplazá esto con la descripción de tu agente: qué hace + scope exacto (${scope}). Es lo que lee el orchestrator.`;

  return `---
name: ${args.name}
description: ${descLine}
model: sonnet
tools: Read, Grep, Glob, Bash, Edit, Write
tier: 3
---

# ${title} — dominio: (describí el concepto de negocio)

[1 párrafo] Reemplazá esto: quién sos y cuál es tu scope EXACTO (${scope}).
Dónde terminás, empieza otro agente.

## Tu trabajo

- (Reemplazá) Lo que SÍ hacés, listado.
- Implementá con tests para toda la lógica nueva.
- Corré linter, typecheck y tests antes de reportar al orchestrator.

## Reglas

- (Reemplazá) Restricciones en orden de importancia; las críticas de compliance primero.
- Sin spec aprobada → no empieces. Pedí que se cree primero.
- Sin secrets, tokens ni paths absolutos hardcodeados.

## Workflow

1. Leé la spec aprobada antes de tocar código.
2. Implementá en tu scope con tests que cubran cada acceptance criterion.
3. Verificá (build + tests) antes de reportar.
4. Reportá al orchestrator: qué se hizo, qué archivos se tocaron, qué falta.

## No hagas

- (Reemplazá) Lo que está fuera de tu scope, listado.
- No salgas del directorio de scope del agente: ${scope}.
- No implementes sin spec aprobada.

<!-- Agente Tier 3 (de dominio). Registralo en project.yaml → agents.specialized
     y corré 'forge validate' para verificar la consistencia. -->
`;
}

async function scaffoldTier3(parsed: ScaffoldArgs): Promise<number> {
  parsed.name = parsed.name.trim().toLowerCase();
  parsed.description = parsed.description.trim();
  parsed.scopeDir = parsed.scopeDir.trim();

  if (!parsed.name) {
    console.error(`${icons.error} ${red('--name es obligatorio para --tier 3.')}\n`);
    process.stdout.write(HELP);
    return 1;
  }

  const projectRoot = process.cwd();
  const agentsDir = join(projectRoot, '.claude', 'agents');
  const agentFile = join(agentsDir, `${parsed.name}.md`);

  if (existsSync(agentFile) && !parsed.force) {
    console.error(
      `${icons.error} ${red(`${agentFile} ya existe.`)} ${dim('Usá --force para sobrescribir.')}`
    );
    return 1;
  }

  try {
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(agentFile, tier3Markdown(parsed), 'utf-8');
  } catch (e: unknown) {
    console.error(`${icons.error} ${red(`Error al escribir el archivo: ${e instanceof Error ? e.message : String(e)}`)}`);
    return 1;
  }

  console.log(cyan(bold('forge scaffold')) + ' ' + dim('(Tier 3)') + '\n');
  console.log(`  [${icons.ok}] ${green('creado')}  ${agentFile}`);

  const nextSteps = [
    `1. Completar el agente: ${parsed.name}.md (description, Tu trabajo, Reglas, No hagas)`,
    `2. Registrar en project.yaml: agents.specialized → - ${parsed.name}`,
    `3. Validar la consistencia: forge validate`,
  ];

  console.log(
    '\n' + box(green(`Agente Tier 3 '${parsed.name}' listo`), nextSteps)
  );

  return 0;
}

export async function scaffold(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const parsed = parseArgs(args);

  if (parsed.tier.trim() === '3') {
    return scaffoldTier3(parsed);
  }

  parsed.name = parsed.name.trim().toLowerCase();
  parsed.engineer = parsed.engineer.trim().toLowerCase();
  parsed.description = parsed.description.trim();
  parsed.stackDetails = parsed.stackDetails.trim();

  if (!parsed.name || !parsed.engineer) {
    console.error(
      `${icons.error} ${red('--name y --engineer son obligatorios y no pueden estar vacíos.')}\n`
    );
    process.stdout.write(HELP);
    return 1;
  }

  let forgeRoot: string;
  try {
    forgeRoot = resolveForgeRoot();
  } catch (e: unknown) {
    console.error(`${icons.error} ${red(e instanceof Error ? e.message : String(e))}`);
    return 1;
  }

  const profileDir = join(forgeRoot, 'profiles', parsed.name);
  const agentsDir = join(profileDir, 'agents');
  const agentFile = join(agentsDir, `${parsed.engineer}.md`);
  const readmeFile = join(profileDir, 'README.md');

  if (existsSync(agentFile) && !parsed.force) {
    console.error(
      `${icons.error} ${red(`${agentFile} ya existe.`)} ${dim('Usá --force para sobrescribir.')}`
    );
    return 1;
  }

  const created: string[] = [];
  const skipped: string[] = [];

  try {
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(agentFile, agentMarkdown(parsed), 'utf-8');
    created.push(agentFile);

    if (existsSync(readmeFile)) {
      skipped.push(readmeFile);
    } else {
      writeFileSync(readmeFile, readmeMarkdown(parsed), 'utf-8');
      created.push(readmeFile);
    }
  } catch (e: unknown) {
    console.error(`${icons.error} ${red(`Error al escribir archivos: ${e instanceof Error ? e.message : String(e)}`)}`);
    return 1;
  }

  console.log(cyan(bold('forge scaffold')) + '\n');
  for (const file of created) {
    console.log(`  [${icons.ok}] ${green('creado')}  ${file}`);
  }
  for (const file of skipped) {
    console.log(`  [${icons.skip}] ${yellow('omitido')} ${dim(file)} ${gray('(ya existía)')}`);
  }

  const nextSteps = [
    `1. Revisar y completar el agente: ${parsed.engineer}.md`,
    `2. Documentar el profile en docs/agent-standard.md (tabla Tier 2)`,
    `3. Activar en project.yaml: agents.profiles → - ${parsed.name}`,
    `4. Instalar el agente: forge init`,
  ];

  console.log(
    '\n' + box(green(`Profile '${parsed.name}' listo`), nextSteps)
  );

  return 0;
}
