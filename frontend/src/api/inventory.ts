import { useQuery } from '@tanstack/react-query'
import api from './client'
import type { PaginatedResponse } from '@/types/api'

// Inventory types
export interface InventoryLot {
  id: number
  lot_number: string
  item: number
  item_sku: string
  item_name: string
  quantity: number
  uom: number
  uom_code: string
  received_date: string
  expiration_date: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface InventoryPallet {
  id: number
  pallet_id: string
  warehouse: number
  warehouse_name: string
  bin: number | null
  bin_code: string | null
  status: 'available' | 'reserved' | 'damaged' | 'quarantine'
  notes: string
  created_at: string
  updated_at: string
}

export interface InventoryBalance {
  id: number
  item: number
  item_sku: string
  item_name: string
  warehouse: number
  warehouse_name: string
  bin: number | null
  bin_code: string | null
  lot: number | null
  lot_number: string | null
  quantity_on_hand: number
  quantity_reserved: number
  quantity_available: number
  uom: number
  uom_code: string
  last_updated: string
}

export interface InventoryTransaction {
  id: number
  transaction_type: 'RECEIVE' | 'SHIP' | 'ADJUST' | 'TRANSFER' | 'COUNT'
  item: number
  item_sku: string
  item_name: string
  quantity: number
  uom: number
  uom_code: string
  from_warehouse: number | null
  from_warehouse_name: string | null
  to_warehouse: number | null
  to_warehouse_name: string | null
  lot: number | null
  lot_number: string | null
  reference_type: string | null
  reference_id: number | null
  notes: string
  transaction_date: string
  created_by: number
  created_by_name: string
}

// Inventory Lots
export function useInventoryLots(params?: { item?: number; warehouse?: number }) {
  return useQuery({
    queryKey: ['inventory-lots', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<InventoryLot>>('/inventory-lots/', { params })
      return data
    },
  })
}

// Inventory Pallets
export function useInventoryPallets(params?: { warehouse?: number; status?: string }) {
  return useQuery({
    queryKey: ['inventory-pallets', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<InventoryPallet>>('/inventory-pallets/', { params })
      return data
    },
  })
}

// Inventory Balances
export function useInventoryBalances(params?: { item?: number; warehouse?: number }) {
  return useQuery({
    queryKey: ['inventory-balances', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<InventoryBalance>>('/inventory-balances/', { params })
      return data
    },
  })
}

// Inventory Transactions
export function useInventoryTransactions(params?: { item?: number; transaction_type?: string }) {
  return useQuery({
    queryKey: ['inventory-transactions', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<InventoryTransaction>>('/inventory-transactions/', { params })
      return data
    },
  })
}

// Reorder Alerts
export interface ReorderAlert {
  item_id: number
  item_sku: string
  item_name: string
  on_hand: number
  allocated: number
  available: number
  on_order: number
  reorder_point: number
  min_stock: number | null
  safety_stock: number | null
  suggested_qty: number
  preferred_vendor_id: number | null
  preferred_vendor_name: string | null
  lead_time_days: number | null
  severity: 'critical' | 'warning' | 'info'
}

export interface ReorderAlertsResponse {
  count: number
  alerts: ReorderAlert[]
}

export function useReorderAlerts() {
  return useQuery({
    queryKey: ['reorder-alerts'],
    queryFn: async () => {
      const { data } = await api.get<ReorderAlertsResponse>('/inventory/reorder-alerts/')
      return data
    },
  })
}
