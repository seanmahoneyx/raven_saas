import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type { Item, UnitOfMeasure, PaginatedResponse } from '@/types/api'

// Items
export function useItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Item>>('/items/', { params })
      return data
    },
  })
}

export function useItem(id: number) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: async () => {
      const { data } = await api.get<Item>(`/items/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: Partial<Item>) => {
      const { data } = await api.post<Item>('/items/', item)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...item }: Partial<Item> & { id: number }) => {
      const { data } = await api.patch<Item>(`/items/${id}/`, item)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/items/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

// Units of Measure
export function useUnitsOfMeasure() {
  return useQuery({
    queryKey: ['uom'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<UnitOfMeasure>>('/uom/')
      return data
    },
  })
}

export function useCreateUnitOfMeasure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (uom: Partial<UnitOfMeasure>) => {
      const { data } = await api.post<UnitOfMeasure>('/uom/', uom)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uom'] })
    },
  })
}

export function useUpdateUnitOfMeasure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...uom }: Partial<UnitOfMeasure> & { id: number }) => {
      const { data } = await api.patch<UnitOfMeasure>(`/uom/${id}/`, uom)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uom'] })
    },
  })
}
