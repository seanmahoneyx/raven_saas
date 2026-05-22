import { type AxiosInstance } from 'axios'

export interface DrfPaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

const DEFAULT_PAGE_SIZE = 200
const DEFAULT_MAX_PAGES = 50

/**
 * Extract the `page` query parameter from a DRF `next` URL.
 *
 * DRF returns fully-qualified URLs like `https://host/api/v1/items/?page=3&page_size=200`.
 * We parse the page number out and re-issue the request through the supplied axios
 * instance so the auth interceptor (and any baseURL/credentials config) still applies.
 *
 * Returns null if the URL has no `page` query parameter (i.e. it's the first page).
 */
function parseNextPage(nextUrl: string): number | null {
  try {
    // URL constructor needs an absolute URL; DRF always returns absolute next URLs,
    // but fall back to a synthetic base if a relative URL ever shows up.
    const url = nextUrl.startsWith('http')
      ? new URL(nextUrl)
      : new URL(nextUrl, 'http://localhost')
    const page = url.searchParams.get('page')
    if (!page) return null
    const parsed = parseInt(page, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

/**
 * Fetch ALL pages of a DRF-paginated endpoint, returning the flattened results array.
 *
 * Strategy:
 *   1. First request uses `page_size=200` to minimize round trips.
 *   2. While `data.next` is non-null, parse the `?page=N` out of it and re-issue
 *      `api.get(url, { params: { ...params, page_size: 200, page: N } })` so the
 *      configured axios interceptors (auth, token refresh) still run.
 *   3. Caps total pages at `opts?.maxPages ?? 50` (10,000 rows by default); throws
 *      a clear error if exceeded, so callers know they need server-side filtering.
 */
export async function fetchAllPages<T>(
  api: AxiosInstance,
  url: string,
  params?: Record<string, unknown>,
  opts?: { maxPages?: number }
): Promise<T[]> {
  const maxPages = opts?.maxPages ?? DEFAULT_MAX_PAGES
  const baseParams = { ...(params ?? {}), page_size: DEFAULT_PAGE_SIZE }

  const results: T[] = []
  let page = 1

  while (page <= maxPages) {
    const { data } = await api.get<DrfPaginatedResponse<T>>(url, {
      params: { ...baseParams, page },
    })
    if (Array.isArray(data?.results)) {
      results.push(...data.results)
    }
    if (!data?.next) {
      return results
    }
    const nextPage = parseNextPage(data.next)
    // If we can't parse a page number, assume the response is malformed and stop.
    if (nextPage === null || nextPage <= page) {
      return results
    }
    page = nextPage
  }

  throw new Error(
    `fetchAllPages: exceeded safety cap of ${maxPages} pages for ${url} ` +
      `(>${maxPages * DEFAULT_PAGE_SIZE} rows). Add server-side filtering or raise maxPages.`
  )
}
