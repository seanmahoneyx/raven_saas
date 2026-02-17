import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import type { GLAccount, JournalEntry, JournalEntryInput, PaginatedResponse, ApiError } from '@/types/api'

export function useAccounts(params?: { search?: string; account_type?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['accounts', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<GLAccount>>('/accounts/', { params })
      return data
    },
  })
}

export function useAccount(id: number) {
  return useQuery({
    queryKey: ['accounts', id],
    queryFn: async () => {
      const { data } = await api.get<GLAccount>(`/accounts/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (account: Partial<GLAccount>) => {
      const { data } = await api.post<GLAccount>('/accounts/', account)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Account created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create account')
    },
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<GLAccount> & { id: number }) => {
      const { data } = await api.patch<GLAccount>(`/accounts/${id}/`, input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Account updated')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to update account')
    },
  })
}

export function useJournalEntries(params?: { status?: string; entry_type?: string }) {
  return useQuery({
    queryKey: ['journal-entries', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<JournalEntry>>('/journal-entries/', { params })
      return data
    },
  })
}

export function useJournalEntry(id: number) {
  return useQuery({
    queryKey: ['journal-entries', id],
    queryFn: async () => {
      const { data } = await api.get<JournalEntry>(`/journal-entries/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entry: JournalEntryInput) => {
      const { data } = await api.post<JournalEntry>('/journal-entries/', entry)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      toast.success('Journal entry created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create journal entry')
    },
  })
}

export function usePostJournalEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<JournalEntry>(`/journal-entries/${id}/post/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Journal entry posted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to post journal entry')
    },
  })
}

export function useReverseJournalEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reversal_date, memo }: { id: number; reversal_date?: string; memo?: string }) => {
      const { data } = await api.post<JournalEntry>(`/journal-entries/${id}/reverse/`, { reversal_date, memo })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Journal entry reversed')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to reverse journal entry')
    },
  })
}
