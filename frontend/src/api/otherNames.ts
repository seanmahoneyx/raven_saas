import api from './client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/errors'

export interface OtherName {
  id: number
  name: string
  company_name: string
  print_name: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  phone: string
  email: string
  is_1099: boolean
  is_active: boolean
  notes: string
  full_address: string
  created_at: string
  updated_at: string
}

export function useOtherNames(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['other-names', params],
    queryFn: async () => {
      const { data } = await api.get('/other-names/', { params })
      return data.results ?? data
    },
  })
}

export function useOtherName(id: number | undefined) {
  return useQuery({
    queryKey: ['other-names', id],
    queryFn: async () => {
      const { data } = await api.get(`/other-names/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateOtherName() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<OtherName>) => {
      const { data } = await api.post('/other-names/', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['other-names'] })
      toast.success('Other name created')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to create')),
  })
}

export function useUpdateOtherName() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<OtherName> & { id: number }) => {
      const { data } = await api.patch(`/other-names/${id}/`, rest)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['other-names'] })
      toast.success('Other name updated')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to update')),
  })
}

export function useDeleteOtherName() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/other-names/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['other-names'] })
      toast.success('Other name deleted')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to delete')),
  })
}
