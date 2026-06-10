/**
 * Shared list-sorting helpers.
 */

/**
 * Comparator that floats favorited rows to the top while preserving the
 * existing relative order of everything else (stable "favorites first").
 *
 * Usage: `rows.sort((a, b) => byFavoriteThenOther(a, b, favoriteIds))`
 */
export function byFavoriteThenOther<T extends { id: number }>(
  a: T,
  b: T,
  favoriteIds: Set<number>,
): number {
  const aFav = favoriteIds.has(a.id) ? 0 : 1
  const bFav = favoriteIds.has(b.id) ? 0 : 1
  return aFav - bFav
}
