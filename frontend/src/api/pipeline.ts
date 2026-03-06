import { useQuery } from '@tanstack/react-query'
import api from './client'
import type { PipelineData } from '@/types/api'

export interface PipelineFilters {
  customer?: number
  vendor?: number
  date_from?: string
  date_to?: string
}

export function usePipelineData(filters?: PipelineFilters) {
  return useQuery({
    queryKey: ['pipeline', filters],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filters?.customer) params.customer = String(filters.customer)
      if (filters?.vendor) params.vendor = String(filters.vendor)
      if (filters?.date_from) params.date_from = filters.date_from
      if (filters?.date_to) params.date_to = filters.date_to
      const { data } = await api.get<PipelineData>('/pipeline/', { params })
      return data
    },
    refetchInterval: 5 * 60 * 1000, // 5-minute auto-refresh
  })
}
