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
    if (day !== 0 && day !== 6) {
      weekdays.push(current.toISOString().split('T')[0])
    }
    current.setDate(current.getDate() + 1)
  }

  return weekdays
}

/**
 * Deterministic color from vendor name for pill badge.
 */
function vendorColor(name: string): string {
  const colors = [
    'bg-blue-100 text-blue-800 border-blue-200',
    'bg-emerald-100 text-emerald-800 border-emerald-200',
    'bg-violet-100 text-violet-800 border-violet-200',
    'bg-amber-100 text-amber-800 border-amber-200',
    'bg-rose-100 text-rose-800 border-rose-200',
    'bg-cyan-100 text-cyan-800 border-cyan-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

/**
 * A vendor section showing all weekdays in the date range.
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

  const colorClass = vendorColor(vendor.name)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Vendor header with pill badge */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full border ${colorClass}`}>
            {vendor.name}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            {totals.lines} {totals.lines === 1 ? 'line' : 'lines'}
          </span>
          <span className="font-mono font-medium text-gray-800 bg-white px-2 py-0.5 rounded border border-gray-200">
            {totals.scheduled.toLocaleString()} kicks
          </span>
        </div>
      </div>

      {/* All weekdays */}
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
