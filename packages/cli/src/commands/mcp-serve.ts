/**
 * `forge mcp serve` (SPEC-083 P4) — server MCP completo por stdio.
 *
 * Expone el proyecto del cwd (o --dir) a cualquier orquestador MCP (mingako,
 * Claude Code, LangGraph...):
 *   - resources: specs de docs/specs/, modelo resuelto (export) y auditoría.
 *   - prompts: agentes y comandos del proyecto + agentes del catálogo forge.
 *   - tools: forge_audit, forge_recommend, forge_generate (contrato JSON
 *     SPEC-083, mismo shape que los `--json` de la CLI).
 *
 * Reglas del transporte stdio: NADA se escribe a stdout fuera del protocolo;
 * los diagnósticos van a stderr. Los errores al cliente son mensajes cortos,
 * nunca stack traces.
 *
 * Este módulo se carga con import() dinámico desde `forge mcp` para que el
 * SDK de MCP no pese en el cold-start del resto de la CLI.
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'fs';
import { join, resolve, dirname, basename, sep } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { VERSION } from '../version.js';
import { findProjectRoot } from './mcp.js';
import { findProjectYaml, loadProjectYaml } from '../lib/yaml.js';
import { buildExportModel } from '../lib/export-model.js';
import { runAudit, auditJsonContract } from './audit.js';
import { recommend as runRecommend, recommendJsonContract } from '../lib/recommend.js';
import { resolveForgeRoot } from '../lib/paths.js';
import { parseFrontmatter } from '../lib/unit-registry.js';

const HELP = `Usage: forge mcp serve [options]

Server MCP completo (stdio) sobre el proyecto del directorio actual (o --dir).
Expone resources (specs, modelo resuelto, auditoría), prompts (agentes y
comandos como templates) y tools (forge_audit, forge_recommend, forge_generate)
con el contrato JSON de SPEC-083.

Registro en un runtime MCP:
  claude mcp add forge -- forge mcp serve

Options:
  --dir <path>   Raíz del proyecto a exponer (default: directorio actual)
  -h, --help     Muestra esta ayuda
`;

/** Placeholder de argumentos en los templates de comandos/agentes. */
const ARGS_PLACEHOLDER = '$ARGUMENTS';

interface SpecEntry {
  uri: string;
  name: string;
  file: string;
}

/** Deriva el id estable de una spec: "SPEC-083-foo.md" → "SPEC-083". */
function specId(file: string): string {
  const base = basename(file, '.md');
  const m = base.match(/^(SPEC-\d+)/i);
  return m ? m[1].toUpperCase() : base;
}

/** true si `path` es `root` o un descendiente de `root`. */
function isInsideRoot(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep);
}

/**
 * Lista las specs del proyecto (docs/specs/ o config.paths.specs).
 *
 * Confinamiento: `paths.specs` viene de project.yaml (dato del repo, que puede
 * ser hostil en un clon ajeno), así que un valor con `..`, absoluto o con
 * symlinks no puede exponer archivos de FUERA del root del proyecto por MCP.
 * Se compara sobre realpath para cubrir symlinks, por directorio y por archivo.
 */
function listSpecs(root: string): SpecEntry[] {
  let specsRel = 'docs/specs';
  const yamlPath = findProjectYaml(root);
  if (yamlPath) {
    try {
      specsRel = loadProjectYaml(yamlPath).paths?.specs ?? specsRel;
    } catch { /* project.yaml inválido: usar el default */ }
  }
  const dir = resolve(root, specsRel);
  if (!existsSync(dir)) return [];
  let rootReal: string;
  let dirReal: string;
  try {
    rootReal = realpathSync(root);
    dirReal = realpathSync(dir);
  } catch {
    return [];
  }
  if (!isInsideRoot(rootReal, dirReal)) {
    process.stderr.write(`forge mcp serve: paths.specs apunta fuera del proyecto (${specsRel}); no se exponen specs.\n`);
    return [];
  }
  const seen = new Set<string>();
  const out: SpecEntry[] = [];
  for (const f of readdirSync(dirReal).filter(f => f.endsWith('.md')).sort()) {
    const file = join(dirReal, f);
    try {
      // Symlink individual que escapa del root: tampoco se expone.
      if (!isInsideRoot(rootReal, realpathSync(file))) continue;
    } catch {
      continue;
    }
    const id = specId(f);
    if (seen.has(id)) continue; // primera spec con ese id gana (orden estable)
    seen.add(id);
    out.push({ uri: `forge://specs/${id}`, name: id, file });
  }
  return out;
}

