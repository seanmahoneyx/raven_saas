import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { fetchAllPages } from '@/lib/paginate'
import { toastApiError } from '@/lib/errors'
import type { PaginatedResponse, ApiError } from '@/types/api'
import type { BillDetail } from './invoicing'

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
  lot: number
  pallet_number: number
  license_plate: string
  item_sku: string
  warehouse_code: string
  bin: number | null
  bin_code: string | null
  quantity_received: number
  quantity_on_hand: number
  status: string
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
      const { data } = await api.get<PaginatedResponse<InventoryLot>>('/inventory/lots/', { params })
      return data
    },
  })
}

// Inventory Pallets
export function useInventoryPallets(params?: { warehouse?: number; status?: string }) {
  return useQuery({
    queryKey: ['inventory-pallets', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<InventoryPallet>>('/inventory/pallets/', { params })
      return data
    },
  })
}

// Inventory Balances
export function useInventoryBalances(params?: { item?: number; warehouse?: number }) {
  return useQuery({
    queryKey: ['inventory-balances', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<InventoryBalance>>('/inventory/balances/', { params })
      return data
    },
  })
}

/**
 * Fetch every InventoryBalance across all pages. Returns a flat array, not a PaginatedResponse.
 * Use for KPI tiles and dashboards that would otherwise be silently capped at PAGE_SIZE=50.
 */
export function useAllInventoryBalances(params?: { item?: number; warehouse?: number }) {
  return useQuery({
    queryKey: ['inventory-balances', 'all', params],
    queryFn: () => fetchAllPages<InventoryBalance>(api, '/inventory/balances/', params as Record<string, unknown> | undefined),
    staleTime: 60_000,
  })
}

// Inventory Transactions
export function useInventoryTransactions(params?: { item?: number; transaction_type?: string }) {
  return useQuery({
    queryKey: ['inventory-transactions', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<InventoryTransaction>>('/inventory/transactions/', { params })
      return data
    },
  })
}

// Warehouse Pallet Summary
export interface WarehousePalletSummary {
  pallets_in_inventory: number
  total_capacity: number
}

export function useWarehousePalletSummary() {
  return useQuery({
    queryKey: ['warehouse-pallet-summary'],
    queryFn: async () => {
      const { data } = await api.get<WarehousePalletSummary>('/inventory/warehouse-pallet-summary/')
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

/* ─── Item Receipts ───────────────────────────────────────────────────── */

export type ItemReceiptStatus = 'draft' | 'posted' | 'partially_billed' | 'billed' | 'void'

export interface ItemReceipt {
  id: number
  receipt_number: string
  status: ItemReceiptStatus
  vendor: number
  vendor_name: string
  vendor_code: string
  warehouse: number
  warehouse_code: string
  purchase_order: number | null
  purchase_order_number: string | null
  received_date: string
  num_lines: number
  subtotal: string
}

export interface ItemReceiptLine {
  id: number
  receipt: number
  line_number: number
  purchase_order_line: number | null
  item: number
  item_sku: string
  item_name: string
  quantity: number
  unit_cost: string
  amount: string
  quantity_billed: number
  quantity_remaining_to_bill: number
  notes: string
}

export interface ItemReceiptDetail extends Omit<ItemReceipt, 'num_lines'> {
  received_by: number | null
  received_by_name: string | null
  journal_entry: number | null
  notes: string
  lines: ItemReceiptLine[]
  created_at: string
  updated_at: string
}

export function useItemReceipts(params?: {
  status?: string
  vendor?: number
  purchase_order?: number
  search?: string
  ordering?: string
  page?: number
}) {
  return useQuery({
    queryKey: ['item-receipts', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ItemReceipt>>('/item-receipts/', { params })
      return data
    },
  })
}

export function useAllItemReceipts(params?: {
  status?: string
  vendor?: number
}) {
  return useQuery({
    queryKey: ['item-receipts', 'all', params],
    queryFn: () => fetchAllPages<ItemReceipt>(
      api, '/item-receipts/', params as Record<string, unknown> | undefined,
    ),
    staleTime: 60_000,
  })
}

export function useItemReceipt(id: number) {
  return useQuery({
    queryKey: ['item-receipts', id],
    queryFn: async () => {
      const { data } = await api.get<ItemReceiptDetail>(`/item-receipts/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

interface DirectReceiptInput {
  vendor: number
  warehouse: number
  received_date?: string
  notes?: string
  lines: Array<{
    item: number
    quantity: number
    unit_cost: string
    notes?: string
  }>
}

export function useCreateDirectReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: DirectReceiptInput) => {
      const { data } = await api.post<ItemReceiptDetail>('/item-receipts/direct/', body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-receipts'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      toast.success('Receipt posted')
    },
    onError: (e: ApiError) => toastApiError(e, 'Failed to create receipt'),
  })
}

export function useCreateBillFromReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      receiptId: number
      vendor_invoice_number?: string
      due_date?: string
      bill_date?: string
      notes?: string
    }) => {
      const { receiptId, ...body } = args
      const { data } = await api.post<BillDetail>(`/item-receipts/${receiptId}/create-bill/`, body)
      return data
    },
    onSuccess: (_data, { receiptId }) => {
      qc.invalidateQueries({ queryKey: ['item-receipts'] })
      qc.invalidateQueries({ queryKey: ['item-receipts', receiptId] })
      qc.invalidateQueries({ queryKey: ['bills'] })
      toast.success('Draft bill created from receipt')
    },
    onError: (e: ApiError) => toastApiError(e, 'Failed to create bill'),
  })
}

interface MultiReceiptBillInput {
  vendor: number
  vendor_invoice_number?: string
  due_date?: string
  bill_date?: string
  notes?: string
  lines: Array<{
    receipt_line: number
    quantity?: number
    unit_price?: string
  }>
}

export function useCreateMultiReceiptBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: MultiReceiptBillInput) => {
      const { data } = await api.post<BillDetail>('/item-receipts/create-multi-bill/', body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-receipts'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
      toast.success('Draft bill created from receipts')
    },
    onError: (e: ApiError) => toastApiError(e, 'Failed to create bill'),
  })
}
