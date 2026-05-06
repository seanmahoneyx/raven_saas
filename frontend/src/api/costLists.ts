import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { getApiErrorMessage } from '@/lib/errors'
import type { CostListHead, CostListInput, PaginatedResponse, ApiError } from '@/types/api'

export function useCostLists(params?: { search?: string; vendor?: number; item?: number; is_active?: boolean }) {
  return useQuery({
    queryKey: ['cost-lists', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<CostListHead>>('/cost-lists/', { params })
      return data
    },
  })
}

export function useCostList(id: number) {
  return useQuery({
    queryKey: ['cost-lists', id],
    queryFn: async () => {
      const { data } = await api.get<CostListHead>(`/cost-lists/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateCostList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (costList: CostListInput) => {
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

export function useUpdateCostList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CostListInput> & { id: number }) => {
      const { data } = await api.patch<CostListHead>(`/cost-lists/${id}/`, input)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cost-lists'] })
      queryClient.invalidateQueries({ queryKey: ['cost-lists', variables.id] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to save changes'))
    },
  })
}

export function useDeleteCostList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/cost-lists/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-lists'] })
      toast.success('Cost list deleted')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete cost list'))
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
