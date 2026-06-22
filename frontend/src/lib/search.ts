/**
 * Rank already-filtered matches so that items whose label STARTS WITH the
 * query come first, then substring-only matches — each group keeping its
 * original (typically alphabetical) order.
 *
 * This is the client-side mirror of the backend `prefix_ranked` helper. It
 * prevents a result cap (a `.slice(0, N)` dropdown) from burying prefix
 * matches: typing "D" matches every name containing a "d" anywhere, and
 * without ranking the cap fills with A/B/C names before any name beginning
 * with "D" is reached.
 *
 * `items` should already be filtered to the matching set. Pass one or more
 * label accessors; a row counts as a prefix match if ANY accessor starts with
 * the query. Slice the result afterwards.
 */
export function rankByPrefix<T>(
  items: T[],
  query: string,
  ...getLabels: Array<(item: T) => string | null | undefined>
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  const startsWithQuery = (item: T) =>
    getLabels.some((get) => (get(item) ?? '').toLowerCase().startsWith(q))
  // Array.prototype.sort is stable (ES2019+), so order within each rank group
  // is preserved.
  return [...items].sort(
    (a, b) => (startsWithQuery(a) ? 0 : 1) - (startsWithQuery(b) ? 0 : 1)
  )
}
