/**
 * EventBus — eventos del dominio hacia UI y logs (SPEC-076 § 3).
 * Implementación: WebSocket/SSE broadcast (SPEC-082).
 */
import type { DomainEvent } from '../types.js';

export interface EventBus {
  publish(e: DomainEvent): void;
  subscribe(kinds: string[] | '*', handler: (e: DomainEvent) => void): () => void;
}
