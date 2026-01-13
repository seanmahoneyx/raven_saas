import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'
import type { CalendarOrder, TruckCalendar, Truck } from '@/types/api'

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

// Update order schedule
interface UpdateScheduleParams {
  orderType: 'SO' | 'PO'
  orderId: number
  scheduledDate: string | null
  scheduledTruckId: number | null
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderType, orderId, scheduledDate, scheduledTruckId }: UpdateScheduleParams) => {
      const { data } = await api.post<CalendarOrder>(
        `/calendar/update/${orderType}/${orderId}/`,
        {
          scheduled_date: scheduledDate,
          scheduled_truck_id: scheduledTruckId,
        }
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
