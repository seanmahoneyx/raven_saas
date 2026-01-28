import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type {
  Item, UnitOfMeasure, PaginatedResponse,
  CorrugatedFeature, DCItem, RSCItem, HSCItem, FOLItem, TeleItem,
  ItemVendor
} from '@/types/api'

// =============================================================================
// ITEMS (BASE)
// =============================================================================

export function useItems(params?: { search?: string; is_active?: boolean; division?: string }) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Item>>('/items/', { params })
      return data
    },
  })
}

export function useItem(id: number | null) {
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

// =============================================================================
// UNITS OF MEASURE
// =============================================================================

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

// =============================================================================
// CORRUGATED FEATURES
// =============================================================================

export function useCorrugatedFeatures() {
  return useQuery({
    queryKey: ['corrugated-features'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<CorrugatedFeature>>('/corrugated-features/')
      return data
    },
  })
}

// =============================================================================
// CORRUGATED ITEMS
// =============================================================================

type BoxType = 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele'
type BoxItem = DCItem | RSCItem | HSCItem | FOLItem | TeleItem

const boxEndpoints: Record<BoxType, string> = {
  dc: '/dc-items/',
  rsc: '/rsc-items/',
  hsc: '/hsc-items/',
  fol: '/fol-items/',
  tele: '/tele-items/',
}

export function useCreateBoxItem(boxType: BoxType) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: Partial<BoxItem>) => {
      const { data } = await api.post<BoxItem>(boxEndpoints[boxType], item)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: [`${boxType}-items`] })
    },
  })
}

export function useUpdateBoxItem(boxType: BoxType) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...item }: Partial<BoxItem> & { id: number }) => {
      const { data } = await api.patch<BoxItem>(`${boxEndpoints[boxType]}${id}/`, item)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: [`${boxType}-items`] })
    },
  })
}

// DC Items
export function useDCItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['dc-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<DCItem>>('/dc-items/', { params })
      return data
    },
  })
}

export function useDCItem(id: number | null) {
  return useQuery({
    queryKey: ['dc-items', id],
    queryFn: async () => {
      const { data } = await api.get<DCItem>(`/dc-items/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

// RSC Items
export function useRSCItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['rsc-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<RSCItem>>('/rsc-items/', { params })
      return data
    },
  })
}

export function useRSCItem(id: number | null) {
  return useQuery({
    queryKey: ['rsc-items', id],
    queryFn: async () => {
      const { data } = await api.get<RSCItem>(`/rsc-items/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

// HSC Items
export function useHSCItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['hsc-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<HSCItem>>('/hsc-items/', { params })
      return data
    },
  })
}

// FOL Items
export function useFOLItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['fol-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<FOLItem>>('/fol-items/', { params })
      return data
    },
  })
}

// Tele Items
export function useTeleItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['tele-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<TeleItem>>('/tele-items/', { params })
      return data
    },
  })
}

// Generic hook to fetch any box item by type and id
export function useBoxItem(boxType: BoxType | null, id: number | null) {
  return useQuery({
    queryKey: [boxType ? `${boxType}-items` : 'box-items', id],
    queryFn: async () => {
      if (!boxType || !id) return null
      const { data } = await api.get<BoxItem>(`${boxEndpoints[boxType]}${id}/`)
      return data
    },
    enabled: !!boxType && !!id,
  })
}

// =============================================================================
// ITEM VENDORS
// =============================================================================

export function useItemVendors(itemId: number | null) {
  return useQuery({
    queryKey: ['item-vendors', itemId],
    queryFn: async () => {
      const { data } = await api.get<ItemVendor[]>(`/items/${itemId}/vendors/`)
      return data
    },
    enabled: !!itemId,
  })
}

export function useCreateItemVendor(itemId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vendor: Partial<ItemVendor>) => {
      const { data } = await api.post<ItemVendor>(`/items/${itemId}/vendors/`, vendor)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-vendors', itemId] })
      queryClient.invalidateQueries({ queryKey: ['items', itemId] })
    },
  })
}
