import api from './client'

export interface OrderLine {
  item_sku: string
  item_name: string
  quantity: number
  uom_code: string
}

export interface StopOrder {
  id: number
  order_number: string
  customer_po: string
  lines: OrderLine[]
}

export interface ManifestStop {
  id: number
  sequence: number
  status: 'PENDING' | 'ARRIVED' | 'COMPLETED' | 'SKIPPED'
  customer_name: string
  address: string
  city: string
  delivery_notes: string
  pallet_count: number
  orders: StopOrder[]
  arrived_at: string | null
  delivered_at: string | null
}

export interface DriverRun {
  run_id: number
  run_name: string
  truck_name: string
  scheduled_date: string
  total_stops: number
  total_weight_lbs: string
  is_complete: boolean
  stops: ManifestStop[]
}

export interface PODPayload {
  signature_base64: string
  signed_by: string
  photo_base64?: string
  gps_lat?: number
  gps_lng?: number
  delivery_notes?: string
}

export const driverApi = {
  getMyRun: async (): Promise<DriverRun> => {
    const { data } = await api.get('/logistics/my-run/')
    return data
  },

  startRun: async (): Promise<void> => {
    await api.post('/logistics/my-run/')
  },

  arriveAtStop: async (stopId: number, gps?: { lat: number; lng: number }): Promise<void> => {
    await api.post(`/logistics/stops/${stopId}/arrive/`, {
      gps_lat: gps?.lat ?? null,
      gps_lng: gps?.lng ?? null,
    })
  },

  signDelivery: async (stopId: number, payload: PODPayload): Promise<void> => {
    await api.post(`/logistics/stops/${stopId}/sign/`, payload)
  },
}
