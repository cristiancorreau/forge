/**
 * Tipos de entidades del dominio — re-export puro del contrato neutral
 * (@cristiancorreau/forge-schemas, SPEC-075). Única dependencia permitida.
 */
export * from '@cristiancorreau/forge-schemas';

import type { Event } from '@cristiancorreau/forge-schemas';

/**
 * Evento del dominio tal como lo produce un caso de uso: `Event` cuyo `id`
 * (rowid append-only) todavía no fue asignado por el store.
 */
export type DomainEvent = Omit<Event, 'id'> & { id?: number };
