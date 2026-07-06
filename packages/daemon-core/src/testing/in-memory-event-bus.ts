/** InMemoryEventBus — entrega síncrona + array published (SPEC-076 § 6). */
import type { EventBus } from '../ports/event-bus.js';
import type { DomainEvent } from '../types.js';

export class InMemoryEventBus implements EventBus {
  readonly published: DomainEvent[] = [];
  private readonly subscribers: Array<{ kinds: string[] | '*'; handler: (e: DomainEvent) => void }> = [];

  publish(e: DomainEvent): void {
    this.published.push(e);
    for (const sub of this.subscribers) {
      if (sub.kinds === '*' || sub.kinds.includes(e.kind)) sub.handler(e);
    }
  }

  subscribe(kinds: string[] | '*', handler: (e: DomainEvent) => void): () => void {
    const sub = { kinds, handler };
    this.subscribers.push(sub);
    return () => {
      const i = this.subscribers.indexOf(sub);
      if (i >= 0) this.subscribers.splice(i, 1);
    };
  }
}
