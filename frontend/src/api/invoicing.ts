import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { getApiErrorMessage, toastApiError } from '@/lib/errors'
import { fetchAllPages } from '@/lib/paginate'
import type { PaginatedResponse, ApiError } from '@/types/api'

export interface Invoice {
  id: number
  invoice_number: string
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void' | 'posted' | 'written_off'
  customer: number
  customer_name: string
  invoice_date: string
  due_date: string
  payment_terms?: string
  subtotal: string
  tax_rate?: string
  tax_amount: string
  total_amount: string
  amount_paid: string
  balance_due: string
  is_overdue?: boolean
  is_paid?: boolean
  notes: string
  sales_order?: number | null
  lines?: Array<{
    item?: number
    description?: string
    quantity?: number
    unit_price?: string
  }>
  created_at: string
  updated_at: string
}

export interface Payment {
  id: number
  invoice: number
  invoice_number: string
  payment_date: string
  amount: string
  payment_method: 'CHECK' | 'ACH' | 'WIRE' | 'CREDIT_CARD' | 'CASH' | 'CREDIT_MEMO' | 'OTHER'
  reference_number: string
  notes: string
  created_at: string
  updated_at: string
}

// Invoices
export function useInvoices(params?: { invoice_type?: string; status?: string }) {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Invoice>>('/invoices/', { params })
      return data
    },
  })
}

export function useInvoice(id: number) {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn: async () => {
      const { data } = await api.get<Invoice>(`/invoices/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invoice: Partial<Invoice>) => {
      const { data } = await api.post<Invoice>('/invoices/', invoice)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create invoice'))
    },
  })
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...invoice }: Partial<Invoice> & { id: number }) => {
      const { data } = await api.patch<Invoice>(`/invoices/${id}/`, invoice)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice updated')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to update invoice'))
    },
  })
}

// Payments
export function usePayments(params?: { invoice?: number }) {
  return useQuery({
    queryKey: ['payments', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Payment>>('/payments/', { params })
      return data
    },
  })
}

export function useCreatePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: Partial<Payment>) => {
      const { data } = await api.post<Payment>('/payments/', payment)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Payment recorded')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to record payment'))
    },
  })
}

/* ─────────────────────────────────────────────────────────────────────
 * Vendor Bills (Accounts Payable)
 *
 * Mirrors the Invoice/Payment hook family. Backend source of truth:
 *   - apps/invoicing/models.py (VendorBill, VendorBillLine, BillPayment)
 *   - apps/api/v1/serializers/invoicing.py (VendorBill* + BillPaymentSerializer)
 * ───────────────────────────────────────────────────────────────────── */

export interface Bill {
  id: number
  bill_number: string
  invoice_type: 'AP'
  vendor: number
  vendor_name: string
  vendor_code: string
  purchase_order: number | null
  vendor_invoice_number: string
  bill_date: string
  due_date: string
  status: 'draft' | 'posted' | 'paid' | 'partial' | 'void'
  ap_account: number | null
  journal_entry: number | null
  subtotal: string
  tax_amount: string
  total_amount: string
  amount_paid: string
  balance_due: string
  is_paid?: boolean
  notes: string
  created_at: string
  updated_at: string
}

export interface BillLine {
  id: number
  bill: number
  line_number: number
  item: number | null
  item_sku: string | null
  description: string
  expense_account: number | null
  expense_account_code: string | null
  quantity: string
  unit_price: string
  amount: string
  purchase_order_line: number | null
}

export interface BillDetail extends Bill {
  lines: BillLine[]
  payments: BillPayment[]
}

export interface BillPayment {
  id: number
  bill: number
  bill_number: string
  vendor_name: string
  payment_date: string
  amount: string
  payment_method: 'CHECK' | 'ACH' | 'WIRE' | 'CREDIT_CARD' | 'CASH' | 'DEBIT_MEMO' | 'OTHER'
  reference_number: string
  notes: string
  recorded_by: number | null
  recorded_by_name: string | null
  created_at: string
  updated_at: string
}

// Bills (list / detail / mutations)
export function useBills(params?: {
  status?: string
  vendor?: number
  purchase_order?: number
  search?: string
  ordering?: string
  page?: number
}) {
  return useQuery({
    queryKey: ['bills', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Bill>>('/bills/', { params })
      return data
    },
  })
}

/**
 * Fetch every bill across all pages. Returns a flat array.
 */
export function useAllBills(params?: {
  status?: string
  vendor?: number
  purchase_order?: number
  search?: string
  ordering?: string
}) {
  return useQuery({
    queryKey: ['bills', 'all', params],
    queryFn: () => fetchAllPages<Bill>(api, '/bills/', params as Record<string, unknown> | undefined),
    staleTime: 60_000,
  })
}

export function useBill(id: number) {
  return useQuery({
    queryKey: ['bills', id],
    queryFn: async () => {
      const { data } = await api.get<BillDetail>(`/bills/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (bill: Partial<Bill> & { lines?: Partial<BillLine>[] }) => {
      const { data } = await api.post<BillDetail>('/bills/', bill)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      toast.success('Bill created')
    },
    onError: (error: ApiError) => {
      toastApiError(error, 'Failed to create bill')
    },
  })
}

