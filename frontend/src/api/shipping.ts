import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type { PaginatedResponse } from '@/types/api'

export interface Shipment {
  id: number
  shipment_number: string
  status: 'pending' | 'in_transit' | 'delivered' | 'cancelled'
  ship_date: string | null
  delivery_date: string | null
  carrier: string
  tracking_number: string
  ship_from: number
  ship_from_name: string
  ship_to: number
  ship_to_name: string
  notes: string
  created_at: string
  updated_at: string
}

export interface BillOfLading {
  id: number
  bol_number: string
  shipment: number
  shipment_number: string
  carrier: string
  trailer_number: string
  seal_number: string
  driver_name: string
  pickup_date: string | null
  delivery_date: string | null
  freight_charge: string
  special_instructions: string
  status: 'draft' | 'printed' | 'signed' | 'complete'
  created_at: string
  updated_at: string
}

// Shipments
export function useShipments(params?: { status?: string }) {
  return useQuery({
    queryKey: ['shipments', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Shipment>>('/shipments/', { params })
      return data
    },
  })
}

export function useShipment(id: number) {
  return useQuery({
    queryKey: ['shipments', id],
    queryFn: async () => {
      const { data } = await api.get<Shipment>(`/shipments/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateShipment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (shipment: Partial<Shipment>) => {
      const { data } = await api.post<Shipment>('/shipments/', shipment)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
    },
  })
}

export function useUpdateShipment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...shipment }: Partial<Shipment> & { id: number }) => {
      const { data } = await api.patch<Shipment>(`/shipments/${id}/`, shipment)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
    },
  })
}

// Bills of Lading
export function useBillsOfLading(params?: { status?: string; shipment?: number }) {
  return useQuery({
    queryKey: ['bols', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<BillOfLading>>('/bols/', { params })
      return data
    },
  })
}

export function useBillOfLading(id: number) {
  return useQuery({
    queryKey: ['bols', id],
    queryFn: async () => {
      const { data } = await api.get<BillOfLading>(`/bols/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateBillOfLading() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (bol: Partial<BillOfLading>) => {
      const { data } = await api.post<BillOfLading>('/bols/', bol)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bols'] })
    },
  })
}

export function useUpdateBillOfLading() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...bol }: Partial<BillOfLading> & { id: number }) => {
      const { data } = await api.patch<BillOfLading>(`/bols/${id}/`, bol)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bols'] })
    },
  })
}
