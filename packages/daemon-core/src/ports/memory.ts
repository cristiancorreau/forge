/**
 * MemoryPort — vault .md (SPEC-076 § 3).
 * Implementación: filesystem + FTS5 (SPEC-080).
 */
export interface MemoryPort {
  read(ref: string): Promise<{ ref: string; frontmatter: Record<string, unknown>; body: string } | null>;
  write(note: { ref: string; frontmatter: Record<string, unknown>; body: string }): Promise<void>;
  query(q: { text?: string; tags?: string[]; limit?: number }): Promise<string[]>;  // refs
  backlinks(ref: string): Promise<string[]>;
}
