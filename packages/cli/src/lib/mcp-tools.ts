/**
 * The two DYNAMIC tools behind `forge mcp` (RFC-003). PURE + testable: no MCP
 * SDK here, no network. commands/mcp.ts lazily loads the SDK and delegates to
 * these functions.
 *
 * Golden rule (enforced by an allowlist test): the static floor stays complete;
 * MCP is strictly ADDITIVE (a freshness layer). Nothing forge knows is reachable
 * ONLY via MCP. These two tools expose only values that genuinely change at use
 * time and cannot be precomputed in `forge generate`:
 *   - guardrail_status: the LIVE verdict of the project's own hooks.
 *   - wiki_search:      a query over the confined wiki/ corpus.
 * Both are READ-ONLY and tightly scoped. Neither takes a free-form path it reads.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, basename, relative, sep } from 'path';
import { spawnSync } from 'child_process';

/** The exact, allowlisted set of tools. Adding to this is a deliberate review. */
export const MCP_TOOLS = ['guardrail_status', 'wiki_search'] as const;

// ── guardrail_status ────────────────────────────────────────────────────────

export interface GuardrailInput {
  /** A shell command to evaluate against pre-bash-check. */
  command?: string;
  /** A file path to evaluate against pre-edit-check (with optional new content). */
  file?: string;
  content?: string;
}

export interface GuardrailResult {
  verdict: 'allow' | 'warn' | 'block';
  blocked: boolean;
  message: string;
}

/**
 * Returns the LIVE guardrail verdict by running the project's OWN installed hook
 * (.claude/hooks/*) with the given payload and interpreting its exit code. This
 * reuses the exact same logic the runtime enforces — no duplication, no drift.
 * Read-only: it never executes the command, only asks the hook for a verdict.
 */
export function guardrailStatus(input: GuardrailInput, projectRoot: string): GuardrailResult {
  let hook: string;
  let payload: unknown;
  if (input.command !== undefined) {
    hook = join(projectRoot, '.claude', 'hooks', 'pre-bash-check.js');
    payload = { tool_name: 'Bash', tool_input: { command: input.command } };
  } else if (input.file !== undefined) {
    hook = join(projectRoot, '.claude', 'hooks', 'pre-edit-check.js');
    payload = { tool_name: 'Edit', tool_input: { file_path: input.file, new_string: input.content ?? '' } };
  } else {
    return { verdict: 'allow', blocked: false, message: 'Sin entrada: pasá `command` o `file`.' };
  }

  if (!existsSync(hook)) {
    return {
      verdict: 'allow', blocked: false,
      message: 'Guardrails no instalados en este proyecto (.claude/hooks/ ausente).',
    };
  }

  const res = spawnSync(process.execPath, [hook], {
    cwd: projectRoot,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 5000,
    env: { ...process.env, DEBUG: '' },
  });
  const out = ((res.stdout ?? '') + (res.stderr ?? '')).trim();
  const status = res.status ?? 0;

  if (status === 2) return { verdict: 'block', blocked: true, message: out || 'Bloqueado por el guardrail.' };
  if (out && /ADVERTENCIA|warning/i.test(out)) return { verdict: 'warn', blocked: false, message: out };
  return { verdict: 'allow', blocked: false, message: out || 'Permitido por los guardrails.' };
}

// ── wiki_search ─────────────────────────────────────────────────────────────

export interface WikiHit {
  /** Page path relative to wiki/ (e.g. "concepts/auth.md"). */
  page: string;
  line: number;
  snippet: string;
}

const CONTROL_FILES = ['index.md', 'log.md'];

/** True for a real knowledge page (excludes raw/ sources, control + template seeds). */
function isWikiPage(wikiRoot: string, path: string): boolean {
  if (path.startsWith(join(wikiRoot, 'raw') + sep)) return false;
  const name = basename(path);
  if (name === '_template.md') return false;
  if (CONTROL_FILES.includes(name)) return false;
  return true;
}

function collectMarkdown(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdown(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * Lexical, case-insensitive search over the project's `wiki/` knowledge pages.
 * CONFINED by construction: it only ever reads files under `<projectRoot>/wiki/`
 * and takes a query STRING (never a path), so there is no path-traversal surface.
 * Mirrors `forge wiki query` (the static floor); this is the additive interface.
 */
export function wikiSearch(query: string, projectRoot: string, opts: { limit?: number } = {}): WikiHit[] {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return [];
  const wikiRoot = join(projectRoot, 'wiki');
  if (!existsSync(wikiRoot)) return [];
  const limit = opts.limit ?? 25;

  const hits: WikiHit[] = [];
  for (const file of collectMarkdown(wikiRoot)) {
    if (!isWikiPage(wikiRoot, file)) continue;
    // Defense in depth: never read outside wiki/ even if collect returned an odd path.
    const rel = relative(wikiRoot, file);
    if (rel.startsWith('..') || rel.includes(`..${sep}`)) continue;
    let content: string;
    try { content = readFileSync(file, 'utf-8'); } catch { continue; }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        hits.push({ page: rel.split(sep).join('/'), line: i + 1, snippet: lines[i].trim().slice(0, 200) });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}
