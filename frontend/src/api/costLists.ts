import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { getApiErrorMessage } from '@/lib/errors'
import type { CostListHead, PaginatedResponse, ApiError } from '@/types/api'

export function useCostLists(params?: { vendor?: number; item?: number; is_active?: boolean }) {
  return useQuery({
    queryKey: ['cost-lists', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<CostListHead>>('/cost-lists/', { params })
      return data
    },
    enabled: params?.vendor != null || params?.item != null,
  })
}

export function useCreateCostList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (costList: {
      vendor: number
      item: number
      begin_date: string
      end_date?: string | null
      is_active?: boolean
      notes?: string
      lines?: { min_quantity: number; unit_cost: string }[]
    }) => {
      const { data } = await api.post<CostListHead>('/cost-lists/', costList)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-lists'] })
      toast.success('Cost list created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create cost list'))
    },
  })
}

export function useCostLookup(vendorId?: number, itemId?: number, quantity?: number) {
  return useQuery({
    queryKey: ['cost-lookup', vendorId, itemId, quantity],
    queryFn: async () => {
      const { data } = await api.get<{ unit_cost: string; cost_list_id: number }>('/cost-lists/lookup/', {
        params: { vendor: vendorId, item: itemId, quantity },
      })
      return data
    },
    enabled: !!vendorId && !!itemId && (quantity ?? 0) > 0,
    retry: false,
  })
}
