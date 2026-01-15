import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type { CalendarOrder, TruckCalendar, Truck, HistoryRecord, DeliveryRun } from '@/types/api'

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

      const { data } = await api.patch<DeliveryRun>(`/calendar/runs/${runId}/`, payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
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
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderType, orderId, scheduledDate, scheduledTruckId, deliveryRunId }: UpdateScheduleParams) => {
      const payload: Record<string, unknown> = {
        scheduled_date: scheduledDate,
        scheduled_truck_id: scheduledTruckId,
      }
      if (deliveryRunId !== undefined) {
        payload.delivery_run_id = deliveryRunId
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
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}
