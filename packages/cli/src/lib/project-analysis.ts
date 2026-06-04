/**
 * Static project analysis for `forge adopt` (brownfield onboarding).
 *
 * `analyzeProject(root)` reads an EXISTING codebase and derives, with NO LLM and
 * NO execution, a structured `ProjectAnalysis`: name/description, the detected
 * stack (reusing lib/detect.ts), top dependencies, scripts, a top-level
 * directory map, the key files present, rough entrypoints, git remote/branch and
 * the derived project type.
 *
 * Hard rule: this module NEVER throws on a real project tree. Every file read is
 * guarded and degrades to a partial result. The output is FACTUAL — it only
 * reports what was found on disk; it never invents behaviour. The semantic layer
 * (business logic, architecture decisions) is the job of the /wiki-ingest skill.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { detectStack, type DetectedStack } from './detect.js';
import { inferProjectType, type ProjectType } from './wizard-flow.js';

export interface DirEntry {
  /** Directory name relative to the project root (top-level only). */
  name: string;
  /** Total file count under the directory (recursive, capped). */
  fileCount: number;
  /** Most common file extensions inside (without the dot), most frequent first. */
  dominantExtensions: string[];
}

export interface KeyFile {
  /** Path relative to the project root, POSIX separators. */
  path: string;
  /** Coarse classification used by the wiki generator. */
  kind: 'readme' | 'manifest' | 'dockerfile' | 'ci' | 'env-example' | 'config';
}

export interface DependencyInfo {
  name: string;
  /** Declared version range as found in the manifest (best-effort). */
  version: string;
  dev: boolean;
}

export interface GitInfo {
  remote: string | null;
  branch: string | null;
}

export interface ProjectAnalysis {
  root: string;
  name: string;
  description: string;
  /** Primary manifest path (relative, POSIX) that named the project, if any. */
  manifest: string | null;
  /** Manifest ecosystem: npm | python | php | ruby | go | rust | jvm | dart | unknown. */
  ecosystem: 'npm' | 'python' | 'php' | 'ruby' | 'go' | 'rust' | 'jvm' | 'dart' | 'unknown';
  stack: DetectedStack;
  type: ProjectType;
  dependencies: DependencyInfo[];
  scripts: Record<string, string>;
  directories: DirEntry[];
  keyFiles: KeyFile[];
  /** Rough entrypoints found (main/bin/index/app), relative POSIX paths. */
  entrypoints: string[];
  git: GitInfo;
}

