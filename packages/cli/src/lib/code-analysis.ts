/**
 * Deterministic, offline code analysis for an existing repo (SPEC-061).
 *
 * analyzeCode(root) builds on lib/project-analysis.ts (stack/structure/deps) and
 * adds mechanical signals useful to understand an unfamiliar codebase: hotspots
 * (busiest directories, largest source files), TODO/FIXME markers, test presence,
 * a language histogram, and which forge agents the detected stack suggests.
 *
 * Pure given the filesystem: no LLM, no network, no clock, no randomness. Same
 * repo → same output. The agent-driven synthesis (architecture/onboarding/
 * security docs) lives in the `/onboard` skill, which consumes this as its base.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { analyzeProject, type ProjectAnalysis } from './project-analysis.js';

export interface FileHotspot {
  /** Path relative to root, POSIX separators. */
  path: string;
  /** Line count (capped read). */
  lines: number;
}

export interface CodeAnalysis {
  project: ProjectAnalysis;
  /** Source files per language extension, most frequent first. */
  languages: { ext: string; files: number }[];
  /** Busiest top-level directories (by recursive file count), most first. */
  busiestDirs: { name: string; fileCount: number }[];
  /** Largest source files by line count. */
  largestFiles: FileHotspot[];
  /** TODO/FIXME/HACK/XXX markers found across source files. */
  markers: { total: number; byKind: Record<string, number> };
  /** Whether the repo ships tests (heuristic) and how many test files. */
  tests: { present: boolean; files: number };
  /** forge agents suggested by the detected stack. */
  suggestedAgents: string[];
}

// Directories never worth descending into for code signals.
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  'vendor', 'target', '.venv', 'venv', '__pycache__', '.cache', '.turbo',
  '.svelte-kit', 'Pods', '.gradle', 'bin', 'obj', '.idea', '.vscode',
]);

// Source extensions we count and scan for markers/hotspots (without the dot).
const SOURCE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt',
  'php', 'cs', 'cpp', 'c', 'h', 'hpp', 'swift', 'dart', 'vue', 'svelte', 'scala',
]);

const MARKER_RE = /\b(TODO|FIXME|HACK|XXX)\b/g;
const TEST_HINT = /(\.|_|\b)(test|spec)(\.|_|\b)|(^|\/)(tests?|__tests__|spec)(\/|$)/i;

/** Walk source files under root (depth-capped, ignoring vendor/build dirs). */
function* walkSourceFiles(root: string, maxFiles = 6000): Generator<string> {
  let yielded = 0;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const entry of entries) {
      if (entry.startsWith('.') && entry !== '.github') continue;
      const full = join(dir, entry);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (!IGNORED_DIRS.has(entry)) stack.push(full);
      } else if (st.isFile()) {
        const ext = extname(entry).slice(1).toLowerCase();
        if (SOURCE_EXTS.has(ext)) {
          yield full;
          if (++yielded >= maxFiles) return;
        }
      }
    }
  }
}

/** Count lines without loading huge files fully into structures repeatedly. */
function countLines(path: string): number {
  try {
    const content = readFileSync(path, 'utf-8');
    if (content.length === 0) return 0;
    let n = 1;
    for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) === 10) n++;
    return n;
  } catch {
    return 0;
  }
}

/** Map a detected stack to the forge agents that best fit it. Deterministic. */
export function suggestAgents(p: ProjectAnalysis): string[] {
  const agents = new Set<string>(['orchestrator']);
  if (p.stack.backend) agents.add('backend-engineer');
  if (p.stack.frontend) agents.add('frontend-engineer');
  // Tests detected or a testing tool declared → test-engineer.
  if (p.stack.testing) agents.add('test-engineer');
  // Always useful for the onboarding deliverable.
  agents.add('docs-writer');
  agents.add('security-auditor');
  return [...agents];
}

export function analyzeCode(root: string): CodeAnalysis {
  const project = analyzeProject(root);

  const langCounts = new Map<string, number>();
  const fileLines: FileHotspot[] = [];
  const byKind: Record<string, number> = {};
  let markerTotal = 0;
  let testFiles = 0;

  for (const full of walkSourceFiles(root)) {
    const rel = relative(root, full).split('\\').join('/');
    const ext = extname(full).slice(1).toLowerCase();
    langCounts.set(ext, (langCounts.get(ext) ?? 0) + 1);

    if (TEST_HINT.test(rel)) testFiles++;

    const lines = countLines(full);
    fileLines.push({ path: rel, lines });

    // Marker scan (single read already done by countLines, re-read is cheap and
    // keeps this function simple; capped by walk's maxFiles).
    try {
      const content = readFileSync(full, 'utf-8');
      const matches = content.match(MARKER_RE);
      if (matches) {
        markerTotal += matches.length;
        for (const m of matches) byKind[m] = (byKind[m] ?? 0) + 1;
      }
    } catch { /* ignore unreadable */ }
  }

  // Sort deterministically: by count desc, then ext asc for ties.
  const languages = [...langCounts.entries()]
    .map(([ext, files]) => ({ ext, files }))
    .sort((a, b) => b.files - a.files || a.ext.localeCompare(b.ext));

  const busiestDirs = [...project.directories]
    .map(d => ({ name: d.name, fileCount: d.fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name))
    .slice(0, 8);

  const largestFiles = fileLines
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
    .slice(0, 10);

  return {
    project,
    languages,
    busiestDirs,
    largestFiles,
    markers: { total: markerTotal, byKind },
    tests: { present: testFiles > 0, files: testFiles },
    suggestedAgents: suggestAgents(project),
  };
}
