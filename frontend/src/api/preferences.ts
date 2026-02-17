import { apiClient } from './client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface UserPreferences {
  default_warehouse_id?: number | null
  items_per_page?: number
  theme?: 'light' | 'dark' | 'system'
  default_printer_id?: string | null
}

const DEFAULT_PREFERENCES: UserPreferences = {
  default_warehouse_id: null,
  items_per_page: 25,
  theme: 'system',
  default_printer_id: null,
}

export function useUserPreferences() {
  return useQuery<UserPreferences>({
    queryKey: ['user-preferences'],
    queryFn: async () => {
      const res = await apiClient.get('/users/me/preferences/')
      return { ...DEFAULT_PREFERENCES, ...res.data }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (prefs: Partial<UserPreferences>) =>
      apiClient.patch('/users/me/preferences/', prefs).then(r => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData(['user-preferences'], { ...DEFAULT_PREFERENCES, ...data })
    },
  })
}
