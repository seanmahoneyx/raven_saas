import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { getApiErrorMessage } from '@/lib/errors'
import type { Contact, PaginatedResponse, ApiError } from '@/types/api'

export function useContacts(partyId?: number) {
  return useQuery({
    queryKey: ['contacts', { party: partyId }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Contact>>('/contacts/', {
        params: { party: partyId },
      })
      return data
    },
    enabled: !!partyId,
  })
}

export function useContact(id: number) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: async () => {
      const { data } = await api.get<Contact>(`/contacts/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (contact: Partial<Contact>) => {
      const { data } = await api.post<Contact>('/contacts/', contact)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create contact'))
    },
  })
}

export function useUpdateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...contact }: Partial<Contact> & { id: number }) => {
      const { data } = await api.patch<Contact>(`/contacts/${id}/`, contact)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.id] })
      toast.success('Contact updated')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to update contact'))
    },
  })
}

export function useDeleteContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/contacts/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact deleted')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete contact'))
    },
  })
}
