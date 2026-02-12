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
      const params: Record<string, string> = {}
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
      const { data } = await api.get<ItemQuickReport>(
        `/reports/item-quick-report/${itemId}/`,
        { params }
      )
      return data
    },
    enabled: !!itemId,
  })
}

// =============================================================================
// ORDERS VS INVENTORY REPORT
// =============================================================================

export interface OrdersVsInventoryItem {
  item_id: number
  item_sku: string
  item_name: string
  open_so_qty: number
  on_hand: number
  allocated: number
  available: number
  on_order: number
  incoming_po: number
  projected: number
  shortage: number
  coverage_pct: number
  status: 'ok' | 'warning' | 'critical'
}

export interface OrdersVsInventoryReport {
  count: number
  items: OrdersVsInventoryItem[]
}

export function useOrdersVsInventoryReport() {
  return useQuery({
    queryKey: ['orders-vs-inventory'],
    queryFn: async () => {
      const { data } = await api.get<OrdersVsInventoryReport>('/reports/orders-vs-inventory/')
      return data
    },
  })
}

// =============================================================================
// SALES COMMISSION REPORT
// =============================================================================

export interface SalesCommissionRep {
  rep_id: number | null
  rep_name: string
  invoice_count: number
  total_invoiced: string
  total_paid: string
  commission_rate: string
  commission_earned: string
}

export interface SalesCommissionReport {
  date_from: string | null
  date_to: string | null
  commission_rate: string
  summary: {
    total_invoiced: string
    total_paid: string
    total_commission: string
  }
  by_rep: SalesCommissionRep[]
}

export function useSalesCommissionReport(params?: { date_from?: string; date_to?: string; commission_rate?: number }) {
  return useQuery({
    queryKey: ['sales-commission', params],
    queryFn: async () => {
      const { data } = await api.get<SalesCommissionReport>('/reports/sales-commission/', { params })
      return data
    },
  })
}

// =============================================================================
// GROSS MARGIN REPORT
// =============================================================================

export interface GrossMarginCustomer {
  customer_id: number
  customer_name: string
  revenue: string
  cogs: string
  margin: string
  margin_pct: string
}

export interface GrossMarginItem {
  item_id: number
  item_sku: string
  item_name: string
  revenue: string
  cogs: string
  margin: string
  margin_pct: string
}

export interface GrossMarginSummary {
  total_revenue: string
  total_cogs: string
  gross_margin: string
  margin_pct: string
}

export interface GrossMarginReport {
  date_from: string | null
  date_to: string | null
  summary: GrossMarginSummary
  by_customer: GrossMarginCustomer[]
  by_item: GrossMarginItem[]
}

export function useGrossMarginReport(params?: { date_from?: string; date_to?: string; customer?: number; item?: number }) {
  return useQuery({
    queryKey: ['gross-margin', params],
    queryFn: async () => {
      const { data } = await api.get<GrossMarginReport>('/reports/gross-margin/', { params })
      return data
    },
    enabled: true,
  })
}

// =============================================================================
// CONTRACT UTILIZATION REPORT
// =============================================================================

export interface ContractUtilization {
  contract_id: number
  contract_number: string
  blanket_po: string
  customer_id: number
  customer_name: string
  status: string
  start_date: string | null
  end_date: string | null
  total_committed: number
  total_released: number
  total_remaining: number
  completion_pct: number
  days_remaining: number | null
  burn_rate: number | null
  projected_completion: string | null
  num_lines: number
  at_risk: boolean
}

export function useContractUtilizationReport() {
  return useQuery({
    queryKey: ['contract-utilization'],
    queryFn: async () => {
      const { data } = await api.get('/reports/contract-utilization/')
      return data
    },
  })
}

// =============================================================================
// VENDOR SCORECARD REPORT
// =============================================================================

export interface VendorScorecard {
  vendor_id: number
  vendor_name: string
  vendor_code: string
  total_pos: number
  completed_pos: number
  active_pos: number
  on_time_count: number
  late_count: number
  on_time_pct: number
  total_spend: string
  avg_lead_time_days: number | null
}

export function useVendorScorecardReport(params?: { date_from?: string; date_to?: string }) {
  return useQuery({
    queryKey: ['vendor-scorecard', params],
    queryFn: async () => {
      const { data } = await api.get('/reports/vendor-scorecard/', { params })
      return data
    },
  })
}
