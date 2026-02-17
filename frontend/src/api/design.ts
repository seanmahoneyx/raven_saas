import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import type {
  DesignRequest,
  DesignRequestInput,
  PromoteDesignInput,
  PaginatedResponse,
  CustomerAttachment,
  ApiError,
} from '@/types/api'

// ==================== Design Requests ====================

export function useDesignRequests(params?: {
  search?: string
  status?: string
  customer?: number
  assigned_to?: number
}) {
  return useQuery({
    queryKey: ['design-requests', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<DesignRequest>>('/design-requests/', { params })
      return data
    },
  })
}

export function useDesignRequest(id: number) {
  return useQuery({
    queryKey: ['design-requests', id],
    queryFn: async () => {
      const { data } = await api.get<DesignRequest>(`/design-requests/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateDesignRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: DesignRequestInput) => {
      const { data } = await api.post<DesignRequest>('/design-requests/', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-requests'] })
      toast.success('Design request created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create design request')
    },
  })
}

export function useUpdateDesignRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<DesignRequestInput> & { id: number }) => {
      const { data } = await api.patch<DesignRequest>(`/design-requests/${id}/`, input)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['design-requests'] })
      queryClient.invalidateQueries({ queryKey: ['design-requests', variables.id] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to save changes')
    },
  })
}

export function useDeleteDesignRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/design-requests/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-requests'] })
      toast.success('Design request deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete design request')
    },
  })
}

export function usePromoteDesign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: PromoteDesignInput & { id: number }) => {
      const { data } = await api.post<DesignRequest>(`/design-requests/${id}/promote/`, payload)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['design-requests'] })
      queryClient.invalidateQueries({ queryKey: ['design-requests', variables.id] })
      // Also invalidate items since we created one
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Design promoted to item')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to promote design')
    },
  })
}

// ==================== Design Request Attachments ====================

export function useDesignRequestAttachments(designRequestId: number) {
  return useQuery({
    queryKey: ['design-requests', designRequestId, 'attachments'],
    queryFn: async () => {
      const { data } = await api.get<CustomerAttachment[]>(`/design-requests/${designRequestId}/attachments/`)
      return data
    },
    enabled: !!designRequestId,
  })
}

export function useUploadDesignRequestAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ designRequestId, file, category, description }: {
      designRequestId: number
      file: File
      category?: string
      description?: string
    }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (category) formData.append('category', category)
      if (description) formData.append('description', description)
      const { data } = await api.post<CustomerAttachment>(
        `/design-requests/${designRequestId}/attachments/`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['design-requests', variables.designRequestId, 'attachments'] })
      toast.success('File uploaded')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to upload file')
    },
  })
}

export function useDeleteDesignRequestAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ designRequestId, attachmentId }: { designRequestId: number; attachmentId: number }) => {
      await api.delete(`/design-requests/${designRequestId}/attachments/${attachmentId}/`)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['design-requests', variables.designRequestId, 'attachments'] })
      toast.success('File deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete file')
    },
  })
}

export function useCreateEstimateFromDesign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, quantity, unit_price, notes }: { id: number; quantity?: number; unit_price?: string; notes?: string }) => {
      const { data } = await api.post(`/design-requests/${id}/create-estimate/`, { quantity, unit_price, notes })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-requests'] })
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      toast.success('Estimate created from design')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create estimate')
    },
  })
}