/** Read+parse JSON, swallowing every error (missing/invalid → null). */
function readJson(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Read a text file, swallowing every error (missing/unreadable → null). */
function readText(path: string): string | null {
  try {
    if (!existsSync(path) || !statSync(path).isFile()) return null;
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/** Naive single-line value extractor for simple TOML/YAML-ish manifests. */
function extractField(content: string, key: string): string | null {
  // Matches `key = "value"`, `key = 'value'`, `key: value`, `key: "value"`.
  const re = new RegExp(`^\\s*${key}\\s*[:=]\\s*["']?([^"'\\n#]+?)["']?\\s*$`, 'm');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

interface NameDesc {
  name: string | null;
  description: string | null;
  manifest: string | null;
  ecosystem: ProjectAnalysis['ecosystem'];
}

/**
 * Resolve the project name + description from the primary manifest, trying the
 * common ecosystems in order. The first that yields a name wins.
 */
function resolveNameDescription(root: string): NameDesc {
  // npm
  const pkg = readJson(join(root, 'package.json'));
  if (pkg && typeof pkg.name === 'string') {
    return {
      name: pkg.name,
      description: typeof pkg.description === 'string' ? pkg.description : null,
      manifest: 'package.json',
      ecosystem: 'npm',
    };
  }

  // python (pyproject.toml — [project] or [tool.poetry])
  const pyproject = readText(join(root, 'pyproject.toml'));
  if (pyproject) {
    const name = extractField(pyproject, 'name');
    const description = extractField(pyproject, 'description');
    if (name) return { name, description, manifest: 'pyproject.toml', ecosystem: 'python' };
  }

  // php (composer.json)
  const composer = readJson(join(root, 'composer.json'));
  if (composer && typeof composer.name === 'string') {
    return {
      name: composer.name,
      description: typeof composer.description === 'string' ? composer.description : null,
      manifest: 'composer.json',
      ecosystem: 'php',
    };
  }

  // go (go.mod — `module example.com/foo`)
  const goMod = readText(join(root, 'go.mod'));
  if (goMod) {
    const m = goMod.match(/^module\s+(\S+)/m);
    if (m) return { name: m[1], description: null, manifest: 'go.mod', ecosystem: 'go' };
  }

  // rust (Cargo.toml — [package] name/description)
  const cargo = readText(join(root, 'Cargo.toml'));
  if (cargo) {
    const name = extractField(cargo, 'name');
    const description = extractField(cargo, 'description');
    return { name, description, manifest: 'Cargo.toml', ecosystem: 'rust' };
  }

  // dart / flutter (pubspec.yaml — name/description)
  const pubspec = readText(join(root, 'pubspec.yaml'));
  if (pubspec) {
    const name = extractField(pubspec, 'name');
    const description = extractField(pubspec, 'description');
    return { name, description, manifest: 'pubspec.yaml', ecosystem: 'dart' };
  }

  // jvm (Spring Boot etc.) — pom.xml <artifactId> or a gradle build file.
  const pom = readText(join(root, 'pom.xml'));
  if (pom) {
    // The project's own <artifactId> lives outside the <parent> block. Strip the
    // <parent>…</parent> section first so we don't pick the parent's artifactId
    // (e.g. spring-boot-starter-parent).
    const own = pom.replace(/<parent>[\s\S]*?<\/parent>/, '');
    const m = own.match(/<artifactId>([^<]+)<\/artifactId>/)
      ?? pom.match(/<artifactId>([^<]+)<\/artifactId>/);
    const nameTag = pom.match(/<name>([^<]+)<\/name>/);
    return {
      name: nameTag ? nameTag[1].trim() : (m ? m[1].trim() : null),
      description: null, manifest: 'pom.xml', ecosystem: 'jvm',
    };
  }
  if (existsSync(join(root, 'build.gradle.kts')) || existsSync(join(root, 'build.gradle'))) {
    const manifest = existsSync(join(root, 'build.gradle.kts')) ? 'build.gradle.kts' : 'build.gradle';
    return { name: null, description: null, manifest, ecosystem: 'jvm' };
  }

  // ruby (Gemfile has no name; *.gemspec might — fall back to the dir name).
  if (existsSync(join(root, 'Gemfile'))) {
    return { name: null, description: null, manifest: 'Gemfile', ecosystem: 'ruby' };
  }

  // python without name in pyproject, or requirements.txt only.
  if (pyproject || existsSync(join(root, 'requirements.txt'))) {
    return {
      name: null, description: null,
      manifest: pyproject ? 'pyproject.toml' : 'requirements.txt',
      ecosystem: 'python',
    };
  }

  return { name: null, description: null, manifest: null, ecosystem: 'unknown' };
}

/** Top dependencies (capped) from package.json or composer.json. */
function resolveDependencies(root: string, ecosystem: ProjectAnalysis['ecosystem'], limit = 12): DependencyInfo[] {
  const out: DependencyInfo[] = [];
  const add = (obj: unknown, dev: boolean): void => {
    if (!obj || typeof obj !== 'object') return;
    for (const [name, version] of Object.entries(obj as Record<string, unknown>)) {
      out.push({ name, version: typeof version === 'string' ? version : '*', dev });
    }
  };

  if (ecosystem === 'npm') {
    const pkg = readJson(join(root, 'package.json'));
    if (pkg) { add(pkg.dependencies, false); add(pkg.devDependencies, true); }
  } else if (ecosystem === 'php') {
    const composer = readJson(join(root, 'composer.json'));
    if (composer) { add(composer.require, false); add(composer['require-dev'], true); }
  }
  // Runtime (non-dev) deps first, then dev; cap the list.
  out.sort((a, b) => (a.dev === b.dev ? 0 : a.dev ? 1 : -1));
  return out.slice(0, limit);
}

/** npm scripts (best-effort) from package.json. */
function resolveScripts(root: string, ecosystem: ProjectAnalysis['ecosystem']): Record<string, string> {
  if (ecosystem !== 'npm') return {};
  const pkg = readJson(join(root, 'package.json'));
  const scripts = pkg?.scripts;
  if (!scripts || typeof scripts !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/** Directory names we never descend into when counting files. */
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build',
  '.next', '.nuxt', '.svelte-kit', 'vendor', '.turbo', 'coverage', '.cache',
  '.forge', '.idea', '.vscode', 'target',
]);

/** Recursively count files + tally extensions under `dir` (capped for speed). */
function scanDir(dir: string, cap = 5000): { count: number; exts: Map<string, number> } {
  const exts = new Map<string, number>();
  let count = 0;
  const walk = (d: string): void => {
    if (count >= cap) return;
    let entries: import('fs').Dirent[];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (count >= cap) return;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(join(d, e.name));
      } else if (e.isFile()) {
        count++;
        const dot = e.name.lastIndexOf('.');
        const ext = dot > 0 ? e.name.slice(dot + 1).toLowerCase() : '';
        if (ext && ext.length <= 8) exts.set(ext, (exts.get(ext) ?? 0) + 1);
      }
    }
  };
  walk(dir);
  return { count, exts };
}

/** Build the top-level directory map (skips hidden + noise dirs). */
function resolveDirectories(root: string): DirEntry[] {
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs: DirEntry[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const { count, exts } = scanDir(join(root, e.name));
    const dominant = [...exts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ext]) => ext);
    dirs.push({ name: e.name, fileCount: count, dominantExtensions: dominant });
  }
  dirs.sort((a, b) => b.fileCount - a.fileCount);
  return dirs;
}

