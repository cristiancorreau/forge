/** SeqIds — ids secuenciales deterministas: id-0001, id-0002, … (SPEC-076 § 6). */
import type { IdPort } from '../ports/id.js';

export class SeqIds implements IdPort {
  private counter = 0;

  constructor(private readonly prefix: string = 'id') {}

  newId(): string {
    return `${this.prefix}-${String(++this.counter).padStart(4, '0')}`;
  }
}
