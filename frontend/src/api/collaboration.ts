import { apiClient } from './client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────

export interface Comment {
  id: number
  content_type: number
  object_id: number
  content_type_model: string
  author: number
  author_name: string
  author_username: string
  body: string
  parent: number | null
  is_deleted: boolean
  reply_count: number
  replies?: Comment[]
  created_at: string
  updated_at: string
}

export interface Task {
  id: number
  content_type: number
  object_id: number
  content_type_model: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'blocked' | 'complete' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  assigned_to: number | null
  assigned_to_name: string | null
  created_by: number
  created_by_name: string
  due_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface MentionableUser {
  id: number
  name: string
  username: string
}

export interface MentionableGroup {
  id: number
  name: string
}

interface CommentsResponse {
  results: Comment[]
  count: number
}

interface TasksResponse {
  results: Task[]
  count: number
}

interface MentionableResponse {
  users: MentionableUser[]
  groups: MentionableGroup[]
}

// ── Comments ───────────────────────────────────────────

export function useComments(contentType: string, objectId: number | undefined) {
  return useQuery<CommentsResponse>({
    queryKey: ['comments', contentType, objectId],
    queryFn: () =>
      apiClient
        .get('/collaboration/comments/', { params: { content_type: contentType, object_id: objectId } })
        .then(r => r.data),
    enabled: !!objectId,
  })
}

export function useCreateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { content_type: string; object_id: number; body: string; parent?: number | null }) =>
      apiClient.post('/collaboration/comments/', data).then(r => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['comments', variables.content_type, variables.object_id] })
    },
    onError: () => toast.error('Failed to post comment'),
  })
}

export function useUpdateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) =>
      apiClient.put(`/collaboration/comments/${id}/`, { body }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments'] })
    },
    onError: () => toast.error('Failed to update comment'),
  })
}

export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete(`/collaboration/comments/${id}/`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments'] })
    },
    onError: () => toast.error('Failed to delete comment'),
  })
}

// ── Tasks ──────────────────────────────────────────────

export function useTasks(contentType: string, objectId: number | undefined) {
  return useQuery<TasksResponse>({
    queryKey: ['tasks', contentType, objectId],
    queryFn: () =>
      apiClient
        .get('/collaboration/tasks/', { params: { content_type: contentType, object_id: objectId } })
        .then(r => r.data),
    enabled: !!objectId,
  })
}

export function useMyTasks(statusFilter?: string) {
  return useQuery<TasksResponse>({
    queryKey: ['tasks', 'my', statusFilter],
    queryFn: () =>
      apiClient
        .get('/collaboration/tasks/my/', { params: statusFilter ? { status: statusFilter } : undefined })
        .then(r => r.data),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      content_type: string
      object_id: number
      title: string
      description?: string
      assigned_to?: number | null
      priority?: string
      due_date?: string | null
    }) => apiClient.post('/collaboration/tasks/', data).then(r => r.data),
    onSuccess: (_data, variables) => {
      toast.success('Task created')
      qc.invalidateQueries({ queryKey: ['tasks', variables.content_type, variables.object_id] })
      qc.invalidateQueries({ queryKey: ['tasks', 'my'] })
    },
    onError: () => toast.error('Failed to create task'),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: number
      status?: string
      assigned_to?: number | null
      title?: string
      description?: string
      priority?: string
      due_date?: string | null
    }) => apiClient.put(`/collaboration/tasks/${id}/`, data).then(r => r.data),
    onSuccess: () => {
      toast.success('Task updated')
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: () => toast.error('Failed to update task'),
  })
}

// ── Mentionable Users/Groups ───────────────────────────

export function useMentionableUsers(search?: string) {
  return useQuery<MentionableResponse>({
    queryKey: ['mentionable', search],
    queryFn: () =>
      apiClient
        .get('/users/mentionable/', { params: search ? { q: search } : undefined })
        .then(r => r.data),
    staleTime: 60000,
  })
}

// ── Direct Messages ────────────────────────────────────

export interface DirectMessage {
  id: number
  sender: number
  sender_name: string
  sender_username: string
  recipient: number
  recipient_name: string
  recipient_username: string
  body: string
  read: boolean
  created_at: string
  updated_at: string
}

export interface Conversation {
  user_id: number
  user_name: string
  user_username: string
  last_message: string
  last_message_at: string
  unread_count: number
}

interface ConversationsResponse {
  results: Conversation[]
}

interface DirectMessagesResponse {
  results: DirectMessage[]
  count: number
}

export function useConversations() {
  return useQuery<ConversationsResponse>({
    queryKey: ['conversations'],
    queryFn: () => apiClient.get('/collaboration/messages/').then(r => r.data),
    refetchInterval: 15000,
  })
}

export function useDirectMessages(userId: number | null) {
  return useQuery<DirectMessagesResponse>({
    queryKey: ['direct-messages', userId],
    queryFn: () => apiClient.get(`/collaboration/messages/${userId}/`).then(r => r.data),
    enabled: !!userId,
    refetchInterval: 5000,
  })
}

export function useSendDirectMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, body }: { userId: number; body: string }) =>
      apiClient.post(`/collaboration/messages/${userId}/`, { body }).then(r => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['direct-messages', variables.userId] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
    onError: () => toast.error('Failed to send message'),
  })
}

export function useUnreadMessageCount() {
  return useQuery<{ unread_count: number }>({
    queryKey: ['dm-unread-count'],
    queryFn: () => apiClient.get('/collaboration/messages/unread-count/').then(r => r.data),
    refetchInterval: 30000,
  })
}
