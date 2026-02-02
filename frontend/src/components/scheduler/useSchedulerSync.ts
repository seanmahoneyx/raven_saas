import { useEffect, useRef } from 'react'
import { useCalendarRange, useUnscheduledOrders, useTrucks, useDeliveryRuns, useSchedulerNotes } from '@/api/scheduling'
import { useSchedulerStore } from './useSchedulerStore'
import { transformApiToHydratePayload } from './transforms'
import type { CalendarOrder, SchedulerNote, Truck } from '@/types/api'

interface UseSchedulerSyncOptions {
  startDate: string
  endDate: string
}

interface UseSchedulerSyncResult {
  // Loading states
  isLoading: boolean
  isError: boolean
  error: Error | null

  // Unscheduled orders (not in store, separate concern)
  unscheduledOrders: CalendarOrder[]

  // Notes (for now kept separate, will integrate later)
  notes: SchedulerNote[]

  // Trucks for display purposes
  trucks: Truck[]

  // Refetch function
  refetch: () => void
}

export function useSchedulerSync({ startDate, endDate }: UseSchedulerSyncOptions): UseSchedulerSyncResult {
  const hydrate = useSchedulerStore((state) => state.hydrate)
  const mergeHydrate = useSchedulerStore((state) => state.mergeHydrate)
  const hydrateNotes = useSchedulerStore((state) => state.hydrateNotes)

  // Track if initial hydration has been done
  const isInitialHydrateDone = useRef(false)

  // Fetch data from API
  const calendarQuery = useCalendarRange(startDate, endDate)
  const unscheduledQuery = useUnscheduledOrders()
  const trucksQuery = useTrucks()
  const runsQuery = useDeliveryRuns(startDate, endDate)
  const notesQuery = useSchedulerNotes(startDate, endDate)

  // Aggregate loading and error states
  const isLoading = calendarQuery.isLoading || trucksQuery.isLoading || runsQuery.isLoading
  const isError = calendarQuery.isError || trucksQuery.isError || runsQuery.isError
  const error = calendarQuery.error || trucksQuery.error || runsQuery.error

  // Hydrate store when data changes
  // Use full hydrate for initial load, then mergeHydrate for polling updates
  useEffect(() => {
    if (calendarQuery.data && trucksQuery.data && runsQuery.data) {
      const payload = transformApiToHydratePayload(
        calendarQuery.data,
        runsQuery.data,
        trucksQuery.data
      )

      if (!isInitialHydrateDone.current) {
        // First load: full hydrate to initialize state
        hydrate(payload)
        isInitialHydrateDone.current = true
      } else {
        // Subsequent polling updates: merge to preserve local changes
        mergeHydrate(payload)
      }
    }
  }, [calendarQuery.data, trucksQuery.data, runsQuery.data, hydrate, mergeHydrate])

  // Hydrate notes when available
  useEffect(() => {
    if (notesQuery.data) {
      const transformedNotes = notesQuery.data.map((note) => ({
        id: note.id.toString(),
        content: note.content,
        color: note.color,
        scheduledDate: note.scheduled_date,
        truckId: note.truck_id?.toString() ?? null,
        deliveryRunId: note.delivery_run_id?.toString() ?? null,
        isPinned: note.is_pinned,
        createdBy: note.created_by_username,
      }))
      hydrateNotes(transformedNotes)
    }
  }, [notesQuery.data, hydrateNotes])

  // Refetch all queries
  const refetch = () => {
    calendarQuery.refetch()
    unscheduledQuery.refetch()
    trucksQuery.refetch()
    runsQuery.refetch()
    notesQuery.refetch()
  }

  return {
    isLoading,
    isError,
    error: error as Error | null,
    unscheduledOrders: unscheduledQuery.data ?? [],
    notes: notesQuery.data ?? [],
    trucks: trucksQuery.data ?? [],
    refetch,
  }
}
