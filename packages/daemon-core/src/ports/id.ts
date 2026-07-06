/** IdPort — generación de ids (prefijo de entidad + ULID en producción; SPEC-076 § 3). */
export interface IdPort {
  newId(): string;
}
