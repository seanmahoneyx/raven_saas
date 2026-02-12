import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type { PriceList, PriceListInput, PaginatedResponse } from '@/types/api'

export function usePriceLists(params?: { search?: string; customer?: number; item?: number }) {
  return useQuery({
    queryKey: ['price-lists', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<PriceList>>('/price-lists/', { params })
      return data
    },
  })
}

export function usePriceList(id: number) {
  return useQuery({
    queryKey: ['price-lists', id],
    queryFn: async () => {
      const { data } = await api.get<PriceList>(`/price-lists/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreatePriceList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (priceList: PriceListInput) => {
      const { data } = await api.post<PriceList>('/price-lists/', priceList)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] })
    },
  })
}

export function useUpdatePriceList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<PriceListInput> & { id: number }) => {
      const { data } = await api.patch<PriceList>(`/price-lists/${id}/`, input)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] })
      queryClient.invalidateQueries({ queryKey: ['price-lists', variables.id] })
    },
  })
}

export function useDeletePriceList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/price-lists/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] })
    },
  })
}

export function usePriceLookup(customerId?: number, itemId?: number, quantity?: number) {
  return useQuery({
    queryKey: ['price-lookup', customerId, itemId, quantity],
    queryFn: async () => {
      const { data } = await api.get<{ unit_price: string; price_list_id: number }>('/price-lists/lookup/', {
        params: { customer: customerId, item: itemId, quantity },
      })
      return data
    },
    enabled: !!customerId && !!itemId && (quantity ?? 0) > 0,
    retry: false,
  })
}
