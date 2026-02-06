import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type {
  DesignRequest,
  DesignRequestInput,
  PromoteDesignInput,
  PaginatedResponse,
} from '@/types/api'

// ==================== Design Requests ====================

export function useDesignRequests(params?: {
  search?: string
  status?: string
  customer?: number
  assigned_to?: number
}) {
  return useQuery({
    queryKey: ['design-requests', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<DesignRequest>>('/design-requests/', { params })
      return data
    },
  })
}

export function useDesignRequest(id: number) {
  return useQuery({
    queryKey: ['design-requests', id],
    queryFn: async () => {
      const { data } = await api.get<DesignRequest>(`/design-requests/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateDesignRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: DesignRequestInput) => {
      const { data } = await api.post<DesignRequest>('/design-requests/', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-requests'] })
    },
  })
}

export function useUpdateDesignRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<DesignRequestInput> & { id: number }) => {
      const { data } = await api.patch<DesignRequest>(`/design-requests/${id}/`, input)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['design-requests'] })
      queryClient.invalidateQueries({ queryKey: ['design-requests', variables.id] })
    },
  })
}

export function useDeleteDesignRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/design-requests/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-requests'] })
    },
  })
}

export function usePromoteDesign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: PromoteDesignInput & { id: number }) => {
      const { data } = await api.post<DesignRequest>(`/design-requests/${id}/promote/`, payload)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['design-requests'] })
      queryClient.invalidateQueries({ queryKey: ['design-requests', variables.id] })
      // Also invalidate items since we created one
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
