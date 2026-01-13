import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type { Party, Customer, Vendor, Location, Truck, PaginatedResponse } from '@/types/api'

// Parties
export function useParties(params?: { search?: string; party_type?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['parties', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Party>>('/parties/', { params })
      return data
    },
  })
}

export function useParty(id: number) {
  return useQuery({
    queryKey: ['parties', id],
    queryFn: async () => {
      const { data } = await api.get<Party>(`/parties/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (party: Partial<Party>) => {
      const { data } = await api.post<Party>('/parties/', party)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}

export function useUpdateParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...party }: Partial<Party> & { id: number }) => {
      const { data } = await api.patch<Party>(`/parties/${id}/`, party)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}

export function useDeleteParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/parties/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}

// Customers
export function useCustomers(params?: { search?: string }) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Customer>>('/customers/', { params })
      return data
    },
  })
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: async () => {
      const { data } = await api.get<Customer>(`/customers/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (customer: Partial<Customer>) => {
      const { data } = await api.post<Customer>('/customers/', customer)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}

// Vendors
export function useVendors(params?: { search?: string }) {
  return useQuery({
    queryKey: ['vendors', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Vendor>>('/vendors/', { params })
      return data
    },
  })
}

export function useVendor(id: number) {
  return useQuery({
    queryKey: ['vendors', id],
    queryFn: async () => {
      const { data } = await api.get<Vendor>(`/vendors/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vendor: Partial<Vendor>) => {
      const { data } = await api.post<Vendor>('/vendors/', vendor)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}

// Locations
export function useLocations(partyId?: number) {
  return useQuery({
    queryKey: ['locations', partyId],
    queryFn: async () => {
      const params = partyId ? { party: partyId } : undefined
      const { data } = await api.get<PaginatedResponse<Location>>('/locations/', { params })
      return data
    },
  })
}

export function useCreateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (location: Partial<Location>) => {
      const { data } = await api.post<Location>('/locations/', location)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })
}

export function useUpdateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...location }: Partial<Location> & { id: number }) => {
      const { data } = await api.patch<Location>(`/locations/${id}/`, location)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })
}

// Trucks
export function useTrucks() {
  return useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Truck>>('/trucks/')
      return data
    },
  })
}

export function useCreateTruck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (truck: Partial<Truck>) => {
      const { data } = await api.post<Truck>('/trucks/', truck)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      queryClient.invalidateQueries({ queryKey: ['calendar', 'trucks'] })
    },
  })
}

export function useUpdateTruck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...truck }: Partial<Truck> & { id: number }) => {
      const { data } = await api.patch<Truck>(`/trucks/${id}/`, truck)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      queryClient.invalidateQueries({ queryKey: ['calendar', 'trucks'] })
    },
  })
}

export function useDeleteTruck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/trucks/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      queryClient.invalidateQueries({ queryKey: ['calendar', 'trucks'] })
    },
  })
}
