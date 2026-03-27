import { memo, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { DateSection } from './DateSection'
import { usePriorityListStore, parseBinId } from './usePriorityListStore'
import { BOX_TYPE_ORDER } from './constants'
import type { BoxType } from '@/types/api'

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

/** Display names for box types */
const BOX_TYPE_LABELS: Record<string, string> = {
  RSC: 'RSC',
  DC: 'D/C',
  HSC: 'HSC',
  FOL: 'Folder',
  TELE: 'Telescope',
  OTHER: 'Other',
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
  const [isExpanded, setIsExpanded] = useState(true)
  const [activeBoxType, setActiveBoxType] = useState<BoxType | null>(null)

  const allWeekdays = useMemo(
    () => getWeekdaysInRange(startDate, endDate),
    [startDate, endDate]
  )

  if (!vendor) return null

  // Derive available box types for this vendor (across all dates)
  const availableBoxTypes = useMemo(() => {
    const types = new Set<BoxType>()
    for (const [binId, bin] of Object.entries(bins)) {
      if (binId.startsWith(`${vendorId}|`) && bin.lines.length > 0) {
        const parsed = parseBinId(binId)
        if (parsed) types.add(parsed.boxType)
      }
    }
    return Array.from(types).sort(
      (a, b) => (BOX_TYPE_ORDER[a] ?? 99) - (BOX_TYPE_ORDER[b] ?? 99)
    )
  }, [bins, vendorId])

  // Line/kick counts per box type (for tab badges)
  const boxTypeCounts = useMemo(() => {
    const counts: Record<string, { lines: number; scheduled: number }> = {}
    for (const [binId, bin] of Object.entries(bins)) {
      if (binId.startsWith(`${vendorId}|`)) {
        const parsed = parseBinId(binId)
        if (parsed) {
          if (!counts[parsed.boxType]) counts[parsed.boxType] = { lines: 0, scheduled: 0 }
          counts[parsed.boxType].lines += bin.lines.length
          counts[parsed.boxType].scheduled += bin.scheduled_qty
        }
      }
    }
    return counts
  }, [bins, vendorId])

  // Auto-select first tab if current selection has no data
  const effectiveBoxType = useMemo(() => {
    if (activeBoxType && availableBoxTypes.includes(activeBoxType)) return activeBoxType
    return availableBoxTypes[0] ?? null
  }, [activeBoxType, availableBoxTypes])

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

  const showTabs = availableBoxTypes.length > 1

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
        <>
          {/* Box type tabs */}
          {showTabs && (
            <div className="border-t border-b bg-muted/30 px-4 flex items-center gap-0 overflow-x-auto">
              {availableBoxTypes.map((boxType) => {
                const isActive = boxType === effectiveBoxType
                const count = boxTypeCounts[boxType]
                return (
                  <button
                    key={boxType}
                    onClick={() => setActiveBoxType(boxType)}
                    className={`
                      relative px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap
                      ${isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                      }
                    `}
                  >
                    {BOX_TYPE_LABELS[boxType] ?? boxType}
                    {count && (
                      <span className={`ml-1.5 text-xs tabular-nums ${isActive ? 'text-foreground/70' : 'text-muted-foreground/70'}`}>
                        ({count.lines})
                      </span>
                    )}
                    {/* Active indicator bar */}
                    {isActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style={{ backgroundColor: 'var(--so-primary, #2563eb)' }} />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <div className={`${showTabs ? '' : 'border-t'} divide-y`}>
            {allWeekdays.map((date) => (
              <DateSection
                key={date}
                vendorId={vendorId}
                date={date}
                boxTypeFilter={showTabs ? effectiveBoxType : null}
                selectedLineId={selectedLineId}
                onSelectLine={onSelectLine}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
})
