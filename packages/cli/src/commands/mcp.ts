import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { VERSION } from '../version.js';
import {
  guardrailStatus, wikiSearch, MCP_TOOLS,
  type GuardrailInput,
} from '../lib/mcp-tools.js';

const HELP = `Usage: forge mcp [serve] [options]

Run forge's MCP server (stdio) so an MCP-aware runtime can query the project's
LIVE state.

Subcommands:
  (none)   Minimal server: two dynamic, read-only tools.
  serve    Full server (SPEC-083 P4): resources (specs, export, audit),
           prompts (agents/commands as templates) and tools
           (forge_audit, forge_recommend, forge_generate).
           Run 'forge mcp serve --help' for details.

Tools (minimal server):
  guardrail_status   Live verdict of the project's guardrail hooks for a command
                     or a file edit (would it be blocked/warned?).
  wiki_search        Search the project's wiki/ knowledge pages (confined corpus).

Transport: stdio only (no network, no HTTP). Register it once with your runtime:
  claude mcp add -s local -t stdio forge -- forge mcp

Options:
  -h, --help   Show this help
`;

export function findProjectRoot(start: string): string {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, '.forge', 'manifest.json')) ||
        existsSync(join(dir, 'project.yaml')) ||
        existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/**
 * Lazily resolves @modelcontextprotocol/sdk, trying the consuming project's
 * node_modules first, then forge's own. Returns null if not resolvable (the
 * caller prints an actionable message). Typed `any` on purpose: the SDK is not a
 * forge dependency, so tsc must not try to resolve it at build time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSdk(): any | null {
  const makers = [
    () => createRequire(join(process.cwd(), 'index.js')),
    () => createRequire(fileURLToPath(import.meta.url)),
  ];
  for (const make of makers) {
    try {
      const req = make();
      return {
        Server: req('@modelcontextprotocol/sdk/server/index.js').Server,
        StdioServerTransport: req('@modelcontextprotocol/sdk/server/stdio.js').StdioServerTransport,
        types: req('@modelcontextprotocol/sdk/types.js'),
      };
    } catch { /* try the next resolver */ }
  }
  return null;
}

/** The advertised tools. MUST stay a subset of MCP_TOOLS (golden-rule allowlist). */
export const TOOL_DEFS = [
  {
    name: 'guardrail_status',
    description:
      "Live verdict of the project's guardrail hooks. Pass `command` (shell) or " +
      '`file` (+ optional `content`). Read-only: it never runs the command.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'A shell command to evaluate.' },
        file: { type: 'string', description: 'A file path to evaluate for editing.' },
        content: { type: 'string', description: 'Optional new content for the file edit.' },
      },
    },
  },
  {
    name: 'wiki_search',
    description: "Search the project's wiki/ knowledge pages (lexical, confined to wiki/).",
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Text to search for.' } },
      required: ['query'],
    },
  },
];

export async function mcp(args: string[]): Promise<number> {
  // `forge mcp serve` (SPEC-083 P4): server completo con resources/prompts/tools.
  // import() dinámico para que el SDK no pese en el cold-start del resto de la CLI.
  if (args[0] === 'serve') {
    const { mcpServe } = await import('./mcp-serve.js');
    return mcpServe(args.slice(1));
  }
  if (args.includes('-h') || args.includes('--help')) { process.stdout.write(HELP); return 0; }

  const sdk = loadSdk();
  if (!sdk) {
    process.stderr.write(
      'forge mcp: falta @modelcontextprotocol/sdk.\n' +
      '  Es una dependencia opt-in (no se instala con forge para no pesar en el cold-start).\n' +
      '  Instalala en tu proyecto:  npm i @modelcontextprotocol/sdk\n',
    );
    return 1;
  }

  const projectRoot = findProjectRoot(process.cwd());
  const { Server, StdioServerTransport, types } = sdk;
  const server = new Server({ name: 'forge', version: VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(types.ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.setRequestHandler(types.CallToolRequestSchema, async (req: any) => {
    const name: string = req.params?.name;
    const a = (req.params?.arguments ?? {}) as Record<string, unknown>;
    // Hard allowlist: only the two declared tools are callable.
    if (!MCP_TOOLS.includes(name as (typeof MCP_TOOLS)[number])) {
      return { isError: true, content: [{ type: 'text', text: `tool desconocida: ${name}` }] };
    }
    if (name === 'guardrail_status') {
      const input: GuardrailInput = {
        command: typeof a.command === 'string' ? a.command : undefined,
        file: typeof a.file === 'string' ? a.file : undefined,
        content: typeof a.content === 'string' ? a.content : undefined,
      };
      const r = guardrailStatus(input, projectRoot);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }
    // wiki_search
    const hits = wikiSearch(typeof a.query === 'string' ? a.query : '', projectRoot);
    const text = hits.length
      ? hits.map(h => `${h.page}:${h.line}  ${h.snippet}`).join('\n')
      : 'sin coincidencias en wiki/';
    return { content: [{ type: 'text', text }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('forge mcp: servidor MCP (stdio) activo. Ctrl-C para salir.\n');

  // Keep the process alive until the client disconnects or we are interrupted.
  return await new Promise<number>((resolve) => {
    transport.onclose = () => resolve(0);
    process.on('SIGINT', () => resolve(0));
    process.on('SIGTERM', () => resolve(0));
  });
}
