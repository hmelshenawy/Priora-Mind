/**
 * IANA timezone validation (FR-009, data-model §6).
 *
 * Uses the runtime's own tz database via `Intl.supportedValuesOf('timeZone')`
 * (Node 18+ and modern browsers) — no external dependency or hand-maintained
 * list (Constitution XII: simplest sufficient design). The set is built once;
 * validation is a constant-time membership check.
 */

const SUPPORTED_TIMEZONES: ReadonlySet<string> = new Set([
  // Guard against environments without the API (older runtimes); fail closed by
  // returning an empty set (so any non-empty input is rejected) when unavailable.
  ...(typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
    ? (Intl.supportedValuesOf('timeZone') as string[])
    : []),
  // 'UTC' is a valid IANA tz-database name but is not always returned by
  // supportedValuesOf across runtimes; accept it explicitly.
  'UTC',
]);

/** True iff `tz` is a known IANA timezone name in the runtime's tz database. */
export function isValidIanaTimezone(tz: unknown): boolean {
  return typeof tz === 'string' && SUPPORTED_TIMEZONES.has(tz);
}