interface PromptEntry {
  name: string;
  description: string;
  file: string;
  acceptsArguments: boolean;
}

/** Lee la description del frontmatter de un .md (o '' si no tiene). */
function mdDescription(file: string): string {
  try {
    const fm = parseFrontmatter(readFileSync(file, 'utf-8'));
    return typeof fm['description'] === 'string' ? fm['description'].trim() : '';
  } catch {
    return '';
  }
}

function pushPrompt(out: PromptEntry[], seen: Set<string>, name: string, file: string, kind: string): void {
  if (seen.has(name) || !existsSync(file)) return;
  seen.add(name);
  let acceptsArguments = false;
  try {
    acceptsArguments = readFileSync(file, 'utf-8').includes(ARGS_PLACEHOLDER);
  } catch { /* ilegible: template sin argumentos */ }
  const desc = mdDescription(file);
  out.push({
    name,
    description: desc || `${kind} '${basename(file, '.md')}'`,
    file,
    acceptsArguments,
  });
}

/**
 * Prompts expuestos: agentes y comandos instalados en el proyecto
 * (.claude/agents/, .claude/commands/) + agentes del catálogo forge
 * (core/agents/, profiles/<p>/agents/). Nombres estables y sin colisiones.
 */
function collectPrompts(root: string): PromptEntry[] {
  const out: PromptEntry[] = [];
  const seen = new Set<string>();

  const agentsDir = join(root, '.claude', 'agents');
  if (existsSync(agentsDir)) {
    for (const f of readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort()) {
      pushPrompt(out, seen, `agent-${basename(f, '.md')}`, join(agentsDir, f), 'Agente del proyecto');
    }
  }
  const commandsDir = join(root, '.claude', 'commands');
  if (existsSync(commandsDir)) {
    for (const f of readdirSync(commandsDir).filter(f => f.endsWith('.md')).sort()) {
      pushPrompt(out, seen, `command-${basename(f, '.md')}`, join(commandsDir, f), 'Comando del proyecto');
    }
  }

  let forgeRoot: string | null = null;
  try {
    forgeRoot = resolveForgeRoot();
  } catch {
    forgeRoot = null;
  }
  if (forgeRoot) {
    const coreDir = join(forgeRoot, 'core', 'agents');
    if (existsSync(coreDir)) {
      for (const f of readdirSync(coreDir).filter(f => f.endsWith('.md')).sort()) {
        pushPrompt(out, seen, `catalog-agent-${basename(f, '.md')}`, join(coreDir, f), 'Agente del catálogo forge (core)');
      }
    }
    const profilesDir = join(forgeRoot, 'profiles');
    if (existsSync(profilesDir)) {
      for (const p of readdirSync(profilesDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort()) {
        const pAgents = join(profilesDir, p, 'agents');
        if (!existsSync(pAgents)) continue;
        for (const f of readdirSync(pAgents).filter(f => f.endsWith('.md')).sort()) {
          pushPrompt(out, seen, `catalog-${p}-${basename(f, '.md')}`, join(pAgents, f), `Agente del catálogo forge (profile ${p})`);
        }
      }
    }
  }
  return out;
}

/** Tools expuestas (contrato JSON SPEC-083, mismo shape que la CLI --json). */
const TOOL_DEFS = [
  {
    name: 'forge_audit',
    description:
      'Audita el proyecto contra el estándar forge (agentes, hooks, project.yaml). ' +
      'Devuelve el contrato JSON de `forge audit --json` (schemaVersion "1").',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'forge_recommend',
    description:
      'Analiza el stack detectado y recomienda items del catálogo forge. Read-only. ' +
      'Devuelve el contrato JSON de `forge recommend --json` (schemaVersion "1").',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filtra por categoría (profile, mcp-server, framework, ...).' },
        top: { type: 'number', description: 'Máximo de items por categoría (default: 2).' },
      },
    },
  },
  {
    name: 'forge_generate',
    description:
      'Regenera la configuración de runtimes desde project.yaml. Respeta los guards ' +
      'de forge: sin `force` no sobrescribe archivos existentes, y los archivos ' +
      'manuales de CLAUDE.md, AGENTS.md, rules y git hooks (sin marcador forge) ' +
      'nunca se sobrescriben, ni siquiera con `force`.',
    inputSchema: {
      type: 'object',
      properties: {
        runtime: { type: 'string', description: "Runtime destino (p. ej. claude-code) o 'all'." },
        dryRun: { type: 'boolean', description: 'Solo muestra qué se generaría, sin escribir.' },
        force: { type: 'boolean', description: 'Sobrescribe archivos generados por forge (los manuales, sin marcador forge, se conservan).' },
      },
    },
  },
];

