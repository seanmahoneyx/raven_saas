import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type { Estimate, PaginatedResponse, EstimateStatus } from '@/types/api'

export function useEstimates(params?: { status?: EstimateStatus; customer?: number }) {
  return useQuery({
    queryKey: ['estimates', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Estimate>>('/estimates/', { params })
      return data
    },
  })
}

export function useEstimate(id: number) {
  return useQuery({
    queryKey: ['estimates', id],
    queryFn: async () => {
      const { data } = await api.get<Estimate>(`/estimates/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateEstimate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (estimate: Partial<Estimate>) => {
      const { data } = await api.post<Estimate>('/estimates/', estimate)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
    },
  })
}

export function useUpdateEstimate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...estimate }: Partial<Estimate> & { id: number }) => {
      const { data } = await api.patch<Estimate>(`/estimates/${id}/`, estimate)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
    },
  })
}

export function useDeleteEstimate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/estimates/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
    },
  })
}

export function useSendEstimate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, email }: { id: number; email?: string }) => {
      const { data } = await api.post(`/estimates/${id}/send-email/`, email ? { email } : {})
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
    },
  })
}

export function useConvertEstimate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/estimates/${id}/convert/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
    },
  })
}