export function useUpdateBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...bill }: Partial<Bill> & { id: number }) => {
      const { data } = await api.patch<Bill>(`/bills/${id}/`, bill)
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['bills', variables.id] })
      toast.success('Bill updated')
    },
    onError: (error: ApiError) => {
      toastApiError(error, 'Failed to update bill')
    },
  })
}

export function usePostBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Bill>(`/bills/${id}/post/`)
      return data
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['bills', id] })
      toast.success('Bill posted')
    },
    onError: (error: ApiError) => {
      toastApiError(error, 'Failed to post bill')
    },
  })
}

export function useVoidBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Bill>(`/bills/${id}/void/`)
      return data
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['bills', id] })
      toast.success('Bill voided')
    },
    onError: (error: ApiError) => {
      toastApiError(error, 'Failed to void bill')
    },
  })
}

// Bill Lines (add / edit / delete on draft bills)
export function useAddBillLine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ billId, line }: { billId: number; line: Partial<BillLine> }) => {
      const { data } = await api.post<BillLine>(`/bills/${billId}/lines/`, line)
      return data
    },
    onSuccess: (_data, { billId }) => {
      queryClient.invalidateQueries({ queryKey: ['bills', billId] })
      toast.success('Line added')
    },
    onError: (error: ApiError) => {
      toastApiError(error, 'Failed to add line')
    },
  })
}

export function useUpdateBillLine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ billId, lineId, patch }: { billId: number; lineId: number; patch: Partial<BillLine> }) => {
      const { data } = await api.patch<BillLine>(`/bills/${billId}/lines/${lineId}/`, patch)
      return data
    },
    onSuccess: (_data, { billId }) => {
      queryClient.invalidateQueries({ queryKey: ['bills', billId] })
    },
    onError: (error: ApiError) => {
      toastApiError(error, 'Failed to update line')
    },
  })
}

export function useDeleteBillLine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ billId, lineId }: { billId: number; lineId: number }) => {
      await api.delete(`/bills/${billId}/lines/${lineId}/`)
    },
    onSuccess: (_data, { billId }) => {
      queryClient.invalidateQueries({ queryKey: ['bills', billId] })
      toast.success('Line removed')
    },
    onError: (error: ApiError) => {
      toastApiError(error, 'Failed to remove line')
    },
  })
}

// Bill Payments
export function useBillPayments(billId: number) {
  return useQuery({
    queryKey: ['bills', billId, 'payments'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<BillPayment>>(`/bills/${billId}/payments/`)
      return data
    },
    enabled: !!billId,
  })
}

export function useAllBillPayments(params?: { bill?: number }) {
  return useQuery({
    queryKey: ['bill-payments', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<BillPayment>>('/bill-payments/', { params })
      return data
    },
  })
}

export function useCreateBillPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: Partial<BillPayment>) => {
      const { data } = await api.post<BillPayment>('/bill-payments/', payment)
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bill-payments'] })
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      if (variables.bill) {
        queryClient.invalidateQueries({ queryKey: ['bills', variables.bill] })
        queryClient.invalidateQueries({ queryKey: ['bills', variables.bill, 'payments'] })
      }
      toast.success('Payment recorded')
    },
    onError: (error: ApiError) => {
      toastApiError(error, 'Failed to record payment')
    },
  })
}
