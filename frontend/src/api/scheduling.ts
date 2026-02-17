import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import type { CalendarOrder, TruckCalendar, Truck, HistoryRecord, DeliveryRun, SchedulerNote, NoteColor, ApiError } from '@/types/api'

// Polling interval as fallback when WebSocket is unavailable (30 seconds)
// Primary real-time updates come via WebSocket connection
const SYNC_INTERVAL = 30000

// Fetch calendar data for a date range
export function useCalendarRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['calendar', 'range', startDate, endDate],
    queryFn: async () => {
      const { data } = await api.get<TruckCalendar[]>('/calendar/range/', {
        params: { start_date: startDate, end_date: endDate }
      })
      return data
    },
    enabled: !!startDate && !!endDate,
    refetchInterval: SYNC_INTERVAL,
  })
}

// Fetch unscheduled orders
export function useUnscheduledOrders() {
  return useQuery({
    queryKey: ['calendar', 'unscheduled'],
    queryFn: async () => {
      const { data } = await api.get<CalendarOrder[]>('/calendar/unscheduled/')
      return data
    },
    refetchInterval: SYNC_INTERVAL,
  })
}

// Fetch trucks
export function useTrucks() {
  return useQuery({
    queryKey: ['calendar', 'trucks'],
    queryFn: async () => {
      const { data } = await api.get<Truck[]>('/calendar/trucks/')
      return data
    },
  })
}

// Fetch delivery runs for a date range
export function useDeliveryRuns(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['calendar', 'runs', startDate, endDate],
    queryFn: async () => {
      const { data } = await api.get<DeliveryRun[]>('/calendar/runs/', {
        params: { start_date: startDate, end_date: endDate }
      })
      return data
    },
    enabled: !!startDate && !!endDate,
    refetchInterval: SYNC_INTERVAL,
  })
}

// Create delivery run
interface CreateDeliveryRunParams {
  name: string
  truckId: number
  scheduledDate: string
  sequence?: number
  departureTime?: string | null
  notes?: string
}

export function useCreateDeliveryRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, truckId, scheduledDate, sequence, departureTime, notes }: CreateDeliveryRunParams) => {
      const { data } = await api.post<DeliveryRun>('/calendar/runs/create/', {
        name,
        truck_id: truckId,
        scheduled_date: scheduledDate,
        sequence: sequence ?? 1,
        departure_time: departureTime,
        notes: notes ?? '',
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.success('Delivery run created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create delivery run')
    },
  })
}

// Update delivery run
interface UpdateDeliveryRunParams {
  runId: number
  name?: string
  sequence?: number
  departureTime?: string | null
  notes?: string
  isComplete?: boolean
  scheduledDate?: string
  truckId?: number
}

export function useUpdateDeliveryRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ runId, ...updates }: UpdateDeliveryRunParams) => {
      const payload: Record<string, unknown> = {}
      if (updates.name !== undefined) payload.name = updates.name
      if (updates.sequence !== undefined) payload.sequence = updates.sequence
      if (updates.departureTime !== undefined) payload.departure_time = updates.departureTime
      if (updates.notes !== undefined) payload.notes = updates.notes
      if (updates.isComplete !== undefined) payload.is_complete = updates.isComplete
      if (updates.scheduledDate !== undefined) payload.scheduled_date = updates.scheduledDate
      if (updates.truckId !== undefined) payload.truck_id = updates.truckId

      const { data } = await api.patch<DeliveryRun>(`/calendar/runs/${runId}/`, payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.success('Delivery run updated')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to update delivery run')
    },
  })
}

