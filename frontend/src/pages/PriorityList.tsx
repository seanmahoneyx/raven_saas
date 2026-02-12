import { useMemo, useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PriorityListView } from '@/components/priority-list/PriorityListView'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { format, addWeeks, startOfWeek } from 'date-fns'

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
      <div className="p-8">
        {/* Standard page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Priority List</h1>
            <p className="text-muted-foreground">
              Manage vendor production priorities
            </p>
          </div>

          {/* Date range navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeekOffset((prev) => prev - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="px-4 py-2 border rounded-md text-sm font-medium min-w-[200px] text-center">
              {displayRange}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeekOffset((prev) => prev + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekOffset(0)}
            >
              Today
            </Button>
          </div>
        </div>

        {/* Main content */}
        <PriorityListView startDate={startDate} endDate={endDate} />
      </div>
    </ErrorBoundary>
  )
}
