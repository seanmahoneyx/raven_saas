import { useMemo, useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PriorityListView } from '@/components/priority-list/PriorityListView'
import { format, addWeeks, startOfWeek } from 'date-fns'

export default function PriorityList() {
  usePageTitle('Priority List')

  // Date range state (default: current week + 2 weeks ahead)
  const [weekOffset, setWeekOffset] = useState(0)

  const { startDate, endDate, displayRange } = useMemo(() => {
    const today = new Date()
    const baseStart = startOfWeek(today, { weekStartsOn: 1 }) // Monday
    const start = addWeeks(baseStart, weekOffset)
    const end = addWeeks(start, 2) // Show 2 weeks

    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
      displayRange: `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`,
    }
  }, [weekOffset])

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700 shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            {/* Icon */}
            <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white">
                <path fillRule="evenodd" d="M10 2a.75.75 0 01.75.75v.258a33.186 33.186 0 016.668.83.75.75 0 01-.336 1.461 31.28 31.28 0 00-1.103-.232l1.702 7.545a.75.75 0 01-.387.832A4.981 4.981 0 0115 14c-.825 0-1.606-.2-2.294-.556a.75.75 0 01-.387-.832l1.77-7.849a31.743 31.743 0 00-3.339-.254v11.505a20.01 20.01 0 013.78.501.75.75 0 11-.339 1.462A18.558 18.558 0 0010 17.5c-1.442 0-2.845.165-4.191.477a.75.75 0 01-.338-1.462 20.01 20.01 0 013.779-.501V4.509c-1.129.026-2.243.112-3.34.254l1.771 7.85a.75.75 0 01-.387.83A4.981 4.981 0 015 14a4.981 4.981 0 01-2.294-.556.75.75 0 01-.387-.832L4.02 5.067c-.37.07-.738.148-1.103.232a.75.75 0 01-.336-1.462 33.053 33.053 0 016.668-.829V2.75A.75.75 0 0110 2zM5 12.118l-1.35-5.988a23.738 23.738 0 012.7 0L5 12.118zm10 0l-1.35-5.988a23.738 23.738 0 012.7 0L15 12.118z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white tracking-tight">
                Priority List
              </h1>
              <p className="text-xs text-slate-400">
                Manage vendor production priorities
              </p>
            </div>
          </div>

          {/* Date range navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((prev) => prev - 1)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
              title="Previous weeks"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="px-3 py-1 bg-slate-700 rounded text-sm text-white font-medium">
              {displayRange}
            </div>

            <button
              onClick={() => setWeekOffset((prev) => prev + 1)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
              title="Next weeks"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button
              onClick={() => setWeekOffset(0)}
              className="ml-2 px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded"
            >
              Today
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          <PriorityListView startDate={startDate} endDate={endDate} />
        </div>
      </div>
    </ErrorBoundary>
  )
}
