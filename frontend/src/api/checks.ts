import api from './client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/errors'

export interface Check {
  id: number
  check_number: number | null
  status: 'draft' | 'printed' | 'voided' | 'cleared'
  check_date: string
  payee_name: string
  payee_address: string
  amount: string
  memo: string
  vendor: number | null
  vendor_name: string | null
  other_name: number | null
  other_name_display: string | null
  bank_account: number
  bank_account_name: string
  bill_payment: number | null
  journal_entry: number | null
  printed_at: string | null
  printed_by: number | null
  printed_by_name: string | null
  voided_at: string | null
  void_reason: string
  created_at: string
  updated_at: string
}

export function useChecks(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['checks', params],
    queryFn: async () => {
      const { data } = await api.get('/checks/', { params })
      return data.results ?? data
    },
  })
}

export function useCheck(id: number | undefined) {
  return useQuery({
    queryKey: ['checks', id],
    queryFn: async () => {
      const { data } = await api.get(`/checks/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<Check>) => {
      const { data } = await api.post('/checks/', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checks'] })
      toast.success('Check created')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to create check')),
  })
}

export function useUpdateCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Check> & { id: number }) => {
      const { data } = await api.patch(`/checks/${id}/`, rest)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checks'] })
      toast.success('Check updated')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to update check')),
  })
}

export function useDeleteCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/checks/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checks'] })
      toast.success('Check deleted')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to delete check')),
  })
}

export function usePrintCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/checks/${id}/print_check/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checks'] })
      toast.success('Check printed and numbered')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to print check')),
  })
}

export function useVoidCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const { data } = await api.post(`/checks/${id}/void/`, { reason })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checks'] })
      toast.success('Check voided')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to void check')),
  })
}
