import api from './client'

export interface OrderSummary {
  id: number
  order_number: string
  status: string
  customer_name: string
  order_date: string
  scheduled_date: string | null
  customer_po: string
  num_lines: number
  subtotal: string
  priority: number
}

export interface OrderLine {
  id: number
  item_sku: string
  item_name: string
  quantity_ordered: number
  unit_price: string
  uom_code: string
  line_total: string
}

export interface OrderDetail extends OrderSummary {
  ship_to_name: string
  bill_to_name: string | null
  notes: string
  lines: OrderLine[]
  created_at: string
  updated_at: string
}

export async function fetchOrders(params: {
  status?: string
  search?: string
  page?: number
}): Promise<{ results: OrderSummary[]; count: number }> {
  const { data } = await api.get('/sales-orders/', {
    params: { ...params, page_size: 25 },
  })
  return data
}

export async function fetchOrderDetail(id: number): Promise<OrderDetail> {
  const { data } = await api.get(`/sales-orders/${id}/`)
  return data
}
