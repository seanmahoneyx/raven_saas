import { useQuery } from '@tanstack/react-query'
import api from './client'

export interface AuditEntry {
  timestamp: string
  user: string
  user_id: number | null
  action: 'Created' | 'Changed' | 'Deleted'
  model_type: string
  model_label: string
  record_label: string
  summary: string
}

export interface AuditReportResponse {
  results: AuditEntry[]
  available_models: { key: string; label: string }[]
}

export interface AuditReportParams {
  user_id?: number
  date_from?: string
  date_to?: string
  model_types?: string
  action_types?: string
  limit?: number
}

export function useUserAuditReport(params: AuditReportParams) {
  return useQuery({
    queryKey: ['user-audit', params],
    queryFn: async () => {
      const { data } = await api.get<AuditReportResponse>('/reports/user-audit/', { params })
      return data
    },
  })
}
