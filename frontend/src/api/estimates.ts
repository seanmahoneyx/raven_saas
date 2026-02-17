import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import type { Estimate, PaginatedResponse, EstimateStatus, ApiError } from '@/types/api'

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
      toast.success('Estimate created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create estimate')
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
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to save changes')
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
      toast.success('Estimate deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete estimate')
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
      toast.success('Estimate sent')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to send estimate')
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
      toast.success('Estimate converted to sales order')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to convert estimate')
    },
  })
}
