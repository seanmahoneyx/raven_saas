import { useQuery } from '@tanstack/react-query'
import api from './client'

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
