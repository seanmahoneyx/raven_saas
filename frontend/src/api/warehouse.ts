import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { getApiErrorMessage } from '@/lib/errors'
import { fetchAllPages } from '@/lib/paginate'
import type { PaginatedResponse, ApiError } from '@/types/api'

// ==================== Interfaces ====================

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WarehouseLocation {
  id: number;
  warehouse: number;
  warehouse_code: string;
  name: string;
  barcode: string;
  type: string;
  parent: number | null;
  parent_name: string | null;
  parent_path: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lot {
  id: number;
  item: number;
  item_sku: string;
  lot_number: string;
  vendor_batch: string;
  manufacturer_batch_id: string;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockQuant {
  id: number;
  item: number;
  item_sku: string;
  item_name: string;
  location: number;
  location_name: string;
  location_barcode: string;
  warehouse_code: string;
  lot: number | null;
  lot_number: string | null;
  quantity: string;
  reserved_quantity: string;
  available_quantity: string;
  created_at: string;
  updated_at: string;
}

// ==================== Warehouses ====================

export function useWarehouses(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['warehouses', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Warehouse>>('/warehouses/', { params })
      return data
    },
  })
}

/**
 * Fetch every Warehouse across all pages. Returns a flat array, not a PaginatedResponse.
 */
export function useAllWarehouses(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['warehouses', 'all', params],
    queryFn: () => fetchAllPages<Warehouse>(api, '/warehouses/', params as Record<string, unknown> | undefined),
    staleTime: 60_000,
  })
}

// ==================== Warehouse Locations ====================

export function useWarehouseLocations(params?: { warehouse?: number; type?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['warehouse-locations', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<WarehouseLocation>>('/warehouse/locations/', { params })
      return data
    },
  })
}

/**
 * Fetch every WarehouseLocation across all pages. Returns a flat array, not a PaginatedResponse.
 */
export function useAllWarehouseLocations(params?: { warehouse?: number; type?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['warehouse-locations', 'all', params],
    queryFn: () => fetchAllPages<WarehouseLocation>(api, '/warehouse/locations/', params as Record<string, unknown> | undefined),
    staleTime: 60_000,
  })
}

export function useWarehouseLocation(id: number) {
  return useQuery({
    queryKey: ['warehouse-locations', id],
    queryFn: async () => {
      const { data } = await api.get<WarehouseLocation>(`/warehouse/locations/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateWarehouseLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (location: Partial<WarehouseLocation>) => {
      const { data } = await api.post<WarehouseLocation>('/warehouse/locations/', location)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations'] })
      toast.success('Warehouse location created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create warehouse location'))
    },
  })
}

export function useUpdateWarehouseLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...location }: Partial<WarehouseLocation> & { id: number }) => {
      const { data } = await api.patch<WarehouseLocation>(`/warehouse/locations/${id}/`, location)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations'] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to save changes'))
    },
  })
}

export function useDeleteWarehouseLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/warehouse/locations/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations'] })
      toast.success('Warehouse location deleted')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete warehouse location'))
    },
  })
}

// ==================== Lots ====================

export function useLots(params?: { item?: number }) {
  return useQuery({
    queryKey: ['lots', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Lot>>('/warehouse/lots/', { params })
      return data
    },
  })
}

/**
 * Fetch every Lot across all pages. Returns a flat array, not a PaginatedResponse.
 */
export function useAllLots(params?: { item?: number }) {
  return useQuery({
    queryKey: ['lots', 'all', params],
    queryFn: () => fetchAllPages<Lot>(api, '/warehouse/lots/', params as Record<string, unknown> | undefined),
    staleTime: 60_000,
  })
}

export function useLot(id: number) {
  return useQuery({
    queryKey: ['lots', id],
    queryFn: async () => {
      const { data } = await api.get<Lot>(`/warehouse/lots/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateLot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (lot: Partial<Lot>) => {
      const { data } = await api.post<Lot>('/warehouse/lots/', lot)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lots'] })
      toast.success('Lot created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create lot'))
    },
  })
}

export function useUpdateLot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...lot }: Partial<Lot> & { id: number }) => {
      const { data } = await api.patch<Lot>(`/warehouse/lots/${id}/`, lot)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lots'] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to save changes'))
    },
  })
}

export function useDeleteLot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/warehouse/lots/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lots'] })
      toast.success('Lot deleted')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete lot'))
    },
  })
}

// ==================== Cycle Counts ====================

export interface CycleCountLine {
  id: number
  item_sku: string
  item_name: string
  location_name: string
  lot_number: string | null
  expected_quantity: string
  counted_quantity: string | null
  variance: string
  is_counted: boolean
}

export interface CycleCount {
  id: number
  count_number: string
  warehouse: number
  warehouse_code: string
  warehouse_name: string
  zone: number | null
  zone_name: string | null
  status: string
  counted_by_name: string | null
  total_lines: number
  counted_lines: number
  started_at: string | null
  completed_at: string | null
  notes: string
  lines?: CycleCountLine[]
  created_at: string
}

export function useCycleCounts(params?: { warehouse?: number; status?: string }) {
  return useQuery({
    queryKey: ['cycle-counts', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<CycleCount>>('/warehouse/cycle-counts/', { params })
      return data
    },
  })
}

/**
 * Fetch every CycleCount across all pages. Returns a flat array, not a PaginatedResponse.
 * The existing `useCycleCounts` defined locally in pages/warehouse/CycleCounts.tsx remains
 * untouched; this is the canonical multi-page fetch for dashboards/KPIs.
 */
export function useAllCycleCounts(params?: { warehouse?: number; status?: string }) {
  return useQuery({
    queryKey: ['cycle-counts', 'all', params],
    queryFn: () => fetchAllPages<CycleCount>(api, '/warehouse/cycle-counts/', params as Record<string, unknown> | undefined),
    staleTime: 60_000,
  })
}

// ==================== Stock ====================

export function useStockByLocation(itemId: number) {
  return useQuery({
    queryKey: ['stock-by-location', itemId],
    queryFn: async () => {
      const { data } = await api.get<StockQuant[]>(`/warehouse/stock-by-location/${itemId}/`)
      return data
    },
    enabled: !!itemId,
  })
}
