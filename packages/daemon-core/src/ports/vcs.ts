/**
 * VcsPort — git: worktrees, checkpoints, commits WIP (SPEC-076 § 3).
 * Implementación: git CLI (SPEC-078).
 */
export interface VcsPort {
  currentSha(repoPath: string): Promise<string>;
  createWorktree(repoPath: string, branch: string, baseSha: string): Promise<string>; // worktreePath
  removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
  commitWip(worktreePath: string, message: string): Promise<string>;                  // sha
  isDirty(worktreePath: string): Promise<boolean>;
  /** URL del remoto origin, o null si no hay repo/remoto (extensión aditiva, SPEC-077 § 2). */
  remoteUrl(repoPath: string): Promise<string | null>;
}
