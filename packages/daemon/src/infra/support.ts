/**
 * Adaptadores triviales de puertos de determinismo (ClockPort, IdPort,
 * EventBus) para producción — SPEC-077. Los fakes de tests viven en
 * @cristiancorreau/forge-daemon-core/testing.
 */
import { randomBytes } from 'node:crypto';
import type { ClockPort, IdPort, EventBus, DomainEvent } from '@cristiancorreau/forge-daemon-core';

export class SystemClock implements ClockPort {
  nowIso(): string {
    return new Date().toISOString();
  }
}

/** Alfabeto Crockford base32 (sin I, L, O, U) — patrón forgeId de SPEC-075. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID: 10 chars de timestamp (ms) + 16 chars aleatorios = 26 chars. */
function ulid(now: number = Date.now()): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32];
  return time + rand;
}

/** IdPort con prefijo de entidad: prj_<ULID>, tsk_<ULID>, … */
export class ForgeIds implements IdPort {
  constructor(private readonly prefix: string = 'prj') {}

  newId(): string {
    return `${this.prefix}_${ulid()}`;
  }
}

/** EventBus in-process con entrega síncrona (un solo proceso daemon/CLI). */
export class LocalEventBus implements EventBus {
  private readonly subscribers: Array<{ kinds: string[] | '*'; handler: (e: DomainEvent) => void }> = [];

  publish(e: DomainEvent): void {
    for (const sub of [...this.subscribers]) {
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
