import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { getApiErrorMessage } from '@/lib/errors'
import type { PaginatedResponse, ApiError } from '@/types/api'

// ==================== Interfaces ====================

export interface LicensePlate {
  id: number
  code: string
  order: number
  order_number: string
  customer_name: string
  run: number | null
  run_name: string | null
  weight_lbs: string
  status: 'STAGED' | 'LOADED' | 'DELIVERED'
  notes: string
  created_at: string
  updated_at: string
}

export interface DeliveryStopListItem {
  id: number
  run: number
  customer: number
  customer_name: string
  address: string
  sequence: number
  status: 'PENDING' | 'ARRIVED' | 'COMPLETED' | 'SKIPPED'
  order_count: number
  signed_by: string
  delivered_at: string | null
}

export interface DeliveryStopDetail extends DeliveryStopListItem {
  orders: Array<{
    id: number
    order_number: string
    status: string
    customer_po: string
    num_lines: number
  }>
  lpns: Array<{
    id: number
    code: string
    weight_lbs: string
    status: string
  }>
  signature_image: string | null
  delivery_notes: string
  created_at: string
  updated_at: string
}

export interface DriverManifest {
  run_id: number
  run_name: string
  truck_name: string
  scheduled_date: string
  total_stops: number
  total_weight_lbs: string
  is_complete: boolean
  stops: Array<{
    id: number
    sequence: number
    status: string
    customer_name: string
    address: string
    city: string
    delivery_notes: string
    pallet_count: number
    orders: Array<{
      id: number
      order_number: string
      customer_po: string
      lines: Array<{
        item_sku: string
        item_name: string
        quantity: number
        uom_code: string
      }>
    }>
    arrived_at: string | null
    delivered_at: string | null
  }>
}

// ==================== License Plates ====================

export function useLicensePlates(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['license-plates', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<LicensePlate>>('/logistics/lpns/', { params })
      return data
    },
  })
}

export function useLicensePlate(id: number) {
  return useQuery({
    queryKey: ['license-plates', id],
    queryFn: async () => {
      const { data } = await api.get<LicensePlate>(`/logistics/lpns/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateLicensePlate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (lpn: Partial<LicensePlate>) => {
      const { data } = await api.post<LicensePlate>('/logistics/lpns/', lpn)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-plates'] })
      toast.success('License plate created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create license plate'))
    },
  })
}

export function useUpdateLicensePlate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...lpn }: Partial<LicensePlate> & { id: number }) => {
      const { data } = await api.put<LicensePlate>(`/logistics/lpns/${id}/`, lpn)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-plates'] })
      toast.success('License plate updated')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to update license plate'))
    },
  })
}

export function useDeleteLicensePlate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/logistics/lpns/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-plates'] })
      toast.success('License plate deleted')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete license plate'))
    },
  })
}

// ==================== Delivery Stops ====================

export function useDeliveryStops(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['delivery-stops', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<DeliveryStopListItem>>('/logistics/stops/', { params })
      return data
    },
  })
}

export function useDeliveryStop(id: number) {
  return useQuery({
    queryKey: ['delivery-stops', id],
    queryFn: async () => {
      const { data } = await api.get<DeliveryStopDetail>(`/logistics/stops/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useArriveAtStop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; gps_lat?: number; gps_lng?: number }) => {
      const { data } = await api.post(`/logistics/stops/${id}/arrive/`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-stops'] })
      toast.success('Arrived at stop')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to record arrival'))
    },
  })
}

export function useSignDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: number
      signature_base64: string
      signed_by: string
      photo_base64?: string
      gps_lat?: number
      gps_lng?: number
      delivery_notes?: string
    }) => {
      const { data } = await api.post(`/logistics/stops/${id}/sign/`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-stops'] })
      toast.success('Delivery signed')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to sign delivery'))
    },
  })
}

// ==================== Delivery Runs ====================

export function useInitializeRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (runId: number) => {
      const { data } = await api.post(`/logistics/runs/${runId}/initialize/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-stops'] })
      toast.success('Run initialized')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to initialize run'))
    },
  })
}

export function useDriverManifest() {
  return useQuery({
    queryKey: ['driver-manifest'],
    queryFn: async () => {
      const { data } = await api.get<DriverManifest>('/logistics/my-run/')
      return data
    },
  })
}

export function useStartRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/logistics/my-run/')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-manifest'] })
      toast.success('Run started')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to start run'))
    },
  })
}

export function useManifestPDF(runId: number) {
  return useQuery({
    queryKey: ['manifest-pdf', runId],
    queryFn: async () => {
      const { data } = await api.get(`/logistics/runs/${runId}/manifest-pdf/`, {
        responseType: 'blob',
      })
      return data as Blob
    },
    enabled: !!runId,
  })
}
