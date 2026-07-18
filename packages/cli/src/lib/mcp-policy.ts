/**
 * Política MCP escaneable (SPEC-083 P5) — `.forge/mcp-policy.json`.
 *
 * forge declara, mingako ejecuta: `forge generate` emite acá la política MCP
 * efectiva derivada de project.yaml (default-deny: toda tool no listada en
 * autoApprove requiere aprobación), y un orquestador la consume para
 * sandboxing/approval gates sin re-derivarla. `forge audit --mcp` escanea el
 * archivo: valida contra el schema, detecta drift respecto de project.yaml
 * (edición manual o política desactualizada) y autoApprove demasiado amplio.
 *
 * `buildMcpPolicy` es una función PURA (misma config → misma política, sin
 * timestamps); la I/O queda en generate.ts y en `auditMcpPolicy`.
 *
 * El schema fuente vive en @cristiancorreau/forge-schemas
 * (schemas/mcp-policy.schema.json, $id forge://schemas/v4/mcp-policy). La
 * copia inlineada acá evita una dependencia de runtime; el test
 * spec-083-mcp-policy.test.mjs fija la paridad byte a byte entre ambas.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import type { ProjectYaml } from './yaml.js';
import { findProjectYaml, loadProjectYaml } from './yaml.js';
import type { AuditIssue } from '../commands/audit.js';
import { VERSION } from '../version.js';

const require = createRequire(import.meta.url);
// ajv es CJS: mismo patrón de carga que commands/validate.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv: any = require('ajv');

/** Versión del contrato de la política MCP (SemVer mayor como string). */
export const MCP_POLICY_SCHEMA_VERSION = '1';

/** Ruta relativa (desde la raíz del proyecto) del archivo generado. */
export const MCP_POLICY_FILE = '.forge/mcp-policy.json';

export interface McpPolicyServer {
  name: string;
  command?: string;
  autoApprove: string[];
  timeoutMs?: number;
  permissions?: string[];
}

export interface McpPolicy {
  schemaVersion: typeof MCP_POLICY_SCHEMA_VERSION;
  generatedBy: string;
  project: string;
  defaultPolicy: 'deny';
  servers: McpPolicyServer[];
  notes?: string;
}

/**
 * Copia inlineada de mcp-policy.schema.json (forge-schemas). NO editar acá:
 * la fuente de verdad es packages/schemas/schemas/mcp-policy.schema.json y un
 * test verifica que ambas copias son idénticas.
 */
export const MCP_POLICY_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'forge://schemas/v4/mcp-policy',
  title: 'McpPolicy',
  description: 'Política MCP efectiva de un proyecto forge, emitida por `forge generate` en .forge/mcp-policy.json (SPEC-083 P5). Default-deny: toda tool no listada en autoApprove requiere aprobación. Un orquestador (mingako) la consume para sandboxing y approval gates sin re-derivarla de project.yaml.',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'generatedBy', 'project', 'defaultPolicy', 'servers'],
  properties: {
    schemaVersion: { const: '1' },
    generatedBy: {
      type: 'string',
      pattern: '^forge@\\d+\\.\\d+\\.\\d+',
    },
    project: { type: 'string', minLength: 1 },
    defaultPolicy: { const: 'deny' },
    servers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'autoApprove'],
        properties: {
          name: { type: 'string', minLength: 1 },
          command: { type: 'string', minLength: 1 },
          autoApprove: { type: 'array', items: { type: 'string', minLength: 1 } },
          timeoutMs: { type: 'integer', minimum: 1 },
          permissions: { type: 'array', items: { type: 'string', minLength: 1 } },
        },
      },
    },
    notes: { type: 'string' },
  },
} as const;

/**
 * Marca de archivo generado (misma convención que el resto de superficies de
 * forge: contiene "Generado por forge", lo que activa el guard de archivos
 * manuales de generate.ts).
 */
const POLICY_NOTES =
  'Generado por forge (SPEC-083 P5) — derivado de project.yaml (mcp.servers). ' +
  'No editar a mano: regenerar con forge generate --force. ' +
  'Default-deny: toda tool MCP no listada en autoApprove requiere aprobación.';

/**
 * Deriva la política MCP efectiva desde project.yaml. PURA y determinista:
 * sin timestamps ni orden dependiente del filesystem. Si el proyecto no
 * declara mcp.servers, emite la política vacía (default-deny igualmente).
 */
