import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type { PurchaseOrder, SalesOrder, PaginatedResponse, OrderStatus } from '@/types/api'

// Sales Orders
export function useSalesOrders(params?: { status?: OrderStatus; customer?: number }) {
  return useQuery({
    queryKey: ['sales-orders', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<SalesOrder>>('/sales-orders/', { params })
      return data
    },
  })
}

export function useSalesOrder(id: number) {
  return useQuery({
    queryKey: ['sales-orders', id],
    queryFn: async () => {
      const { data } = await api.get<SalesOrder>(`/sales-orders/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateSalesOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (order: Partial<SalesOrder>) => {
      const { data } = await api.post<SalesOrder>('/sales-orders/', order)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useUpdateSalesOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...order }: Partial<SalesOrder> & { id: number }) => {
      const { data } = await api.patch<SalesOrder>(`/sales-orders/${id}/`, order)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useDeleteSalesOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/sales-orders/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

// Purchase Orders
export function usePurchaseOrders(params?: { status?: OrderStatus; vendor?: number }) {
  return useQuery({
    queryKey: ['purchase-orders', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<PurchaseOrder>>('/purchase-orders/', { params })
      return data
    },
  })
}

export function usePurchaseOrder(id: number) {
  return useQuery({
    queryKey: ['purchase-orders', id],
    queryFn: async () => {
      const { data } = await api.get<PurchaseOrder>(`/purchase-orders/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (order: Partial<PurchaseOrder>) => {
      const { data } = await api.post<PurchaseOrder>('/purchase-orders/', order)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...order }: Partial<PurchaseOrder> & { id: number }) => {
      const { data } = await api.patch<PurchaseOrder>(`/purchase-orders/${id}/`, order)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/purchase-orders/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

// ==================== Sales Order Status Actions ====================

export function useConfirmSalesOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<SalesOrder>(`/sales-orders/${id}/confirm/`)
      return data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sales-orders', id] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useCancelSalesOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<SalesOrder>(`/sales-orders/${id}/cancel/`)
      return data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sales-orders', id] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

// ==================== Purchase Order Status Actions ====================

export function useConfirmPurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<PurchaseOrder>(`/purchase-orders/${id}/confirm/`)
      return data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', id] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<PurchaseOrder>(`/purchase-orders/${id}/cancel/`)
      return data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', id] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useReceivePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, lines }: { id: number; lines?: Array<{ line_id: number; quantity: number; unit_cost?: string }> }) => {
      const { data } = await api.post(`/purchase-orders/${id}/receive/`, { lines })
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}
