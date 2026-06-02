import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';

export interface ForgeManifest {
  forgeVersion: string;
  runtime: string;
  installedAt: string;
  files: Record<string, { sha256: string; installedAt: string }>;
}

const MANIFEST_PATH = '.forge/manifest.json';

export function loadManifest(projectRoot: string): ForgeManifest | null {
  const path = join(projectRoot, MANIFEST_PATH);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')) as ForgeManifest; }
  catch { return null; }
}

export function saveManifest(projectRoot: string, manifest: ForgeManifest): void {
  const path = join(projectRoot, MANIFEST_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf-8');
}

export function sha256file(absPath: string): string {
  const content = readFileSync(absPath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

export function buildManifest(
  runtime: string,
  files: string[],
  projectRoot: string,
  forgeVersion: string,
  timestamp: string,
): ForgeManifest {
  const fileEntries: ForgeManifest['files'] = {};
  for (const file of files) {
    const absPath = join(projectRoot, file);
    if (existsSync(absPath)) {
      fileEntries[file] = { sha256: sha256file(absPath), installedAt: timestamp };
    }
  }
  return { forgeVersion, runtime, installedAt: timestamp, files: fileEntries };
}

export function checkOutdated(projectRoot: string, manifest: ForgeManifest): string[] {
  const outdated: string[] = [];
  for (const [file, entry] of Object.entries(manifest.files)) {
    const absPath = join(projectRoot, file);
    if (!existsSync(absPath)) { outdated.push(file + ' (eliminado)'); continue; }
    if (sha256file(absPath) !== entry.sha256) outdated.push(file);
  }
  return outdated;
}