export function buildMcpPolicy(config: ProjectYaml): McpPolicy {
  const servers: McpPolicyServer[] = (config.mcp?.servers ?? [])
    .filter(s => s && typeof s.name === 'string' && s.name.trim())
    .map(s => ({
      name: s.name.trim(),
      autoApprove: Array.isArray(s.auto_approve)
        ? s.auto_approve.map(v => String(v).trim()).filter(Boolean)
        : [],
    }));

  return {
    schemaVersion: MCP_POLICY_SCHEMA_VERSION,
    generatedBy: `forge@${VERSION}`,
    project: (config.project?.name ?? '').trim() || '(sin nombre)',
    defaultPolicy: 'deny',
    servers,
    notes: POLICY_NOTES,
  };
}

/** Serializa la política al contenido exacto del archivo (determinista). */
export function renderMcpPolicy(policy: McpPolicy): string {
  return JSON.stringify(policy, null, 2) + '\n';
}

/** Patrones de autoApprove demasiado amplios (aprueban todo). */
const BROAD_AUTO_APPROVE = new Set(['*', 'all']);

/**
 * `forge audit --mcp` — escanea `.forge/mcp-policy.json`:
 *   (a) presencia: error si hay mcp.servers declarados y el archivo falta;
 *   (b) schema: el archivo valida contra mcp-policy.schema.json;
 *   (c) drift: la política del archivo coincide con la derivada del
 *       project.yaml actual (edición manual o desactualización);
 *   (d) alcance: autoApprove "*"/"all" aprueba todo — contradice default-deny.
 */
export function auditMcpPolicy(root: string = process.cwd()): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const check = 'mcp-policy';

  const yamlPath = findProjectYaml(root);
  if (!yamlPath) {
    issues.push({ level: 'error', check, message: 'No se encontró project.yaml — ejecutar forge init' });
    return issues;
  }
  let config: ProjectYaml;
  try {
    config = loadProjectYaml(yamlPath);
  } catch (e: unknown) {
    issues.push({ level: 'error', check, message: `project.yaml inválido: ${e instanceof Error ? e.message : String(e)}` });
    return issues;
  }

  const expected = buildMcpPolicy(config);
  const declared = expected.servers.length;
  const policyPath = join(root, MCP_POLICY_FILE);

  // (a) Presencia del archivo.
  if (!existsSync(policyPath)) {
    if (declared > 0) {
      issues.push({
        level: 'error', check,
        message: `${MCP_POLICY_FILE} ausente con ${declared} MCP server(s) declarados en project.yaml — ejecutar forge generate`,
      });
    } else {
      issues.push({
        level: 'info', check,
        message: `${MCP_POLICY_FILE} ausente (sin mcp.servers declarados) — forge generate lo emite con la política vacía`,
      });
    }
    return issues;
  }

  // (b) JSON parseable + válido contra el schema.
  let policy: unknown;
  try {
    policy = JSON.parse(readFileSync(policyPath, 'utf-8'));
  } catch {
    issues.push({ level: 'error', check, message: `${MCP_POLICY_FILE} no es JSON válido — regenerar con forge generate --force` });
    return issues;
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(MCP_POLICY_SCHEMA as object);
  if (!validate(policy)) {
    const errors = (validate.errors ?? []) as Array<{ instancePath?: string; message?: string }>;
    const detail = errors
      .map(e => `${e.instancePath || '/'} ${e.message ?? 'inválido'}`)
      .join('; ');
    issues.push({
      level: 'error', check,
      message: `${MCP_POLICY_FILE} no valida contra mcp-policy.schema.json: ${detail}`,
    });
    return issues;
  }
  issues.push({ level: 'ok', check, message: `${MCP_POLICY_FILE} valida contra mcp-policy.schema.json (schemaVersion "1")` });

  // (c) Drift vs project.yaml actual. generatedBy y notes no cuentan como
  // drift (cambian con la versión de forge sin alterar la política efectiva).
  const found = policy as McpPolicy;
  const effective = (p: McpPolicy): string =>
    JSON.stringify({ project: p.project, defaultPolicy: p.defaultPolicy, servers: p.servers });
  if (effective(found) !== effective(expected)) {
    issues.push({
      level: 'error', check,
      message: `${MCP_POLICY_FILE} con drift respecto de project.yaml (editado a mano o desactualizado) — regenerar con forge generate --force`,
    });
  } else {
    issues.push({ level: 'ok', check, message: `Política al día con project.yaml — ${declared} server(s), default deny` });
  }

  // (d) autoApprove demasiado amplio.
  for (const server of found.servers ?? []) {
    const broad = (server.autoApprove ?? []).filter(t => BROAD_AUTO_APPROVE.has(t.toLowerCase()));
    if (broad.length > 0) {
      issues.push({
        level: 'warn', check,
        message: `Server '${server.name}' con autoApprove demasiado amplio (${broad.join(', ')}) — contradice default-deny; listar tools explícitas`,
      });
    }
  }

  return issues;
}
