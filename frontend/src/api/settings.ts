import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import type { GLAccount, PaginatedResponse, ApiError } from '@/types/api'

export interface TenantSettings {
  id: number
  company_name: string
  company_address: string
  company_phone: string
  company_email: string
  company_logo_url: string
  fiscal_year_start_month: number
  // Accounting defaults
  default_income_account: number | null
  default_cogs_account: number | null
  default_inventory_account: number | null
  default_ar_account: number | null
  default_ap_account: number | null
  default_cash_account: number | null
  default_freight_income_account: number | null
  default_freight_expense_account: number | null
  default_sales_discount_account: number | null
  default_purchase_discount_account: number | null
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api.get<TenantSettings>('/settings/')
      return data
    },
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (settings: Partial<TenantSettings>) => {
      const { data } = await api.patch<TenantSettings>('/settings/', settings)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings saved')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to save settings')
    },
  })
}

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts-all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<GLAccount>>('/accounts/', { params: { page_size: 500 } })
      return data.results
    },
  })
}
