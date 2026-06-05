import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { findProjectYaml, projectRoot } from '../lib/yaml.js';
import { resolveForgeRoot } from '../lib/paths.js';
import { loadManifest, saveManifest, sha256file, type ForgeManifest } from '../lib/lock.js';
import { listCatalogAgents } from '../lib/catalog.js';
import { VERSION } from '../version.js';
import { dim } from '../ui/colors.js';

const HELP = `Usage: forge update [options]

Update forge-managed files in the current project to the bundled catalog version.
Reads .forge/manifest.json, and for each managed file compares the on-disk hash
(did you edit it?) against the install-time hash and the current catalog source.

  - Files you did NOT modify are updated when the catalog source differs.
  - Files you modified are SKIPPED with a warning (use --force to overwrite).
  - Generated files (CLAUDE.md, settings.json, architecture.rules) and files
    without a 1:1 catalog source are never touched.
  - The manifest is rewritten with the new install-time hashes for updated files.

Options:
  --dry-run   Show the plan without writing any files
  --force     Overwrite user-modified files too
  -h, --help  Show this help
`;

/**
 * Files that forge GENERATES (not copied 1:1 from a catalog asset). They have no
 * single source file to diff against, so `forge update` never touches them.
 */
const GENERATED_FILES = new Set([
  'CLAUDE.md',
  '.claude/settings.json',
  '.claude/architecture.rules',
  'AGENTS.md',
]);

/**
 * Maps a managed file's project-relative path (as stored in the manifest) to its
 * source path inside the forge catalog (forgeRoot). Returns null when the file is
 * generated or has no 1:1 catalog source (e.g. a Tier 3 project-specific agent
 * that doesn't live in core/agents/ or any profile's agents/ dir).
 *
 * Mapping:
 *   .claude/hooks/<f>      -> core/hooks/<f>
 *   .claude/commands/<...> -> adapters/claude-code/commands/<...>
 *   .claude/agents/<f>.md  -> core/agents/<f>.md  OR a profile's agents/ dir
 */
export function resolveCatalogSource(relPath: string, forgeRoot: string): string | null {
  const norm = relPath.split('\\').join('/');
  if (GENERATED_FILES.has(norm)) return null;

  if (norm.startsWith('.claude/hooks/')) {
    const rest = norm.slice('.claude/hooks/'.length);
    return join(forgeRoot, 'core', 'hooks', rest);
  }

  if (norm.startsWith('.claude/commands/')) {
    const rest = norm.slice('.claude/commands/'.length);
    return join(forgeRoot, 'adapters', 'claude-code', 'commands', rest);
  }

  if (norm.startsWith('.claude/agents/')) {
    const file = norm.slice('.claude/agents/'.length);
    const coreSrc = join(forgeRoot, 'core', 'agents', file);
    if (existsSync(coreSrc)) return coreSrc;
    // Search every profile's agents/ dir for a matching agent file.
    const { profiles } = listCatalogAgents(forgeRoot);
    const agentId = file.replace(/\.md$/, '');
    for (const [profile, agents] of Object.entries(profiles)) {
      if (agents.includes(agentId)) {
        return join(forgeRoot, 'profiles', profile, 'agents', file);
      }
    }
    // Source not found in the catalog (Tier 3 / removed agent) → not managed.
    return null;
  }

  return null;
}

interface UpdatePlanEntry {
  /** project-relative path */
  file: string;
  /** absolute catalog source path */
  source: string;
  /** 'update' (unmodified, catalog differs), 'modified' (user edited), 'missing' (deleted on disk) */
  kind: 'update' | 'modified' | 'missing';
}

/**
 * Computes the update plan from a manifest. For each managed file with a catalog
 * source it decides whether the file would be updated, is user-modified, or is
 * missing on disk. Files in sync (disk == manifest == catalog) are omitted.
 */
export function computeUpdatePlan(
  manifest: ForgeManifest,
  projRoot: string,
  forgeRoot: string,
): UpdatePlanEntry[] {
  const plan: UpdatePlanEntry[] = [];
  for (const [file, entry] of Object.entries(manifest.files)) {
    const source = resolveCatalogSource(file, forgeRoot);
    if (!source || !existsSync(source)) continue; // no catalog source → not managed by update

    const catalogHash = sha256file(source);
    const abs = join(projRoot, file);

    if (!existsSync(abs)) {
      // File was deleted by the user — restore it from the catalog.
      plan.push({ file, source, kind: 'missing' });
      continue;
    }

    const diskHash = sha256file(abs);
    const userModified = diskHash !== entry.sha256;

    if (catalogHash === diskHash) continue; // already at the catalog version

    if (userModified) {
      plan.push({ file, source, kind: 'modified' });
    } else {
      plan.push({ file, source, kind: 'update' });
    }
  }
  return plan;
}

export async function update(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  const projectYamlPath = findProjectYaml(process.cwd());
  if (!projectYamlPath) {
    console.error('ERROR: No se encontró project.yaml. Ejecutá `forge init` primero.');
    return 1;
  }
  const projRoot = projectRoot(projectYamlPath);

  const manifest = loadManifest(projRoot);
  if (!manifest) {
    console.error('ERROR: No se encontró .forge/manifest.json. ¿Está forge instalado en este proyecto?');
    return 1;
  }

  let forgeRoot: string;
  try {
    forgeRoot = resolveForgeRoot();
  } catch (e: unknown) {
    console.error(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const plan = computeUpdatePlan(manifest, projRoot, forgeRoot);

  const toUpdate = plan.filter(p => p.kind === 'update' || p.kind === 'missing');
  const modified = plan.filter(p => p.kind === 'modified');
  // With --force, user-modified files are updated too.
  const willWrite = force ? [...toUpdate, ...modified] : toUpdate;
  const willSkip = force ? [] : modified;

  console.log(`forge update — catálogo v${VERSION} (manifest instalado: v${manifest.forgeVersion})\n`);

  if (plan.length === 0) {
    console.log('Todo al día — no hay archivos gestionados para actualizar.');
    return 0;
  }

  if (willWrite.length > 0) {
    console.log(`${dryRun ? 'Se actualizarían' : 'Actualizando'} ${willWrite.length} archivo(s):`);
    for (const p of willWrite) {
      const tag = p.kind === 'missing' ? ' (restaurar)' : p.kind === 'modified' ? ' (--force, sobrescribe edición)' : '';
      console.log(`  [UPD] ${p.file}${dim(tag)}`);
    }
  }
  if (willSkip.length > 0) {
    console.log(`\nSaltando ${willSkip.length} archivo(s) modificado(s) por el usuario (usá --force para sobrescribir):`);
    for (const p of willSkip) {
      console.log(`  [SKIP] ${p.file}`);
    }
  }

  if (dryRun) {
    console.log('\n' + dim('Dry-run: no se escribió nada. Ejecutá sin --dry-run para aplicar.'));
    return 0;
  }

  // Apply updates and refresh the manifest entries for the written files.
  const ts = new Date().toISOString();
  for (const p of willWrite) {
    const abs = join(projRoot, p.file);
    mkdirSync(dirname(abs), { recursive: true });
    copyFileSync(p.source, abs);
    manifest.files[p.file] = { sha256: sha256file(abs), installedAt: ts };
  }

  if (willWrite.length > 0) {
    manifest.forgeVersion = VERSION;
    saveManifest(projRoot, manifest);
    console.log(`\nOK — ${willWrite.length} archivo(s) actualizado(s). Manifest → v${VERSION}.`);
  } else {
    console.log('\nNada para escribir.');
  }

  return 0;
}
