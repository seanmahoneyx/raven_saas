import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { getApiErrorMessage } from '@/lib/errors'
import type { EntityType, UserFavorite, UserRecentView, SuggestionsResponse, ApiError } from '@/types/api'

// ── Query Keys ──────────────────────────────────────────────────────

export const favoritesKeys = {
  all: ['favorites'] as const,
  list: (entityType?: EntityType) => [...favoritesKeys.all, 'list', entityType] as const,
  suggestions: (entityType: EntityType, search: string) =>
    ['suggestions', entityType, search] as const,
  recents: (entityType?: EntityType) => ['recents', entityType] as const,
}

// ── Favorites ───────────────────────────────────────────────────────

export function useFavorites(entityType?: EntityType) {
  return useQuery({
    queryKey: favoritesKeys.list(entityType),
    queryFn: async () => {
      const params = entityType ? { entity_type: entityType } : undefined
      const { data } = await api.get<UserFavorite[]>('/favorites/', { params })
      return data
    },
    staleTime: 1000 * 60 * 5, // 5 min
  })
}

export function useAddFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { entity_type: EntityType; object_id: number }) => {
      const { data } = await api.post<UserFavorite>('/favorites/', params)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: favoritesKeys.all })
      queryClient.invalidateQueries({ queryKey: ['suggestions'] })
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to add favorite'))
    },
  })
}

export function useRemoveFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (favoriteId: number) => {
      await api.delete(`/favorites/${favoriteId}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: favoritesKeys.all })
      queryClient.invalidateQueries({ queryKey: ['suggestions'] })
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to remove favorite'))
    },
  })
}

// ── Recents ─────────────────────────────────────────────────────────

export function useRecents(entityType?: EntityType) {
  return useQuery({
    queryKey: favoritesKeys.recents(entityType),
    queryFn: async () => {
      const params: Record<string, string> = entityType
        ? { entity_type: entityType, limit: '5' }
        : { limit: '10' }
      const { data } = await api.get<UserRecentView[]>('/recents/', { params })
      return data
    },
    staleTime: 1000 * 60 * 2, // 2 min
  })
}

// ── Track View (fire-and-forget, debounced) ─────────────────────────

const recentlyTracked = new Map<string, number>() // key -> timestamp
const TRACK_DEBOUNCE_MS = 60_000 // 60 seconds

export function useTrackEntityView() {
  return useMutation({
    mutationFn: async (params: { entity_type: EntityType; object_id: number }) => {
      const key = `${params.entity_type}:${params.object_id}`
      const lastTracked = recentlyTracked.get(key)
      if (lastTracked && Date.now() - lastTracked < TRACK_DEBOUNCE_MS) {
        return // Skip if tracked within last 60s
      }
      recentlyTracked.set(key, Date.now())
      await api.post('/recents/track/', params)
    },
  })
}

// ── Suggestions (combined endpoint for combobox) ────────────────────

export function useSuggestions(entityType: EntityType, search: string, enabled = true) {
  return useQuery({
    queryKey: favoritesKeys.suggestions(entityType, search),
    queryFn: async () => {
      const params: Record<string, string> = { entity_type: entityType }
      if (search) params.search = search
      const { data } = await api.get<SuggestionsResponse>('/suggestions/', { params })
      return data
    },
    enabled,
    staleTime: 1000 * 30, // 30 seconds
  })
}