// Delete delivery run
export function useDeleteDeliveryRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (runId: number) => {
      await api.delete(`/calendar/runs/${runId}/delete/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.success('Delivery run deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete delivery run')
    },
  })
}

// Update order schedule
interface UpdateScheduleParams {
  orderType: 'SO' | 'PO'
  orderId: number
  scheduledDate: string | null
  scheduledTruckId: number | null
  deliveryRunId?: number | null
  schedulerSequence?: number
  isPickup?: boolean
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderType, orderId, scheduledDate, scheduledTruckId, deliveryRunId, schedulerSequence, isPickup }: UpdateScheduleParams) => {
      const payload: Record<string, unknown> = {
        scheduled_date: scheduledDate,
        scheduled_truck_id: scheduledTruckId,
      }
      if (deliveryRunId !== undefined) {
        payload.delivery_run_id = deliveryRunId
      }
      if (schedulerSequence !== undefined) {
        payload.scheduler_sequence = schedulerSequence
      }
      if (isPickup !== undefined) {
        payload.is_pickup = isPickup
      }
      const { data } = await api.post<CalendarOrder>(
        `/calendar/update/${orderType}/${orderId}/`,
        payload
      )
      return data
    },
    onSuccess: () => {
      // Invalidate calendar queries to refetch
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to update schedule')
    },
  })
}

// Batch update multiple orders' schedules (invalidates once at end)
interface BatchUpdateScheduleParams {
  orders: Array<{
    orderType: 'SO' | 'PO'
    orderId: number
    scheduledDate: string | null
    scheduledTruckId: number | null
    deliveryRunId?: number | null
    schedulerSequence?: number
  }>
}

export function useBatchUpdateSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orders }: BatchUpdateScheduleParams) => {
      // Update all orders sequentially without triggering intermediate invalidations
      const results: CalendarOrder[] = []
      for (const { orderType, orderId, scheduledDate, scheduledTruckId, deliveryRunId, schedulerSequence } of orders) {
        const payload: Record<string, unknown> = {
          scheduled_date: scheduledDate,
          scheduled_truck_id: scheduledTruckId,
        }
        if (deliveryRunId !== undefined) {
          payload.delivery_run_id = deliveryRunId
        }
        if (schedulerSequence !== undefined) {
          payload.scheduler_sequence = schedulerSequence
        }
        const { data } = await api.post<CalendarOrder>(
          `/calendar/update/${orderType}/${orderId}/`,
          payload
        )
        results.push(data)
      }
      return results
    },
    onSuccess: () => {
      // Invalidate calendar queries only once after all updates complete
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to update schedule')
    },
  })
}

// Update order status
interface UpdateStatusParams {
  orderType: 'SO' | 'PO'
  orderId: number
  status: string
}

export function useUpdateStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderType, orderId, status }: UpdateStatusParams) => {
      const endpoint = orderType === 'SO' ? 'sales-orders' : 'purchase-orders'
      const { data } = await api.patch(`/${endpoint}/${orderId}/`, { status })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.success('Status updated')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to update status')
    },
  })
}

// Update order notes
interface UpdateNotesParams {
  orderType: 'SO' | 'PO'
  orderId: number
  notes: string
}

export function useUpdateNotes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderType, orderId, notes }: UpdateNotesParams) => {
      const endpoint = orderType === 'SO' ? 'sales-orders' : 'purchase-orders'
      const { data } = await api.patch(`/${endpoint}/${orderId}/`, { notes })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to save notes')
    },
  })
}

// Fetch global activity history
export function useGlobalHistory(limit = 50) {
  return useQuery({
    queryKey: ['calendar', 'history', limit],
    queryFn: async () => {
      const { data } = await api.get<HistoryRecord[]>('/calendar/history/', {
        params: { limit }
      })
      return data
    },
    refetchInterval: 10000, // Refresh every 10 seconds for real-time audit trail
  })
}

// ==================== SCHEDULER NOTES ====================

// Fetch scheduler notes for a date range
export function useSchedulerNotes(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['calendar', 'notes', startDate, endDate],
    queryFn: async () => {
      const { data } = await api.get<SchedulerNote[]>('/calendar/notes/', {
        params: { start_date: startDate, end_date: endDate }
      })
      return data
    },
    enabled: !!startDate && !!endDate,
    refetchInterval: SYNC_INTERVAL,
  })
}

// Create scheduler note
interface CreateNoteParams {
  content: string
  color?: NoteColor
  scheduledDate?: string | null
  truckId?: number | null
  deliveryRunId?: number | null
  salesOrderId?: number | null
  purchaseOrderId?: number | null
  isPinned?: boolean
}

export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateNoteParams) => {
      const payload: Record<string, unknown> = {
        content: params.content,
        color: params.color ?? 'yellow',
        is_pinned: params.isPinned ?? false,
      }
      if (params.scheduledDate !== undefined) payload.scheduled_date = params.scheduledDate
      if (params.truckId !== undefined) payload.truck_id = params.truckId
      if (params.deliveryRunId !== undefined) payload.delivery_run_id = params.deliveryRunId
      if (params.salesOrderId !== undefined) payload.sales_order_id = params.salesOrderId
      if (params.purchaseOrderId !== undefined) payload.purchase_order_id = params.purchaseOrderId

      const { data } = await api.post<SchedulerNote>('/calendar/notes/create/', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'notes'] })
      toast.success('Note created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create note')
    },
  })
}

// Update scheduler note
interface UpdateNoteParams {
  noteId: number
  content?: string
  color?: NoteColor
  isPinned?: boolean
  scheduledDate?: string | null
  truckId?: number | null
}

export function useUpdateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ noteId, ...updates }: UpdateNoteParams) => {
      const payload: Record<string, unknown> = {}
      if (updates.content !== undefined) payload.content = updates.content
      if (updates.color !== undefined) payload.color = updates.color
      if (updates.isPinned !== undefined) payload.is_pinned = updates.isPinned
      if (updates.scheduledDate !== undefined) payload.scheduled_date = updates.scheduledDate
      if (updates.truckId !== undefined) payload.truck_id = updates.truckId

      const { data } = await api.patch<SchedulerNote>(`/calendar/notes/${noteId}/`, payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'notes'] })
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to update note')
    },
  })
}

// Delete scheduler note
export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (noteId: number) => {
      await api.delete(`/calendar/notes/${noteId}/delete/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'notes'] })
      toast.success('Note deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete note')
    },
  })
}

// ==================== SHIPMENT CREATION ====================

// Create shipment from delivery run
export function useCreateShipmentFromRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (deliveryRunId: number) => {
      const { data } = await api.post(`/delivery-runs/${deliveryRunId}/create-shipment/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      queryClient.invalidateQueries({ queryKey: ['delivery-runs'] })
      toast.success('Shipment created from delivery run')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create shipment')
    },
  })
}
