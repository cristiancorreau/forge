/**
 * GitVcs — VcsPort sobre el git CLI (SPEC-077 § 3).
 * En Fase 1 solo `remoteUrl`; worktrees/commits llegan con SPEC-078.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { VcsPort } from '@cristiancorreau/forge-daemon-core';

const execFileAsync = promisify(execFile);

function notImplemented(method: string): never {
  throw new Error(`GitVcs.${method}: not implemented in phase 1 (SPEC-078)`);
}

export class GitVcs implements VcsPort {
  /** `git -C <path> config --get remote.origin.url`; null si falla (sin repo/remoto). */
  async remoteUrl(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        'git', ['-C', repoPath, 'config', '--get', 'remote.origin.url'],
        { timeout: 5000 },
      );
      const url = stdout.trim();
      return url === '' ? null : url;
    } catch {
      return null;
    }
  }

  async currentSha(_repoPath: string): Promise<string> { notImplemented('currentSha'); }
  async createWorktree(_repoPath: string, _branch: string, _baseSha: string): Promise<string> { notImplemented('createWorktree'); }
  async removeWorktree(_repoPath: string, _worktreePath: string): Promise<void> { notImplemented('removeWorktree'); }
  async commitWip(_worktreePath: string, _message: string): Promise<string> { notImplemented('commitWip'); }
  async isDirty(_worktreePath: string): Promise<boolean> { notImplemented('isDirty'); }
}
