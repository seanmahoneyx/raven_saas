import { apiClient } from './client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Notification {
  id: number
  title: string
  message: string
  link: string
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'
  read: boolean
  created_at: string
}

interface NotificationsResponse {
  notifications: Notification[]
  unread_count: number
}

export function useNotifications() {
  return useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: () => apiClient.get('/notifications/').then(r => r.data),
    refetchInterval: 30000, // Poll every 30 seconds
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids?: number[]) =>
      apiClient.post('/notifications/mark-read/', { ids: ids || [] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
