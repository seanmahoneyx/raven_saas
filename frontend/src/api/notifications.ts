import { apiClient } from './client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Notification {
  id: number
  title: string
  message: string
  link: string
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'MENTION' | 'TASK' | 'COMMENT'
  read: boolean
  content_type: string | null
  object_id: number | null
  created_at: string
}

interface NotificationsResponse {
  notifications: Notification[]
  unread_count: number
  count?: number
}

export interface NotificationFilters {
  type?: string
  content_type?: string
  object_id?: number
  limit?: number
  offset?: number
}

export function useNotifications(filters?: NotificationFilters) {
  return useQuery<NotificationsResponse>({
    queryKey: ['notifications', filters],
    queryFn: () => apiClient.get('/notifications/', { params: filters }).then(r => r.data),
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
