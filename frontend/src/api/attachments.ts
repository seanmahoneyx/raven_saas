import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'

export interface Attachment {
  id: number
  content_type: number
  content_type_name: string
  object_id: number
  file: string
  filename: string
  mime_type: string
  file_size: number
  category: string
  uploaded_by: number | null
  uploaded_by_name: string | null
  description: string
  download_url: string | null
  created_at: string
  updated_at: string
}

export function useAttachments(appLabel: string, modelName: string, objectId: number) {
  return useQuery({
    queryKey: ['attachments', appLabel, modelName, objectId],
    queryFn: async () => {
      const { data } = await api.get<Attachment[]>('/attachments/for-object/', {
        params: { app_label: appLabel, model: modelName, object_id: objectId },
      })
      return data
    },
    enabled: !!objectId,
  })
}

export function useUploadAttachment(appLabel: string, modelName: string, objectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, description }: { file: File; description?: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('filename', file.name)
      formData.append('content_type_app', appLabel)
      formData.append('content_type_model', modelName)
      formData.append('object_id', String(objectId))
      if (description) formData.append('description', description)

      const { data } = await api.post<Attachment>('/attachments/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', appLabel, modelName, objectId] })
      toast.success('File uploaded')
    },
    onError: () => {
      toast.error('Upload failed')
    },
  })
}

export function useDeleteAttachment(appLabel: string, modelName: string, objectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (attachmentId: number) => {
      await api.delete(`/attachments/${attachmentId}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', appLabel, modelName, objectId] })
      toast.success('Attachment deleted')
    },
    onError: () => {
      toast.error('Failed to delete attachment')
    },
  })
}
