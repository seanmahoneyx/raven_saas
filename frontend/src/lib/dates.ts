/**
 * Parse a YYYY-MM-DD date string into a Date object without timezone shift.
 * Appends T00:00:00 to prevent UTC interpretation.
 */
export function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}
