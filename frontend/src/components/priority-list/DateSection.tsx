import { memo, useState, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { BoxTypeBin } from './BoxTypeBin'
import { OverridePopover } from './OverridePopover'
import { usePriorityListStore, parseBinId } from './usePriorityListStore'
import type { BoxType } from '@/types/api'

// Box type sort order: RSC first, then DC, then others alphabetically
const BOX_TYPE_ORDER: Record<string, number> = {
  RSC: 1,
  DC: 2,
  HSC: 3,
  FOL: 4,
  TELE: 5,
  OTHER: 6,
}

interface DateSectionProps {
  vendorId: number
  date: string
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
}

/**
 * A date section showing box type bins (always expanded).
 * Shows empty drop zone if no orders for this day.
 */
export const DateSection = memo(function DateSection({
  vendorId,
  date,
  selectedLineId,
  onSelectLine,
}: DateSectionProps) {
  const bins = usePriorityListStore((s) => s.bins)

  const [overridePopover, setOverridePopover] = useState<{
    vendorId: number
    boxType: BoxType
    date: string
  } | null>(null)

  // Get bins for this vendor/date, sorted by box type (RSC first, then DC, etc.)
  const binIds = useMemo(() => {
    return Object.keys(bins)
      .filter((binId) => {
        const parsed = parseBinId(binId)
        return parsed && parsed.vendorId === vendorId && parsed.date === date
      })
      .sort((a, b) => {
        const parsedA = parseBinId(a)
        const parsedB = parseBinId(b)
        const orderA = parsedA ? (BOX_TYPE_ORDER[parsedA.boxType] ?? 99) : 99
        const orderB = parsedB ? (BOX_TYPE_ORDER[parsedB.boxType] ?? 99) : 99
        return orderA - orderB
      })
  }, [bins, vendorId, date])

  // Format date for display
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  // Calculate totals for this date
  const totals = binIds.reduce(
    (acc, binId) => {
      const bin = bins[binId]
      if (bin) {
        acc.lines += bin.lines.length
        acc.scheduled += bin.scheduled_qty
        acc.allotment += bin.allotment
      }
      return acc
    },
    { lines: 0, scheduled: 0, allotment: 0 }
  )

  // Check if this is today
  const today = new Date().toISOString().split('T')[0]
  const isToday = date === today
  const isPast = date < today

  // Droppable for empty day slots
  const { setNodeRef, isOver } = useDroppable({
    id: `empty-day-${vendorId}-${date}`,
    data: { vendorId, date, isEmpty: true },
  })

  return (
    <div className={`${isPast ? 'bg-gray-50' : ''}`}>
      {/* Date header - compact inline */}
      <div className={`flex items-center gap-4 px-4 py-2 ${isToday ? 'bg-yellow-50' : ''}`}>
        <span className={`font-medium min-w-[100px] ${isToday ? 'text-yellow-700' : 'text-gray-700'}`}>
          {formatDate(date)}
          {isToday && <span className="ml-2 text-xs bg-yellow-200 px-1.5 py-0.5 rounded">Today</span>}
        </span>

        {totals.lines > 0 ? (
          <span className="text-sm text-gray-500">
            {totals.lines} lines • {totals.scheduled.toLocaleString()} kicks
          </span>
        ) : (
          <span className="text-sm text-gray-400 italic">No orders scheduled</span>
        )}
      </div>

      {/* Box type bins or empty drop zone */}
      <div className="px-4 pb-2">
        {binIds.length === 0 ? (
          // Empty drop zone for days with no orders
          <div
            ref={setNodeRef}
            className={`
              border-2 border-dashed rounded-lg py-4 text-center text-sm
              ${isOver ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400'}
            `}
          >
            {isOver ? 'Drop here to schedule' : 'Drag orders here'}
          </div>
        ) : (
          <div className="space-y-1">
            {binIds.map((binId) => {
              const bin = bins[binId]
              if (!bin) return null

              const parsed = parseBinId(binId)
              if (!parsed) return null

              return (
                <BoxTypeBin
                  key={binId}
                  vendorId={vendorId}
                  date={date}
                  bin={bin}
                  onEditOverride={() =>
                    setOverridePopover({
                      vendorId,
                      boxType: parsed.boxType,
                      date,
                    })
                  }
                  selectedLineId={selectedLineId}
                  onSelectLine={onSelectLine}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Override popover */}
      {overridePopover && (
        <OverridePopover
          vendorId={overridePopover.vendorId}
          boxType={overridePopover.boxType}
          date={overridePopover.date}
          onClose={() => setOverridePopover(null)}
        />
      )}
    </div>
  )
})
