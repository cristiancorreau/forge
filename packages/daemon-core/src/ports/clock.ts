/** ClockPort — determinismo en tests (SPEC-076 § 3). */
export interface ClockPort {
  nowIso(): string;
}
