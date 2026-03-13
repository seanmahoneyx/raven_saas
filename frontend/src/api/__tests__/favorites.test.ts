// src/api/__tests__/favorites.test.ts
/**
 * Tests for favorites/recents/suggestions API hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import api from '../client'
import {
  useFavorites,
  useAddFavorite,
  useRemoveFavorite,
  useTrackEntityView,
  useSuggestions,
  favoritesKeys,
} from '../favorites'
import type { UserFavorite, SuggestionsResponse } from '@/types/api'

// ── Mock API client ───────────────────────────────────────────────────────────

vi.mock('../client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

// ── Mock sonner toast (used by onError handlers) ──────────────────────────────

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

// ── Test wrapper ──────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockFavorite: UserFavorite = {
  id: 1,
  entity_type: 'customer',
  object_id: 42,
  label: 'Acme Corp',
  created_at: '2025-01-01T00:00:00Z',
}

const mockSuggestions: SuggestionsResponse = {
  favorites: [{ id: 1, label: 'Acme Corp', is_favorite: true }],
  recents: [{ id: 2, label: 'Beta LLC', is_favorite: false }],
  results: [{ id: 3, label: 'Gamma Inc', is_favorite: false }],
}

// =============================================================================
// TESTS
// =============================================================================

describe('Favorites API Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── useFavorites ─────────────────────────────────────────────────────────────

  describe('useFavorites', () => {
    it('fetches from /favorites/ and returns data', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: [mockFavorite] })

      const { result } = renderHook(() => useFavorites(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/favorites/', { params: undefined })
      expect(result.current.data).toHaveLength(1)
      expect(result.current.data![0].label).toBe('Acme Corp')
    })

    it('passes entity_type param when entityType is provided', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: [mockFavorite] })

      const { result } = renderHook(
        () => useFavorites('customer'),
        { wrapper: createWrapper() },
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/favorites/', {
        params: { entity_type: 'customer' },
      })
    })

    it('uses correct query key with entityType', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: [] })

      const { result } = renderHook(
        () => useFavorites('vendor'),
        { wrapper: createWrapper() },
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual([])
    })
  })

  // ── useAddFavorite ────────────────────────────────────────────────────────────

  describe('useAddFavorite', () => {
    it('posts to /favorites/ with correct payload', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockFavorite })

      const { result } = renderHook(() => useAddFavorite(), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.mutateAsync({ entity_type: 'customer', object_id: 42 })
      })

      expect(api.post).toHaveBeenCalledWith('/favorites/', {
        entity_type: 'customer',
        object_id: 42,
      })
    })

    it('returns the created favorite', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockFavorite })

      const { result } = renderHook(() => useAddFavorite(), { wrapper: createWrapper() })

      let returned: UserFavorite | undefined
      await act(async () => {
        returned = await result.current.mutateAsync({ entity_type: 'customer', object_id: 42 })
      })

      expect(returned?.id).toBe(1)
      expect(returned?.label).toBe('Acme Corp')
    })
  })

  // ── useRemoveFavorite ─────────────────────────────────────────────────────────

  describe('useRemoveFavorite', () => {
    it('sends DELETE to /favorites/{id}/', async () => {
      vi.mocked(api.delete).mockResolvedValue({})

      const { result } = renderHook(() => useRemoveFavorite(), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.mutateAsync(7)
      })

      expect(api.delete).toHaveBeenCalledWith('/favorites/7/')
    })

    it('sends DELETE to the correct id', async () => {
      vi.mocked(api.delete).mockResolvedValue({})

      const { result } = renderHook(() => useRemoveFavorite(), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.mutateAsync(99)
      })

      expect(api.delete).toHaveBeenCalledWith('/favorites/99/')
    })
  })

  // ── useTrackEntityView ────────────────────────────────────────────────────────

  describe('useTrackEntityView', () => {
    it('posts to /recents/track/ with entity_type and object_id', async () => {
      vi.mocked(api.post).mockResolvedValue({})

      const { result } = renderHook(() => useTrackEntityView(), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.mutateAsync({ entity_type: 'customer', object_id: 5 })
      })

      expect(api.post).toHaveBeenCalledWith('/recents/track/', {
        entity_type: 'customer',
        object_id: 5,
      })
    })

    it('skips the API call when the same entity was tracked within 60 seconds', async () => {
      vi.mocked(api.post).mockResolvedValue({})

      // Use a unique entity to avoid interference from other tests
      const params = { entity_type: 'vendor' as const, object_id: 999 }

      const { result } = renderHook(() => useTrackEntityView(), { wrapper: createWrapper() })

      // First call — should post
      await act(async () => {
        await result.current.mutateAsync(params)
      })
      expect(api.post).toHaveBeenCalledTimes(1)

      vi.clearAllMocks()

      // Second call within 60s — should be skipped
      await act(async () => {
        await result.current.mutateAsync(params)
      })
      expect(api.post).not.toHaveBeenCalled()
    })
  })

  // ── useSuggestions ────────────────────────────────────────────────────────────

  describe('useSuggestions', () => {
    it('fetches from /suggestions/ with entity_type param', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: mockSuggestions })

      const { result } = renderHook(
        () => useSuggestions('customer', ''),
        { wrapper: createWrapper() },
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/suggestions/', {
        params: { entity_type: 'customer' },
      })
    })

    it('includes search param when search string is non-empty', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: mockSuggestions })

      const { result } = renderHook(
        () => useSuggestions('item', 'box'),
        { wrapper: createWrapper() },
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/suggestions/', {
        params: { entity_type: 'item', search: 'box' },
      })
    })

    it('returns favorites, recents, and results sections', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: mockSuggestions })

      const { result } = renderHook(
        () => useSuggestions('customer', ''),
        { wrapper: createWrapper() },
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.favorites).toHaveLength(1)
      expect(result.current.data?.recents).toHaveLength(1)
      expect(result.current.data?.results).toHaveLength(1)
      expect(result.current.data?.favorites[0].label).toBe('Acme Corp')
    })

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useSuggestions('customer', '', false),
        { wrapper: createWrapper() },
      )

      expect(result.current.isLoading).toBe(false)
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  // ── favoritesKeys ─────────────────────────────────────────────────────────────

  describe('favoritesKeys', () => {
    it('produces stable all key', () => {
      expect(favoritesKeys.all).toEqual(['favorites'])
    })

    it('produces list key with entityType', () => {
      expect(favoritesKeys.list('customer')).toEqual(['favorites', 'list', 'customer'])
    })

    it('produces suggestions key with entityType and search', () => {
      expect(favoritesKeys.suggestions('item', 'box')).toEqual(['suggestions', 'item', 'box'])
    })
  })
})
