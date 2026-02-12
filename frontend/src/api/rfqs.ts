import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type { RFQ, PaginatedResponse, RFQStatus } from '@/types/api'

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
    mutationFn: async (rfq: any) => {
      const { data } = await api.post('/rfqs/', rfq)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] })
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
    },
  })
}
