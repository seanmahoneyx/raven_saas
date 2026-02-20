import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import type { Party, Customer, Vendor, Location, Truck, PaginatedResponse, TimelineEvent, CustomerAttachment, ApiError } from '@/types/api'

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
      toast.success('Party created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create party')
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
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to save changes')
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
      toast.success('Deleted successfully')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete')
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
      toast.success('Customer created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create customer')
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...customer }: Partial<Customer> & { id: number }) => {
      const { data } = await api.patch<Customer>(`/customers/${id}/`, customer)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['parties'] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to save changes')
    },
  })
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/customers/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['parties'] })
      toast.success('Customer deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete customer')
    },
  })
}

export function useDuplicateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Customer>(`/customers/${id}/duplicate/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['parties'] })
      toast.success('Customer duplicated')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to duplicate customer')
    },
  })
}

// Customer Timeline
export function useCustomerTimeline(customerId: number, typeFilter?: string) {
  return useQuery({
    queryKey: ['customers', customerId, 'timeline', typeFilter],
    queryFn: async () => {
      const params = typeFilter ? { type: typeFilter } : undefined
      const { data } = await api.get<TimelineEvent[]>(`/customers/${customerId}/timeline/`, { params })
      return data
    },
    enabled: !!customerId,
  })
}

// Customer Attachments
export function useCustomerAttachments(customerId: number) {
  return useQuery({
    queryKey: ['customers', customerId, 'attachments'],
    queryFn: async () => {
      const { data } = await api.get<CustomerAttachment[]>(`/customers/${customerId}/attachments/`)
      return data
    },
    enabled: !!customerId,
  })
}

export function useUploadCustomerAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ customerId, file, category, description }: {
      customerId: number
      file: File
      category?: string
      description?: string
    }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (category) formData.append('category', category)
      if (description) formData.append('description', description)
      const { data } = await api.post<CustomerAttachment>(
        `/customers/${customerId}/attachments/`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customers', variables.customerId, 'attachments'] })
      toast.success('File uploaded')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to upload file')
    },
  })
}

export function useDeleteCustomerAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ customerId, attachmentId }: { customerId: number; attachmentId: number }) => {
      await api.delete(`/customers/${customerId}/attachments/${attachmentId}/`)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customers', variables.customerId, 'attachments'] })
      toast.success('File deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete file')
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
      toast.success('Vendor created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create vendor')
    },
  })
}

export function useUpdateVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...vendor }: Partial<Vendor> & { id: number }) => {
      const { data } = await api.patch<Vendor>(`/vendors/${id}/`, vendor)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['parties'] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to save changes')
    },
  })
}

export function useDeleteVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/vendors/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['parties'] })
      toast.success('Vendor deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete vendor')
    },
  })
}

export function useDuplicateVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Vendor>(`/vendors/${id}/duplicate/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['parties'] })
      toast.success('Vendor duplicated')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to duplicate vendor')
    },
  })
}

// Vendor Timeline
export function useVendorTimeline(vendorId: number, typeFilter?: string) {
  return useQuery({
    queryKey: ['vendors', vendorId, 'timeline', typeFilter],
    queryFn: async () => {
      const params = typeFilter ? { type: typeFilter } : undefined
      const { data } = await api.get<TimelineEvent[]>(`/vendors/${vendorId}/timeline/`, { params })
      return data
    },
    enabled: !!vendorId,
  })
}

// Vendor Attachments
export function useVendorAttachments(vendorId: number) {
  return useQuery({
    queryKey: ['vendors', vendorId, 'attachments'],
    queryFn: async () => {
      const { data } = await api.get<CustomerAttachment[]>(`/vendors/${vendorId}/attachments/`)
      return data
    },
    enabled: !!vendorId,
  })
}

export function useUploadVendorAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vendorId, file, category, description }: {
      vendorId: number
      file: File
      category?: string
      description?: string
    }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (category) formData.append('category', category)
      if (description) formData.append('description', description)
      const { data } = await api.post<CustomerAttachment>(
        `/vendors/${vendorId}/attachments/`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vendors', variables.vendorId, 'attachments'] })
      toast.success('File uploaded')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to upload file')
    },
  })
}

export function useDeleteVendorAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vendorId, attachmentId }: { vendorId: number; attachmentId: number }) => {
      await api.delete(`/vendors/${vendorId}/attachments/${attachmentId}/`)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vendors', variables.vendorId, 'attachments'] })
      toast.success('File deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete file')
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
      toast.success('Location created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create location')
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
      toast.success('Location updated')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to update location')
    },
  })
}

export function useDeleteLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/locations/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      toast.success('Location deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete location')
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
      toast.success('Truck created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create truck')
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
      toast.success('Truck updated')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to update truck')
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
      toast.success('Truck deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete truck')
    },
  })
}