/** Respuesta de error corta para el cliente; el detalle va a stderr. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toolError(context: string, e: unknown): any {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`forge mcp serve: ${context}: ${msg}\n`);
  return { isError: true, content: [{ type: 'text', text: `${context}: ${msg}` }] };
}

/** JSON como contenido de tool MCP. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonContent(payload: object): any {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Ejecuta `forge generate` como proceso hijo de la MISMA CLI compilada.
 * Se usa spawn (y no la función interna) porque generate() imprime su progreso
 * directo a stdout y depende del cwd: en un server stdio eso corrompería el
 * protocolo. El hijo hereda todos los guards (SKIP sin --force, archivos
 * manuales intocables incluso con --force).
 */
function runGenerateChild(root: string, args: { runtime?: string; dryRun?: boolean; force?: boolean }): object {
  const cliPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');
  const argv = ['generate'];
  if (args.runtime) argv.push('--runtime', args.runtime);
  if (args.dryRun) argv.push('--dry-run');
  if (args.force) argv.push('--force');
  const res = spawnSync(process.execPath, [cliPath, ...argv], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 120_000,
  });
  const exitCode = res.status ?? 1;
  return {
    schemaVersion: '1',
    ok: exitCode === 0,
    exitCode,
    output: (res.stdout ?? '').trim(),
    ...(res.stderr?.trim() ? { stderr: res.stderr.trim() } : {}),
  };
}

