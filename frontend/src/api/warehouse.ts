import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { getApiErrorMessage } from '@/lib/errors'
import type { PaginatedResponse, ApiError } from '@/types/api'

// ==================== Interfaces ====================

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
