import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv: any = require('ajv');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats: any = require('ajv-formats');
import { findProjectYaml, loadProjectYaml, projectRoot } from '../lib/yaml.js';
import { resolveForgeRoot } from '../lib/paths.js';

const HELP = `Usage: forge validate [options]

Validate project.yaml in the current directory against the forge v2 schema.
Exits with code 1 if validation fails (CI-safe).

Options:
  --json      Output results as JSON
  -h, --help  Show this help
`;

function loadSchema(forgeRoot: string): object | null {
  const schemaPath = join(forgeRoot, 'core', 'schemas', 'project.schema.json');
  if (!existsSync(schemaPath)) return null;
  try {
    return JSON.parse(readFileSync(schemaPath, 'utf-8'));
  } catch {
    return null;
  }
}

function businessWarnings(data: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  if (!data.deploy) warnings.push("Sección 'deploy' ausente — considera agregar deploy.provider y deploy.smoke_tests (v2)");
  if (!data.rules) warnings.push("Sección 'rules' ausente — considera agregar guardrails del proyecto (v2)");
  if (!data.github) warnings.push("Sección 'github' ausente — considera integrar con GitHub Projects (v2)");
  return warnings;
}

/**
 * Verifica que cada agente Tier 3 declarado en agents.specialized exista como
 * archivo en .claude/agents/<agente>.md. Devuelve una lista de errores (vacía si
 * todos existen o si no hay agentes especializados declarados).
 */
function specializedAgentErrors(data: Record<string, unknown>, root: string): string[] {
  const errors: string[] = [];
  const agents = (data.agents ?? null) as { specialized?: unknown } | null;
  const specialized = agents?.specialized;
  if (!Array.isArray(specialized)) return errors;

  const agentsDir = join(root, '.claude', 'agents');
  for (const name of specialized) {
    if (typeof name !== 'string') continue;
    const file = join(agentsDir, `${name}.md`);
    if (!existsSync(file)) {
      errors.push(
        `/agents/specialized: el agente Tier 3 '${name}' está en agents.specialized pero no existe .claude/agents/${name}.md`,
      );
    }
  }
  return errors;
}

export async function validate(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  const jsonMode = args.includes('--json');

  const projectYamlPath = findProjectYaml(process.cwd());
  if (!projectYamlPath) {
    const result = { valid: false, errors: ['No se encontró project.yaml'], warnings: [] };
    jsonMode ? console.log(JSON.stringify(result, null, 2)) : console.error('ERROR: No se encontró project.yaml');
    return 1;
  }

  let data: Record<string, unknown>;
  try {
    data = loadProjectYaml(projectYamlPath) as unknown as Record<string, unknown>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const result = { valid: false, errors: [msg], warnings: [] };
    jsonMode ? console.log(JSON.stringify(result, null, 2)) : console.error(`ERROR: ${msg}`);
    return 1;
  }

  let errors: string[] = [];

  try {
    const forgeRoot = resolveForgeRoot();
    const schema = loadSchema(forgeRoot);
    if (schema) {
      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      const validate = ajv.compile(schema);
      const valid = validate(data);
      if (!valid && validate.errors) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        errors = validate.errors.map((e: any) => {
          const path = e.instancePath || 'raíz';
          return `${path}: ${e.message}`;
        });
      }
    }
  } catch {
    // schema not available — skip schema validation
  }

  // Tier 3: cada agente en agents.specialized debe tener su archivo en .claude/agents/.
  if (errors.length === 0) {
    errors = specializedAgentErrors(data, projectRoot(projectYamlPath));
  }

  const warnings = businessWarnings(data);
  const valid = errors.length === 0;
  const result = { valid, errors, warnings };

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Validando: ${projectYamlPath}\n`);
    if (valid) {
      console.log('OK — project.yaml es válido');
    } else {
      console.log(`INVALIDO — ${errors.length} error(s) encontrado(s):`);
      errors.forEach(e => console.log(`  [ERROR] ${e}`));
    }
    if (warnings.length > 0) {
      console.log(`\n${warnings.length} advertencia(s):`);
      warnings.forEach(w => console.log(`  [WARN]  ${w}`));
    }
  }

  return valid ? 0 : 1;
}
