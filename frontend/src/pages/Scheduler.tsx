import { useMemo } from 'react'
import { ScheduleView } from '@/components/scheduler/ScheduleView'
import { useSchedulerSync } from '@/components/scheduler/useSchedulerSync'
import { format, addWeeks, startOfWeek } from 'date-fns'

export default function Scheduler() {
  // Calculate date range (4 weeks from start of current week)
  const { startDate, endDate } = useMemo(() => {
    const today = new Date()
    const start = startOfWeek(today, { weekStartsOn: 1 }) // Monday
    const end = addWeeks(start, 4)
    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    }
  }, [])

  // Use the sync hook to fetch data and hydrate the store
  const { isLoading, isError, error } = useSchedulerSync({
    startDate,
    endDate,
  })

  if (isError) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-red-600">Error loading scheduler: {error?.message}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="flex items-center px-4 py-2 border-b border-amber-200 bg-white shrink-0">
        <div>
          <h1 className="text-lg font-bold text-stone-900">RAVEN SCHEDULIZER</h1>
          <p className="text-xs text-stone-500">
            Multi-Week Workbench — Drag to cell = loose. Drag to run = committed. Right-click for notes/lock.
          </p>
        </div>
        {isLoading && (
          <div className="ml-auto flex items-center gap-2 text-sm text-stone-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600" />
            Loading...
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <ScheduleView />
      </div>
    </div>
  )
}
