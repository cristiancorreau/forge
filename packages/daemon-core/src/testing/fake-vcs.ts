/** FakeVcs — shas secuenciales sha-1, sha-2, … (SPEC-076 § 6). */
import type { VcsPort } from '../ports/vcs.js';

export class FakeVcs implements VcsPort {
  readonly worktrees: Array<{ repoPath: string; branch: string; baseSha: string; worktreePath: string }> = [];
  readonly removed: string[] = [];
  readonly commits: Array<{ worktreePath: string; message: string; sha: string }> = [];
  dirty = false;
  private shaCounter = 0;

  private nextSha(): string {
    return `sha-${++this.shaCounter}`;
  }

  async currentSha(_repoPath: string): Promise<string> {
    return this.nextSha();
  }

  async createWorktree(repoPath: string, branch: string, baseSha: string): Promise<string> {
    const worktreePath = `${repoPath}/.worktrees/${branch.replace(/\//g, '-')}`;
    this.worktrees.push({ repoPath, branch, baseSha, worktreePath });
    return worktreePath;
  }

  async removeWorktree(_repoPath: string, worktreePath: string): Promise<void> {
    this.removed.push(worktreePath);
  }

  async commitWip(worktreePath: string, message: string): Promise<string> {
    const sha = this.nextSha();
    this.commits.push({ worktreePath, message, sha });
    return sha;
  }

  async isDirty(_worktreePath: string): Promise<boolean> {
    return this.dirty;
  }
}
