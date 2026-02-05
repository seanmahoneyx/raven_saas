import { memo, useMemo } from 'react'
import { DateSection } from './DateSection'
import { usePriorityListStore } from './usePriorityListStore'

interface VendorSectionProps {
  vendorId: number
  startDate: string
  endDate: string
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
}

/**
 * Generate all weekdays (Mon-Fri) between start and end dates inclusive.
 */
function getWeekdaysInRange(startDate: string, endDate: string): string[] {
  const weekdays: string[] = []
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')

  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    // 0 = Sunday, 6 = Saturday - skip weekends
    if (day !== 0 && day !== 6) {
      weekdays.push(current.toISOString().split('T')[0])
    }
    current.setDate(current.getDate() + 1)
  }

  return weekdays
}

/**
 * A vendor section showing all weekdays in the date range (always expanded).
 */
export const VendorSection = memo(function VendorSection({
  vendorId,
  startDate,
  endDate,
  selectedLineId,
  onSelectLine,
}: VendorSectionProps) {
  const vendor = usePriorityListStore((s) => s.vendors[vendorId])
  const bins = usePriorityListStore((s) => s.bins)

  // Generate all weekdays in the range
  const allWeekdays = useMemo(
    () => getWeekdaysInRange(startDate, endDate),
    [startDate, endDate]
  )

  if (!vendor) return null

  // Calculate totals for this vendor
  const totals = allWeekdays.reduce(
    (acc, date) => {
      // Find all bins for this vendor/date
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
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Vendor header - always visible, no collapse */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-900">{vendor.name}</span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">
            {totals.lines} {totals.lines === 1 ? 'line' : 'lines'}
          </span>
          <span className="font-medium text-gray-800">
            {totals.scheduled.toLocaleString()} kicks scheduled
          </span>
        </div>
      </div>

      {/* All weekdays - always visible */}
      <div className="divide-y divide-gray-100">
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
    </div>
  )
})
