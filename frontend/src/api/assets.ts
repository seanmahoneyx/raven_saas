import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { getApiErrorMessage } from '@/lib/errors'
import type { ApiError, PaginatedResponse } from '@/types/api'

export interface AssetCategory {
  id: number
  name: string
  code: string
  asset_account: number
  depreciation_expense_account: number
  accumulated_depreciation_account: number
  default_useful_life_months: number
  default_depreciation_method: string
  default_salvage_rate: string
  created_at: string
  updated_at: string
}

export interface FixedAsset {
  id: number
  asset_number: string
  description: string
  category: number
  category_name: string
  status: 'active' | 'fully_depreciated' | 'disposed' | 'written_off'
  serial_number: string
  location: string
  acquisition_date: string
  acquisition_cost: string
  vendor: number | null
  vendor_name: string | null
  depreciation_method: string
  useful_life_months: number
  salvage_value: string
  depreciation_start_date: string
  accumulated_depreciation: string
  net_book_value: string
  depreciable_amount: string
  is_fully_depreciated: boolean
  remaining_life_months: number
  monthly_depreciation: string
  disposal_date: string | null
  disposal_amount: string | null
  disposal_method: string
  notes: string
  depreciation_entries: DepreciationEntry[]
  transactions: AssetTransaction[]
  prev_id: number | null
  next_id: number | null
  created_at: string
  updated_at: string
}

export interface DepreciationEntry {
  id: number
  asset: number
  period_date: string
  amount: string
  accumulated_after: string
  net_book_value_after: string
  journal_entry: number | null
  created_at: string
}

export interface AssetTransaction {
  id: number
  asset: number
  transaction_type: string
  transaction_date: string
  amount: string
  description: string
  from_location: string
  to_location: string
  performed_by_name: string | null
  created_at: string
}

// ==================== Asset Categories ====================

export function useAssetCategories() {
  return useQuery({
    queryKey: ['asset-categories'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<AssetCategory>>('/asset-categories/')
      return data
    },
  })
}

export function useAssetCategory(id: number) {
  return useQuery({
    queryKey: ['asset-categories', id],
    queryFn: async () => {
      const { data } = await api.get<AssetCategory>(`/asset-categories/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateAssetCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (category: Partial<AssetCategory>) => {
      const { data } = await api.post<AssetCategory>('/asset-categories/', category)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-categories'] })
      toast.success('Asset category created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create asset category'))
    },
  })
}

export function useUpdateAssetCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...category }: Partial<AssetCategory> & { id: number }) => {
      const { data } = await api.patch<AssetCategory>(`/asset-categories/${id}/`, category)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-categories'] })
      toast.success('Asset category updated')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to update asset category'))
    },
  })
}

// ==================== Fixed Assets ====================

export function useFixedAssets(params?: { status?: string; category?: number }) {
  return useQuery({
    queryKey: ['fixed-assets', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<FixedAsset>>('/fixed-assets/', { params })
      return data
    },
  })
}

export function useFixedAsset(id: number) {
  return useQuery({
    queryKey: ['fixed-assets', id],
    queryFn: async () => {
      const { data } = await api.get<FixedAsset>(`/fixed-assets/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateFixedAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (asset: Partial<FixedAsset>) => {
      const { data } = await api.post<FixedAsset>('/fixed-assets/', asset)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      toast.success('Fixed asset created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create fixed asset'))
    },
  })
}

export function useUpdateFixedAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...asset }: Partial<FixedAsset> & { id: number }) => {
      const { data } = await api.patch<FixedAsset>(`/fixed-assets/${id}/`, asset)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to save changes'))
    },
  })
}

export function useDeleteFixedAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/fixed-assets/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      toast.success('Fixed asset deleted')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete fixed asset'))
    },
  })
}

export function useDisposeAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; disposal_date: string; disposal_amount: string; disposal_method: string; disposal_notes?: string }) => {
      const { data } = await api.post(`/fixed-assets/${id}/dispose/`, body)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      queryClient.invalidateQueries({ queryKey: ['fixed-assets', variables.id] })
      toast.success('Asset disposed successfully')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to dispose asset'))
    },
  })
}

// ==================== Depreciation ====================

export function useDepreciationSchedule(id: number) {
  return useQuery({
    queryKey: ['fixed-assets', id, 'depreciation-schedule'],
    queryFn: async () => {
      const { data } = await api.get<DepreciationEntry[]>(`/fixed-assets/${id}/depreciation_schedule/`)
      return data
    },
    enabled: !!id,
  })
}

export function useRunDepreciation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { period_date: string }) => {
      const { data } = await api.post<{ assets_processed: number; total_depreciation: string }>('/fixed-assets/run-depreciation/', body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      toast.success('Depreciation run completed')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to run depreciation'))
    },
  })
}
