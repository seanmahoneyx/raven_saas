import { useState, useMemo, useEffect } from 'react'
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query'
import type { SortingState } from '@tanstack/react-table'
import type { AxiosInstance } from 'axios'
import type { ServerTableConfig } from '@/components/ui/data-table'
import type { PaginatedResponse } from '@/types/api'

interface UseServerListOptions {
  /** React Query key prefix. The resolved request params are appended automatically.
   *  Keep the prefix aligned with realtime invalidation keys (e.g. ['sales-orders']). */
  queryKey: unknown[]
  endpoint: string
  api: AxiosInstance
  enabled?: boolean
  /** Static filters merged into every request (status, etc.). */
  filters?: Record<string, unknown>
  /** Map a TanStack column id → server `ordering` field. Columns absent from the map
   *  are not sortable server-side (give them `enableSorting: false` in the column def). */
  orderingMap?: Record<string, string>
  defaultPageSize?: number
}

/**
 * Drives a server-paginated list: debounced `?search=`, server `?ordering=`, and a
 * "Load more" cursor backed by React Query's useInfiniteQuery. Returns the flattened
 * rows plus a `server` object ready to hand to <DataTable server={...} />.
 *
 * See server-side-list-pattern in project memory. The Items list is the inline
 * reference; this hook is the shared extraction used by the Orders lists.
 */
export function useServerList<T>(opts: UseServerListOptions) {
  const { api, endpoint, queryKey, enabled = true, filters, orderingMap, defaultPageSize = 50 } = opts

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [pageSize, setPageSize] = useState(defaultPageSize)

  // Hit the server ~300ms after the user stops typing.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Map TanStack sort state → DRF `?ordering=` (single column; `-` prefix = descending).
  const ordering = useMemo(() => {
    if (!sorting.length) return undefined
    const s = sorting[0]
    const field = orderingMap ? orderingMap[s.id] : s.id
    if (!field) return undefined
    return s.desc ? `-${field}` : field
  }, [sorting, orderingMap])

  const filtersKey = JSON.stringify(filters ?? {})
  const baseParams = useMemo(
    () => ({
      ...(filters ?? {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(ordering ? { ordering } : {}),
    }),
    // filters compared by value (filtersKey) so a fresh object literal per render
    // doesn't churn the params.
    [filtersKey, debouncedSearch, ordering], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const query = useInfiniteQuery({
    queryKey: [...queryKey, { ...baseParams, page_size: pageSize }],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<PaginatedResponse<T>>(endpoint, {
        params: { ...baseParams, page_size: pageSize, page: pageParam },
      })
      return data
    },
    getNextPageParam: (lastPage, allPages) => (lastPage.next ? allPages.length + 1 : undefined),
    staleTime: 30_000,
    // Keep previous rows mounted while a new search/sort query loads. A changed query key
    // otherwise flips `isLoading` true (no cache for the new key), and callers that render a
    // skeleton on `isLoading` unmount the search input mid-typing — the box loses focus.
    placeholderData: keepPreviousData,
    enabled,
  })

  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.results) ?? [], [query.data])
  const totalCount = query.data?.pages[0]?.count ?? 0

  const server: ServerTableConfig = {
    searchValue: search,
    onSearchChange: setSearch,
    sorting,
    onSortingChange: setSorting,
    totalCount,
    hasMore: !!query.hasNextPage,
    onLoadMore: () => query.fetchNextPage(),
    isFetchingMore: query.isFetchingNextPage,
    pageSize,
    onPageSizeChange: setPageSize,
  }

  return {
    rows,
    totalCount,
    server,
    query,
    isLoading: query.isLoading,
    /** Filters+search (no pagination) for a click-time "fetch everything" export. */
    exportParams: baseParams as Record<string, unknown>,
  }
}