/** Candidate key files, in a stable order, keyed by their classification. */
const KEY_FILE_SPECS: Array<{ file: string; kind: KeyFile['kind'] }> = [
  { file: 'README.md', kind: 'readme' },
  { file: 'README.rst', kind: 'readme' },
  { file: 'README.txt', kind: 'readme' },
  { file: 'package.json', kind: 'manifest' },
  { file: 'pyproject.toml', kind: 'manifest' },
  { file: 'requirements.txt', kind: 'manifest' },
  { file: 'composer.json', kind: 'manifest' },
  { file: 'Gemfile', kind: 'manifest' },
  { file: 'go.mod', kind: 'manifest' },
  { file: 'Cargo.toml', kind: 'manifest' },
  { file: 'pubspec.yaml', kind: 'manifest' },
  { file: 'pom.xml', kind: 'manifest' },
  { file: 'build.gradle', kind: 'manifest' },
  { file: 'build.gradle.kts', kind: 'manifest' },
  { file: 'Dockerfile', kind: 'dockerfile' },
  { file: 'docker-compose.yml', kind: 'dockerfile' },
  { file: '.env.example', kind: 'env-example' },
  { file: 'tsconfig.json', kind: 'config' },
  { file: 'turbo.json', kind: 'config' },
  { file: 'pnpm-workspace.yaml', kind: 'config' },
];

/** CI config files (presence only). */
const CI_FILES = [
  '.github/workflows',
  '.gitlab-ci.yml',
  '.circleci/config.yml',
  'azure-pipelines.yml',
];

function resolveKeyFiles(root: string): KeyFile[] {
  const out: KeyFile[] = [];
  let readmeSeen = false;
  for (const { file, kind } of KEY_FILE_SPECS) {
    // Only the first README variant is recorded as the canonical README.
    if (kind === 'readme' && readmeSeen) continue;
    if (existsSync(join(root, file))) {
      out.push({ path: file, kind });
      if (kind === 'readme') readmeSeen = true;
    }
  }
  for (const ci of CI_FILES) {
    if (existsSync(join(root, ci))) { out.push({ path: ci, kind: 'ci' }); break; }
  }
  return out;
}

