import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import type { RFQ, PaginatedResponse, RFQStatus, ApiError } from '@/types/api'

export function useRFQs(params?: { status?: RFQStatus; vendor?: number }) {
  return useQuery({
    queryKey: ['rfqs', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<RFQ>>('/rfqs/', { params })
      return data
    },
  })
}

export function useRFQ(id: number) {
  return useQuery({
    queryKey: ['rfqs', id],
    queryFn: async () => {
      const { data } = await api.get<RFQ>(`/rfqs/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateRFQ() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rfq: Partial<RFQ>) => {
      const { data } = await api.post<RFQ>('/rfqs/', rfq)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] })
      toast.success('RFQ created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create RFQ')
    },
  })
}

export function useUpdateRFQ() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rfq }: Partial<RFQ> & { id: number }) => {
      const { data } = await api.patch<RFQ>(`/rfqs/${id}/`, rfq)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to save changes')
    },
  })
}

export function useDeleteRFQ() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/rfqs/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] })
      toast.success('RFQ deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete RFQ')
    },
  })
}

export function useConvertRFQ() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/rfqs/${id}/convert/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      toast.success('RFQ converted to purchase order')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to convert RFQ')
    },
  })
}

export function useSendRFQ() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, email }: { id: number; email?: string }) => {
      const { data } = await api.post(`/rfqs/${id}/send-email/`, { email })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] })
      toast.success('RFQ sent')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to send RFQ')
    },
  })
}
