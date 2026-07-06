/** FakeClock — nowIso() fijo + advance(ms) (SPEC-076 § 6). */
import type { ClockPort } from '../ports/clock.js';

export class FakeClock implements ClockPort {
  private epochMs: number;

  constructor(startIso: string = '2026-01-01T00:00:00.000Z') {
    this.epochMs = Date.parse(startIso);
  }

  nowIso(): string {
    return new Date(this.epochMs).toISOString();
  }

  advance(ms: number): void {
    this.epochMs += ms;
  }
}
