import api from './client'

interface CreateEstimatePayload {
  customer: number
  date: string
  lines: Array<{
    item: number
    quantity: number
    unit_price: string
    uom: number
    description: string
    line_number: number
  }>
}

interface EstimateResponse {
  id: number
  estimate_number: string
  status: string
  customer: number
  customer_name: string
  date: string
  subtotal: string
  total_amount: string
}

export async function createEstimate(payload: CreateEstimatePayload): Promise<EstimateResponse> {
  const { data } = await api.post('/estimates/', payload)
  return data
}

export async function sendEstimate(estimateId: number): Promise<void> {
  await api.post(`/estimates/${estimateId}/send-email/`)
}

export async function searchItems(query: string) {
  const { data } = await api.get('/items/', { params: { search: query, page_size: 20 } })
  return data.results ?? data
}

export async function searchCustomers(query: string) {
  const { data } = await api.get('/customers/', { params: { search: query, page_size: 20 } })
  return data.results ?? data
}
