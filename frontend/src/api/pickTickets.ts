import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { fetchAllPages } from '@/lib/paginate'
import { toastApiError } from '@/lib/errors'
import type { PaginatedResponse, ApiError } from '@/types/api'
import type { Invoice } from './invoicing'

/* ─────────────────────────────────────────────────────────────────────
 * Pick Tickets (AR Pick Ticket -> partial Invoice flow)
 *
 * Mirrors the AP ItemReceipt -> Bill hook family in api/inventory.ts.
 * Backend source of truth:
 *   - apps/inventory/models.py (PickTicket, PickTicketLine)
 *   - apps/api/v1/serializers/inventory.py (PickTicket* serializers)
 *   - apps/api/v1/views/inventory.py (PickTicketViewSet)
 * ───────────────────────────────────────────────────────────────────── */

export type PickTicketStatus =
  | 'draft'
  | 'picking'
  | 'picked'
  | 'partially_invoiced'
  | 'invoiced'
  | 'shipped'
  | 'cancelled'
  | 'void'

export interface PickTicket {
  id: number
  pick_number: string
  status: PickTicketStatus
  customer: number
  customer_name: string
  customer_code: string
  warehouse: number
  warehouse_code: string
  sales_order: number | null
  sales_order_number: string | null
  picked_date: string
  num_lines: number
  subtotal: string
}

export interface PickTicketLine {
  id: number
  pick_ticket: number
  line_number: number
  sales_order_line: number | null
  item: number
  item_sku: string
  item_name: string
  quantity: number
  unit_price: string
  amount: string
  quantity_invoiced: number
  quantity_remaining_to_invoice: number
  notes: string
}

export interface PickTicketDetail extends Omit<PickTicket, 'num_lines'> {
  picked_by: number | null
  picked_by_name: string | null
  notes: string
  lines: PickTicketLine[]
  created_at: string
  updated_at: string
}

export interface PickTicketParams {
  status?: string
  customer?: number
  sales_order?: number
  warehouse?: number
  search?: string
  ordering?: string
  page?: number
}

export function usePickTickets(params?: PickTicketParams) {
  return useQuery({
    queryKey: ['pick-tickets', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<PickTicket>>('/pick-tickets/', { params })
      return data
    },
  })
}

/**
 * Fetch every pick ticket across all pages. Returns a flat array.
 */
export function useAllPickTickets(params?: Omit<PickTicketParams, 'page'>) {
  return useQuery({
    queryKey: ['pick-tickets', 'all', params],
    queryFn: () => fetchAllPages<PickTicket>(
      api, '/pick-tickets/', params as Record<string, unknown> | undefined,
    ),
    staleTime: 60_000,
  })
}

export function usePickTicket(id: number) {
  return useQuery({
    queryKey: ['pick-tickets', id],
    queryFn: async () => {
      const { data } = await api.get<PickTicketDetail>(`/pick-tickets/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

/**
 * Roll ALL uninvoiced lines of a single pick ticket into a new draft invoice.
 * Backend: POST /pick-tickets/{id}/create-invoice/
 */
export function useCreateInvoiceFromPick() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      pickId: number
      invoice_date?: string
      payment_terms?: string
      notes?: string
    }) => {
      const { pickId, ...body } = args
      const { data } = await api.post<Invoice>(`/pick-tickets/${pickId}/create-invoice/`, body)
      return data
    },
    onSuccess: (_data, { pickId }) => {
      qc.invalidateQueries({ queryKey: ['pick-tickets'] })
      qc.invalidateQueries({ queryKey: ['pick-tickets', pickId] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice created from pick ticket')
    },
    onError: (e: ApiError) => toastApiError(e, 'Failed to create invoice'),
  })
}

interface MultiPickInvoiceInput {
  customer: number
  payment_terms?: string
  invoice_date?: string
  notes?: string
  lines: Array<{
    pick_line: number
    quantity?: number
    unit_price?: string
  }>
}

/**
 * Roll selected lines (across one or more pick tickets, same customer) into a
 * new draft invoice with explicit per-line quantities.
 * Backend: POST /pick-tickets/create-multi-invoice/
 */
export function useCreateMultiInvoiceFromPicks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: MultiPickInvoiceInput) => {
      const { data } = await api.post<Invoice>('/pick-tickets/create-multi-invoice/', body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pick-tickets'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice created from pick tickets')
    },
    onError: (e: ApiError) => toastApiError(e, 'Failed to create invoice'),
  })
}
