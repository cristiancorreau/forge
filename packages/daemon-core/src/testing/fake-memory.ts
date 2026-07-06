/** FakeMemory — Map simple de notas (SPEC-076 § 6). */
import type { MemoryPort } from '../ports/memory.js';

type Note = { ref: string; frontmatter: Record<string, unknown>; body: string };

export class FakeMemory implements MemoryPort {
  readonly notes = new Map<string, Note>();

  async read(ref: string): Promise<Note | null> {
    const note = this.notes.get(ref);
    return note ? structuredClone(note) : null;
  }

  async write(note: Note): Promise<void> {
    this.notes.set(note.ref, structuredClone(note));
  }

  async query(q: { text?: string; tags?: string[]; limit?: number }): Promise<string[]> {
    let refs = [...this.notes.values()]
      .filter((n) => (q.text ? n.body.includes(q.text) : true))
      .filter((n) => {
        if (!q.tags?.length) return true;
        const tags = Array.isArray(n.frontmatter.tags) ? n.frontmatter.tags : [];
        return q.tags.every((t) => tags.includes(t));
      })
      .map((n) => n.ref);
    if (q.limit !== undefined) refs = refs.slice(0, q.limit);
    return refs;
  }

  async backlinks(ref: string): Promise<string[]> {
    return [...this.notes.values()]
      .filter((n) => n.body.includes(`[[${ref}]]`))
      .map((n) => n.ref);
  }
}
