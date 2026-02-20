import { useMemo, useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { PriorityListView } from '@/components/priority-list/PriorityListView'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, addWeeks, startOfWeek } from 'date-fns'

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }

export default function PriorityList() {
  usePageTitle('Priority List')

  const [weekOffset, setWeekOffset] = useState(0)

  const { startDate, endDate, displayRange } = useMemo(() => {
    const today = new Date()
    const baseStart = startOfWeek(today, { weekStartsOn: 1 })
    const start = addWeeks(baseStart, weekOffset)
    const end = addWeeks(start, 2)

    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
      displayRange: `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`,
    }
  }, [weekOffset])

  return (
    <ErrorBoundary>
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">
          {/* Header */}
          <div className="flex items-center justify-between mb-7 animate-in">
            <div>
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Priority List</h1>
              <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
                Manage vendor production priorities
              </p>
            </div>

            {/* Date range navigation */}
            <div className="flex items-center gap-2">
              <button
                className={outlineBtnClass + ' !px-2'}
                style={outlineBtnStyle}
                onClick={() => setWeekOffset((prev) => prev - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="px-4 py-2 rounded-md text-[13px] font-medium min-w-[200px] text-center"
                style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-primary)' }}>
                {displayRange}
              </div>

              <button
                className={outlineBtnClass + ' !px-2'}
                style={outlineBtnStyle}
                onClick={() => setWeekOffset((prev) => prev + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => setWeekOffset(0)}
              >
                Today
              </button>
            </div>
          </div>

          {/* Main content */}
          <div className="animate-in delay-1">
            <PriorityListView startDate={startDate} endDate={endDate} />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
