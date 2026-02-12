import { memo, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { DateSection } from './DateSection'
import { usePriorityListStore } from './usePriorityListStore'

interface VendorSectionProps {
  vendorId: number
  startDate: string
  endDate: string
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
}

function getWeekdaysInRange(startDate: string, endDate: string): string[] {
  const weekdays: string[] = []
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) {
      weekdays.push(current.toISOString().split('T')[0])
    }
    current.setDate(current.getDate() + 1)
  }
  return weekdays
}

export const VendorSection = memo(function VendorSection({
  vendorId,
  startDate,
  endDate,
  selectedLineId,
  onSelectLine,
}: VendorSectionProps) {
  const vendor = usePriorityListStore((s) => s.vendors[vendorId])
  const bins = usePriorityListStore((s) => s.bins)
  const [isExpanded, setIsExpanded] = useState(false)

  const allWeekdays = useMemo(
    () => getWeekdaysInRange(startDate, endDate),
    [startDate, endDate]
  )

  if (!vendor) return null

  const totals = allWeekdays.reduce(
    (acc, date) => {
      for (const [binId, bin] of Object.entries(bins)) {
        if (binId.startsWith(`${vendorId}|${date}|`)) {
          acc.lines += bin.lines.length
          acc.scheduled += bin.scheduled_qty
        }
      }
      return acc
    },
    { lines: 0, scheduled: 0 }
  )

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Vendor header - clickable to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-semibold text-base">{vendor.name}</span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            {totals.lines} {totals.lines === 1 ? 'line' : 'lines'}
          </span>
          <span className="font-mono font-medium px-2 py-0.5 rounded bg-muted">
            {totals.scheduled.toLocaleString()} kicks
          </span>
        </div>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="border-t divide-y">
          {allWeekdays.map((date) => (
            <DateSection
              key={date}
              vendorId={vendorId}
              date={date}
              selectedLineId={selectedLineId}
              onSelectLine={onSelectLine}
            />
          ))}
        </div>
      )}
    </div>
  )
})
