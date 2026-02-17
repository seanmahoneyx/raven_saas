import { useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { ScheduleView } from '@/components/scheduler/ScheduleView'
import { FilterBar } from '@/components/scheduler/FilterBar'
import { HistoryPanel } from '@/components/scheduler/HistoryPanel'
import { OrderDetailModal } from '@/components/scheduler/OrderDetailModal'
import { useSchedulerSync } from '@/components/scheduler/useSchedulerSync'
import { useSchedulerWebSocket } from '@/hooks/useSchedulerWebSocket'
import { format, addWeeks, startOfWeek } from 'date-fns'

export default function Scheduler() {
  usePageTitle('Scheduler')

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

  // Connect to WebSocket for real-time updates
  const { isConnected, connectionState } = useSchedulerWebSocket()

  if (isError) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-red-600">Error loading scheduler: {error?.message}</div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-100">
        {/* Header */}
        <div className="flex items-center px-5 py-3 bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700 shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white">
                <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-white tracking-wide">Schedulizer</h1>
              <p className="text-[11px] text-slate-400">
                Drag orders to schedule &middot; Double-click for details &middot; Right-click for notes
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* WebSocket connection status */}
            <div className="flex items-center gap-1.5" title={`WebSocket: ${connectionState}`}>
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected
                    ? 'bg-green-400'
                    : connectionState === 'connecting'
                    ? 'bg-yellow-400 animate-pulse'
                    : 'bg-red-400'
                }`}
              />
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                {isConnected ? 'Live' : connectionState === 'connecting' ? 'Connecting' : 'Offline'}
              </span>
            </div>

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-500 border-t-amber-400" />
                <span className="text-xs">Syncing...</span>
              </div>
            )}
          </div>
        </div>

        <FilterBar />

        <div className="flex-1 overflow-hidden">
          <ScheduleView />
        </div>

        <HistoryPanel />
        <OrderDetailModal />
      </div>
    </ErrorBoundary>
  )
}