/** Rough entrypoints: package.json main/bin + conventional source entry files. */
function resolveEntrypoints(root: string, ecosystem: ProjectAnalysis['ecosystem']): string[] {
  const found = new Set<string>();

  if (ecosystem === 'npm') {
    const pkg = readJson(join(root, 'package.json'));
    if (pkg) {
      if (typeof pkg.main === 'string') found.add(pkg.main);
      if (typeof pkg.module === 'string') found.add(pkg.module);
      const bin = pkg.bin;
      if (typeof bin === 'string') found.add(bin);
      else if (bin && typeof bin === 'object') {
        for (const v of Object.values(bin as Record<string, unknown>)) {
          if (typeof v === 'string') found.add(v);
        }
      }
    }
  }

  // Conventional source entries (presence on disk).
  const candidates = [
    'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
    'src/app.ts', 'src/app.js', 'index.ts', 'index.js', 'main.go',
    'app/main.py', 'main.py', 'app.py', 'manage.py', 'src/main.py',
    'cmd/main.go', 'config/application.rb',
    'src/main.rs', 'src/lib.rs',                       // rust
    'lib/main.dart',                                   // flutter / dart
    'app.json', 'App.tsx', 'App.js', 'index.js',       // react-native / expo
  ];
  for (const c of candidates) {
    if (existsSync(join(root, c))) found.add(c.split('\\').join('/'));
  }

  return [...found].map(p => p.split('\\').join('/')).slice(0, 8);
}

/** Read git remote + branch from .git/ without spawning git (best-effort). */
function resolveGit(root: string): GitInfo {
  const gitDir = join(root, '.git');
  const info: GitInfo = { remote: null, branch: null };
  if (!existsSync(gitDir)) return info;

  const config = readText(join(gitDir, 'config'));
  if (config) {
    // The first remote "url = ..." entry.
    const m = config.match(/\[remote [^\]]+\][^[]*?url\s*=\s*(\S+)/);
    if (m) info.remote = m[1];
  }

  const head = readText(join(gitDir, 'HEAD'));
  if (head) {
    const m = head.match(/ref:\s*refs\/heads\/(\S+)/);
    if (m) info.branch = m[1];
    else if (/^[0-9a-f]{7,40}\s*$/.test(head.trim())) info.branch = 'detached';
  }

  return info;
}

/**
 * Analyze an existing project at `root`. Pure (no LLM, no process spawning) and
 * total: it never throws — missing/unreadable files degrade to partial output.
 */
export function analyzeProject(root: string): ProjectAnalysis {
  const stack = (() => {
    try { return detectStack(root); }
    catch {
      return {
        language: null, backendLanguage: null, frontendLanguage: null, mobileLanguage: null,
        projectType: null,
        backend: null, frontend: null, mobile: null,
        database: null, orm: null, packageManager: null,
        testing: [], hasDocker: false, isMonorepo: false,
      } as DetectedStack;
    }
  })();

  const nd = resolveNameDescription(root);
  const name = nd.name ?? basename(root) ?? 'project';
  const description = nd.description ?? '';

  // Project type: prefer the stack's inference; fall back to the framework-based
  // inference so a bare repo still gets a sensible (backend) default.
  const type: ProjectType = stack.projectType
    ?? inferProjectType({ backend: stack.backend, frontend: stack.frontend, mobile: stack.mobile });

  return {
    root,
    name,
    description,
    manifest: nd.manifest,
    ecosystem: nd.ecosystem,
    stack,
    type,
    dependencies: resolveDependencies(root, nd.ecosystem),
    scripts: resolveScripts(root, nd.ecosystem),
    directories: resolveDirectories(root),
    keyFiles: resolveKeyFiles(root),
    entrypoints: resolveEntrypoints(root, nd.ecosystem),
    git: resolveGit(root),
  };
}

/** URL-safe slug from a project name (mirrors the wizard's toSlug). */
export function slugify(name: string): string {
  return name.toLowerCase()
    // npm scoped names: @scope/pkg → scope-pkg
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}
