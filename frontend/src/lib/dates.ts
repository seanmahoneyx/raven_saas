/**
 * Parse a YYYY-MM-DD date string into a Date object without timezone shift.
 * Appends T00:00:00 to prevent UTC interpretation.
 */
export function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

/**
 * Format a Date as YYYY-MM-DD in the **local** timezone.
 *
 * This is the local-TZ counterpart to `date.toISOString().slice(0, 10)`, which
 * uses UTC and silently shifts the day in negative-UTC zones during evening
 * hours. Use this whenever you need a date string that represents "today"
 * (or any local calendar day) for the user.
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Today's date as a local YYYY-MM-DD string. */
export function todayLocal(): string {
  return formatLocalDate(new Date())
}
