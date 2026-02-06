import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type { PaginatedResponse } from '@/types/api'

export interface ReportDefinition {
  id: number
  name: string
  code: string
  description: string
  category: string
  sql_query: string
  parameters: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SavedReport {
  id: number
  report_definition: number
  report_name: string
  name: string
  executed_at: string
  executed_by: number
  executed_by_name: string
  parameters_used: Record<string, unknown>
  row_count: number
  file_format: 'json' | 'csv' | 'xlsx' | 'pdf'
  file_path: string
  created_at: string
}

export interface ReportSchedule {
  id: number
  report_definition: number
  report_name: string
  name: string
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week: number | null
  day_of_month: number | null
  time_of_day: string
  parameters: Record<string, unknown>
  recipients: string[]
  is_active: boolean
  last_run: string | null
  next_run: string | null
  created_at: string
}

// Report Definitions
export function useReportDefinitions(params?: { category?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['report-definitions', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ReportDefinition>>('/report-definitions/', { params })
      return data
    },
  })
}

export function useReportDefinition(id: number) {
  return useQuery({
    queryKey: ['report-definitions', id],
    queryFn: async () => {
      const { data } = await api.get<ReportDefinition>(`/report-definitions/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

// Saved Reports
export function useSavedReports(params?: { report_definition?: number }) {
  return useQuery({
    queryKey: ['saved-reports', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<SavedReport>>('/saved-reports/', { params })
      return data
    },
  })
}

// Report Schedules
export function useReportSchedules() {
  return useQuery({
    queryKey: ['report-schedules'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ReportSchedule>>('/report-schedules/')
      return data
    },
  })
}

export function useCreateReportSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (schedule: Partial<ReportSchedule>) => {
      const { data } = await api.post<ReportSchedule>('/report-schedules/', schedule)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] })
    },
  })
}

export function useUpdateReportSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...schedule }: Partial<ReportSchedule> & { id: number }) => {
      const { data } = await api.patch<ReportSchedule>(`/report-schedules/${id}/`, schedule)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] })
    },
  })
}

// Execute Report
export function useExecuteReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ reportId, parameters }: { reportId: number; parameters?: Record<string, unknown> }) => {
      const { data } = await api.post<SavedReport>(`/report-definitions/${reportId}/execute/`, { parameters })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-reports'] })
    },
  })
}

// =============================================================================
// ITEM QUICK REPORT
// =============================================================================

export interface QuickReportFinancialRow {
  date: string
  type: 'Sale' | 'Cost'
  document_number: string
  party_name: string
  quantity: number
  unit_price: number
  total: number
}

export interface QuickReportPORow {
  date: string
  po_number: string
  vendor_name: string
  status: string
  status_display: string
  quantity_ordered: number
  unit_cost: number
  line_total: number
}

export interface QuickReportSORow {
  date: string
  order_number: string
  customer_name: string
  status: string
  status_display: string
  quantity_ordered: number
  unit_price: number
  line_total: number
}

export interface QuickReportSection<T> {
  rows: T[]
  summary: Record<string, number>
}

export interface ItemQuickReport {
  item_id: number
  start_date: string
  end_date: string
  financials: QuickReportSection<QuickReportFinancialRow>
  purchase_orders: QuickReportSection<QuickReportPORow>
  sales_orders: QuickReportSection<QuickReportSORow>
}

export function useItemQuickReport(itemId: number | null, startDate: string | null, endDate: string | null) {
  return useQuery({
    queryKey: ['item-quick-report', itemId, startDate, endDate],
    queryFn: async () => {
      const { data } = await api.get<ItemQuickReport>(
        `/reports/item-quick-report/${itemId}/`,
        { params: { start_date: startDate, end_date: endDate } }
      )
      return data
    },
    enabled: !!itemId && !!startDate && !!endDate,
  })
}
