import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import type { PaginatedResponse, ApiError } from '@/types/api'

export interface Invoice {
  id: number
  invoice_number: string
  invoice_type: 'AR' | 'AP'
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void'
  party: number
  party_name: string
  invoice_date: string
  due_date: string
  subtotal: string
  tax_amount: string
  total_amount: string
  amount_paid: string
  balance_due: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Payment {
  id: number
  payment_number: string
  invoice: number
  invoice_number: string
  payment_date: string
  amount: string
  payment_method: 'check' | 'ach' | 'wire' | 'credit_card' | 'cash' | 'other'
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
      toast.error(error?.response?.data?.detail || 'Failed to create invoice')
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
      toast.error(error?.response?.data?.detail || 'Failed to update invoice')
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
      toast.error(error?.response?.data?.detail || 'Failed to record payment')
    },
  })
}
