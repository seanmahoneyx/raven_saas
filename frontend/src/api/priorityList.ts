import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import type {
  PriorityListResponse,
  VendorKickAllotment,
  DailyKickOverride,
  PriorityLinePriority,
  ReorderLinesInput,
  MoveLineInput,
  VendorAllotmentInput,
  DailyOverrideInput,
  ClearOverrideInput,
} from '@/types/api'

// Polling interval (30 seconds)
const SYNC_INTERVAL = 30000

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const priorityListKeys = {
  all: ['priority-list'] as const,
  list: (startDate: string, endDate: string, vendorId?: number | null) =>
    [...priorityListKeys.all, 'list', startDate, endDate, vendorId] as const,
  allotments: (vendorId?: number | null) =>
    [...priorityListKeys.all, 'allotments', vendorId] as const,
  overrides: (vendorId?: number | null, startDate?: string, endDate?: string) =>
    [...priorityListKeys.all, 'overrides', vendorId, startDate, endDate] as const,
}

// ─── Priority List Queries ───────────────────────────────────────────────────

/**
 * Fetch grouped priority list data for a date range.
 * Returns PO lines grouped by Vendor -> Date -> Box Type.
 */
export function usePriorityList(
  startDate: string,
  endDate: string,
  vendorId?: number | null
) {
  return useQuery({
    queryKey: priorityListKeys.list(startDate, endDate, vendorId),
    queryFn: async () => {
      const params: Record<string, string> = {
        start_date: startDate,
        end_date: endDate,
      }
      if (vendorId) {
        params.vendor_id = String(vendorId)
      }
      const { data } = await api.get<PriorityListResponse>('/priority-list/', { params })
      return data
    },
    enabled: !!startDate && !!endDate,
    refetchInterval: SYNC_INTERVAL,
  })
}

/**
 * Fetch vendor kick allotments.
 */
export function useVendorAllotments(vendorId?: number | null) {
  return useQuery({
    queryKey: priorityListKeys.allotments(vendorId),
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (vendorId) {
        params.vendor_id = String(vendorId)
      }
      const { data } = await api.get<VendorKickAllotment[]>('/priority-list/allotments/', { params })
      return data
    },
  })
}

/**
 * Fetch daily kick overrides for a date range.
 */
export function useDailyOverrides(
  vendorId?: number | null,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: priorityListKeys.overrides(vendorId, startDate, endDate),
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (vendorId) params.vendor_id = String(vendorId)
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
      const { data } = await api.get<DailyKickOverride[]>('/priority-list/overrides/', { params })
      return data
    },
  })
}

// ─── Priority List Mutations ─────────────────────────────────────────────────

/**
 * Reorder lines within a vendor/date/box-type bin.
 * Uses optimistic updates in the store - no query invalidation on success.
 * No success toast - this is a silent drag-and-drop operation.
 */
export function useReorderPriorityLines() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ReorderLinesInput) => {
      const { data } = await api.post('/priority-list/reorder/', {
        vendor_id: input.vendor_id,
        date: input.date,
        box_type: input.box_type,
        line_ids: input.line_ids,
      })
      return data
    },
    // No onSuccess invalidation - optimistic update handles UI
    // 30-second refetch interval keeps data in sync
    onError: () => {
      // On error, refetch to revert optimistic update
      queryClient.invalidateQueries({ queryKey: priorityListKeys.all })
      toast.error('Failed to reorder lines')
    },
  })
}

/**
 * Move a line to a different date.
 * Uses optimistic updates in the store - no query invalidation on success.
 * No success toast - this is a silent drag-and-drop operation.
 */
export function useMovePriorityLine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: MoveLineInput) => {
      const { data } = await api.post<PriorityLinePriority>('/priority-list/move/', {
        line_id: input.line_id,
        target_date: input.target_date,
        insert_at_sequence: input.insert_at_sequence ?? 0,
      })
      return data
    },
    // No onSuccess invalidation - optimistic update handles UI
    // 30-second refetch interval keeps data in sync
    onError: () => {
      // On error, refetch to revert optimistic update
      queryClient.invalidateQueries({ queryKey: priorityListKeys.all })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.error('Failed to move line')
    },
  })
}

/**
 * Sync PO lines to the priority list.
 * Creates entries for lines that don't have one, removes entries for completed lines.
 */
export function useSyncPriorityList() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ status: string; created: number; deleted: number }>(
        '/priority-list/sync/'
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priorityListKeys.all })
      toast.success('Priority list synced')
    },
    onError: () => {
      toast.error('Failed to sync priority list')
    },
  })
}

// ─── Allotment Mutations ─────────────────────────────────────────────────────

/**
 * Create or update a vendor kick allotment.
 */
export function useSetVendorAllotment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: VendorAllotmentInput) => {
      const { data } = await api.post<VendorKickAllotment>('/priority-list/allotments/', {
        vendor_id: input.vendor_id,
        box_type: input.box_type,
        daily_allotment: input.daily_allotment,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priorityListKeys.all })
      toast.success('Allotment saved')
    },
    onError: () => {
      toast.error('Failed to save allotment')
    },
  })
}

/**
 * Delete a vendor kick allotment.
 */
export function useDeleteVendorAllotment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (allotmentId: number) => {
      await api.delete(`/priority-list/allotments/${allotmentId}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priorityListKeys.all })
      toast.success('Allotment deleted')
    },
    onError: () => {
      toast.error('Failed to delete allotment')
    },
  })
}

// ─── Override Mutations ──────────────────────────────────────────────────────

/**
 * Create or update a daily kick override.
 */
export function useSetDailyOverride() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: DailyOverrideInput) => {
      const { data } = await api.post<DailyKickOverride>('/priority-list/overrides/', {
        vendor_id: input.vendor_id,
        box_type: input.box_type,
        date: input.date,
        allotment: input.allotment,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priorityListKeys.all })
      toast.success('Override saved')
    },
    onError: () => {
      toast.error('Failed to save override')
    },
  })
}

/**
 * Clear (delete) a daily override, reverting to the default allotment.
 */
export function useClearDailyOverride() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ClearOverrideInput) => {
      const { data } = await api.post('/priority-list/overrides/clear/', {
        vendor_id: input.vendor_id,
        box_type: input.box_type,
        date: input.date,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priorityListKeys.all })
      toast.success('Override cleared')
    },
    onError: () => {
      toast.error('Failed to clear override')
    },
  })
}

/**
 * Delete a daily override by ID.
 */
export function useDeleteDailyOverride() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (overrideId: number) => {
      await api.delete(`/priority-list/overrides/${overrideId}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priorityListKeys.all })
      toast.success('Override deleted')
    },
    onError: () => {
      toast.error('Failed to delete override')
    },
  })
}