export async function mcpServe(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const dirIdx = args.indexOf('--dir');
  const dirArg = dirIdx !== -1 ? args[dirIdx + 1] : undefined;
  if (dirIdx !== -1 && !dirArg) {
    process.stderr.write('forge mcp serve: --dir requiere una ruta.\n');
    return 1;
  }
  const root = findProjectRoot(resolve(dirArg ?? process.cwd()));

  const server = new Server(
    { name: 'forge', version: VERSION },
    { capabilities: { resources: {}, prompts: {}, tools: {} } },
  );

  // ---- resources -----------------------------------------------------------
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'forge://project/export',
        name: 'project-export',
        description: 'Modelo resuelto del proyecto (contrato de `forge export --json`, schemaVersion "1").',
        mimeType: 'application/json',
      },
      {
        uri: 'forge://project/audit',
        name: 'project-audit',
        description: 'Resultado de la auditoría del proyecto (contrato de `forge audit --json`, schemaVersion "1").',
        mimeType: 'application/json',
      },
      ...listSpecs(root).map(s => ({
        uri: s.uri,
        name: s.name,
        description: `Spec ${s.name} del proyecto (${basename(s.file)}).`,
        mimeType: 'text/markdown',
      })),
    ],
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.setRequestHandler(ReadResourceRequestSchema, async (req: any) => {
    const uri: string = req.params?.uri ?? '';
    try {
      if (uri === 'forge://project/export') {
        const model = buildExportModel(root);
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(model, null, 2) }] };
      }
      if (uri === 'forge://project/audit') {
        const payload = auditJsonContract(runAudit(root));
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(payload, null, 2) }] };
      }
      const spec = listSpecs(root).find(s => s.uri === uri);
      if (spec) {
        return { contents: [{ uri, mimeType: 'text/markdown', text: readFileSync(spec.file, 'utf-8') }] };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`forge mcp serve: resource ${uri}: ${msg}\n`);
      throw new Error(`no se pudo leer el resource: ${msg}`);
    }
    throw new Error(`resource desconocido: ${uri}`);
  });

  // ---- prompts -------------------------------------------------------------
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: collectPrompts(root).map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.acceptsArguments
        ? [{ name: 'arguments', description: 'Argumentos del template (reemplaza $ARGUMENTS).', required: false }]
        : [],
    })),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.setRequestHandler(GetPromptRequestSchema, async (req: any) => {
    const name: string = req.params?.name ?? '';
    const prompt = collectPrompts(root).find(p => p.name === name);
    if (!prompt) throw new Error(`prompt desconocido: ${name}`);
    let text: string;
    try {
      text = readFileSync(prompt.file, 'utf-8');
    } catch {
      throw new Error(`no se pudo leer el template del prompt: ${name}`);
    }
    const argValue = req.params?.arguments?.['arguments'];
    if (prompt.acceptsArguments && typeof argValue === 'string') {
      text = text.split(ARGS_PLACEHOLDER).join(argValue);
    }
    return {
      description: prompt.description,
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  });

  // ---- tools ---------------------------------------------------------------
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.setRequestHandler(CallToolRequestSchema, async (req: any) => {
    const name: string = req.params?.name;
    const a = (req.params?.arguments ?? {}) as Record<string, unknown>;

    if (name === 'forge_audit') {
      try {
        return jsonContent(auditJsonContract(runAudit(root)));
      } catch (e: unknown) {
        return toolError('forge_audit', e);
      }
    }

    if (name === 'forge_recommend') {
      try {
        let forgeRoot: string | null = null;
        try {
          forgeRoot = resolveForgeRoot();
        } catch {
          forgeRoot = null;
        }
        const top = typeof a.top === 'number' && a.top > 0 ? Math.floor(a.top) : 2;
        const category = typeof a.category === 'string' && a.category.trim() ? a.category.trim() : undefined;
        return jsonContent(recommendJsonContract(runRecommend(forgeRoot, root), top, category));
      } catch (e: unknown) {
        return toolError('forge_recommend', e);
      }
    }

    if (name === 'forge_generate') {
      try {
        return jsonContent(runGenerateChild(root, {
          runtime: typeof a.runtime === 'string' && a.runtime.trim() ? a.runtime.trim() : undefined,
          dryRun: a.dryRun === true,
          force: a.force === true,
        }));
      } catch (e: unknown) {
        return toolError('forge_generate', e);
      }
    }

    return { isError: true, content: [{ type: 'text', text: `tool desconocida: ${name}` }] };
  });

  // ---- transporte ----------------------------------------------------------
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`forge mcp serve: servidor MCP (stdio) activo sobre ${root}. Ctrl-C para salir.\n`);

  return await new Promise<number>((resolvePromise) => {
    transport.onclose = () => resolvePromise(0);
    // Shutdown estándar de MCP por stdio: el cliente cierra nuestro stdin.
    // El transport del SDK no escucha 'end', así que sin este handler la
    // Promise quedaría sin resolver y Node saldría con código 13.
    process.stdin.on('end', () => resolvePromise(0));
    process.on('SIGINT', () => resolvePromise(0));
    process.on('SIGTERM', () => resolvePromise(0));
  });
}
