/**
 * Source resolution + fetch for `forge add` (SPEC-045). This is the ONLY place
 * in forge that touches the network, and only for a `<owner>/<repo>` spec. A
 * local path source stays fully offline (used in tests and for vendored skills).
 *
 * v1 ingests a single SKILL.md (text we can scan) — no scripts, no tarballs, no
 * binaries. The ref is resolved to an immutable commit sha for provenance.
 */
import { existsSync, readFileSync, statSync } from 'fs';
import { join, isAbsolute } from 'path';

export interface SkillSource {
  kind: 'github' | 'local';
  /** Human label for reports. */
  label: string;
  owner?: string;
  repo?: string;
  subpath?: string;
  ref?: string;
  localPath?: string;
}

export interface FetchedSkill {
  content: string;
  /** Resolved immutable sha (github) or 'local'. */
  sha: string;
  label: string;
}

const SHA_RE = /^[0-9a-f]{7,40}$/i;
const GITHUB_SPEC = /^([\w.-]+)\/([\w.-]+)(?:\/([\w./-]+?))?(?:@([\w./-]+))?$/;

/** Parses `<owner>/<repo>[/subpath][@ref]` or a local filesystem path. */
export function resolveSource(spec: string, opts: { path?: string } = {}): SkillSource {
  const looksLocal =
    spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('~') ||
    isAbsolute(spec) || existsSync(spec);
  if (looksLocal) {
    return { kind: 'local', label: spec, localPath: spec };
  }
  const m = spec.match(GITHUB_SPEC);
  if (!m) {
    throw new Error(
      `fuente invalida: "${spec}". Usa <owner>/<repo>[/subpath][@ref] o una ruta local.`,
    );
  }
  const [, owner, repo, subpath, ref] = m;
  return {
    kind: 'github', owner, repo,
    subpath: opts.path ?? subpath,
    ref,
    label: `github.com/${owner}/${repo}${ref ? `@${ref}` : ''}`,
  };
}

/** Reads a SKILL.md from a local path (file or directory containing one). */
function readLocal(p: string): FetchedSkill {
  let file = p.replace(/^~(?=\/)/, process.env.HOME ?? '~');
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'SKILL.md');
  if (!existsSync(file)) throw new Error(`no se encontro SKILL.md en "${p}"`);
  return { content: readFileSync(file, 'utf-8'), sha: 'local', label: p };
}

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'forge-cli' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function getText(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'forge-cli' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetches the skill's SKILL.md. For github: resolves ref→sha (pinning) and pulls
 * raw content at that sha. `fetchImpl` is injectable for tests; in production it
 * uses native fetch (Node 20+), no dependency added.
 */
export async function fetchSkill(
  source: SkillSource,
  opts: { timeoutMs?: number } = {},
): Promise<FetchedSkill> {
  if (source.kind === 'local') return readLocal(source.localPath!);

  const timeoutMs = opts.timeoutMs ?? 8000;
  const { owner, repo } = source;
  const ref = source.ref ?? 'HEAD';

  // Resolve ref → immutable sha (pin). A 40-hex ref is already a sha.
  let sha = ref;
  if (!SHA_RE.test(ref) || ref.length < 40) {
    const commit = await getJson(
      `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
      timeoutMs,
    ) as { sha?: string };
    if (!commit?.sha) throw new Error(`no se pudo resolver el ref "${ref}" a un commit`);
    sha = commit.sha;
  }

  const sub = source.subpath ? `${source.subpath.replace(/\/+$/, '')}/` : '';
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${sub}SKILL.md`;
  const content = await getText(rawUrl, timeoutMs);
  return { content, sha, label: `github.com/${owner}/${repo}@${sha.slice(0, 10)}` };
}
